use crate::models::{AccountRecord, AuditEntry, StoredState};
use chrono::{Duration, Utc};
use dirs::{data_local_dir, download_dir};
use keyring::Entry;
use std::fs;
use std::path::PathBuf;

const APP_DIR_NAME: &str = "github-action-management";
const STATE_FILE_NAME: &str = "state.json";
const KEYRING_SERVICE: &str = "github-action-management";

fn app_dir() -> Result<PathBuf, String> {
    let base = data_local_dir().ok_or("Unable to resolve local data directory")?;
    let dir = base.join(APP_DIR_NAME);
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

fn state_file() -> Result<PathBuf, String> {
    Ok(app_dir()?.join(STATE_FILE_NAME))
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
    Entry::new(KEYRING_SERVICE, account_id)
        .map_err(|err| err.to_string())?
        .set_password(token)
        .map_err(|err| err.to_string())
}

pub fn read_token(account_id: &str) -> Result<String, String> {
    Entry::new(KEYRING_SERVICE, account_id)
        .map_err(|err| err.to_string())?
        .get_password()
        .map_err(|err| err.to_string())
}

pub fn delete_token(account_id: &str) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, account_id).map_err(|err| err.to_string())?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(err) => {
            let message = err.to_string();
            if message.contains("No entry found") {
                Ok(())
            } else {
                Err(message)
            }
        }
    }
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
