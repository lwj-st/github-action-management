use crate::models::{AccountRecord, AuditEntry, StoredState};
use chrono::{Duration, Utc};
use dirs::{data_local_dir, download_dir};
use rusqlite::{params, Connection, OptionalExtension};
use std::fs;
use std::path::PathBuf;

const APP_DIR_NAME: &str = "github-action-management";
const STATE_FILE_NAME: &str = "state.json";
const TOKEN_DB_FILE_NAME: &str = "tokens.db";

fn app_dir() -> Result<PathBuf, String> {
    let base = data_local_dir().ok_or("Unable to resolve local data directory")?;
    let dir = base.join(APP_DIR_NAME);
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

fn state_file() -> Result<PathBuf, String> {
    Ok(app_dir()?.join(STATE_FILE_NAME))
}

fn token_db_file() -> Result<PathBuf, String> {
    Ok(app_dir()?.join(TOKEN_DB_FILE_NAME))
}

fn open_token_db() -> Result<Connection, String> {
    let connection = Connection::open(token_db_file()?).map_err(|err| err.to_string())?;
    connection
        .execute_batch(
            "
            CREATE TABLE IF NOT EXISTS account_tokens (
              account_id TEXT PRIMARY KEY,
              token TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            ",
        )
        .map_err(|err| err.to_string())?;
    Ok(connection)
}

pub fn downloads_dir() -> PathBuf {
    download_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("github-actions-artifacts")
}

pub fn load_state() -> Result<StoredState, String> {
    let path = state_file()?;
    if !path.exists() {
        return Ok(StoredState::default());
    }

    let content = fs::read_to_string(path).map_err(|err| err.to_string())?;
    serde_json::from_str(&content).map_err(|err| err.to_string())
}

pub fn save_state(state: &StoredState) -> Result<(), String> {
    let path = state_file()?;
    let content = serde_json::to_string_pretty(state).map_err(|err| err.to_string())?;
    fs::write(path, content).map_err(|err| err.to_string())
}

pub fn store_token(account_id: &str, token: &str) -> Result<(), String> {
    open_token_db()?
        .execute(
            "
            INSERT INTO account_tokens (account_id, token, updated_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(account_id) DO UPDATE SET
              token = excluded.token,
              updated_at = excluded.updated_at
            ",
            params![account_id, token, Utc::now().to_rfc3339()],
        )
        .map_err(|err| err.to_string())
        .map(|_| ())
}

pub fn read_token(account_id: &str) -> Result<String, String> {
    open_token_db()?
        .query_row(
            "SELECT token FROM account_tokens WHERE account_id = ?1",
            params![account_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|err| err.to_string())?
        .ok_or("Token not found in local database".to_string())
}

pub fn delete_token(account_id: &str) -> Result<(), String> {
    open_token_db()?
        .execute(
            "DELETE FROM account_tokens WHERE account_id = ?1",
            params![account_id],
        )
        .map_err(|err| err.to_string())
        .map(|_| ())
}

pub fn token_status(account: &AccountRecord) -> String {
    match account.last_used_at.as_deref() {
        Some(last_used) => {
            let timestamp = chrono::DateTime::parse_from_rfc3339(last_used)
                .map(|value| value.with_timezone(&Utc));
            match timestamp {
                Ok(value) if Utc::now() - value > Duration::days(30) => "expiring".to_string(),
                Ok(_) => "healthy".to_string(),
                Err(_) => "healthy".to_string(),
            }
        }
        None => "healthy".to_string(),
    }
}

pub fn append_audit_entry(
    state: &mut StoredState,
    action: &str,
    message: &str,
    account_id: Option<String>,
    repo_full_name: Option<String>,
    run_id: Option<i64>,
) {
    state.audit_entries.insert(
        0,
        AuditEntry {
            id: uuid::Uuid::new_v4().to_string(),
            action: action.to_string(),
            message: message.to_string(),
            account_id,
            repo_full_name,
            run_id,
            created_at: Utc::now().to_rfc3339(),
        },
    );
    state.audit_entries.truncate(200);
}
