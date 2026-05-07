use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountRecord {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountSummary {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
    pub token_status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepositoryOwner {
    pub login: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repository {
    pub id: i64,
    pub name: String,
    pub full_name: String,
    pub private: bool,
    pub language: Option<String>,
    pub updated_at: String,
    pub default_branch: String,
    pub owner: RepositoryOwner,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Branch {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workflow {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub state: String,
    pub created_at: String,
    pub updated_at: String,
    pub html_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowInput {
    pub name: String,
    pub label: String,
    pub description: Option<String>,
    pub required: bool,
    #[serde(rename = "type")]
    pub input_type: String,
    pub options: Vec<String>,
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowDetails {
    pub workflow: Workflow,
    pub inputs: Vec<WorkflowInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Run {
    pub id: i64,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub html_url: String,
    pub head_branch: String,
    pub head_sha: String,
    pub workflow_id: i64,
    pub display_title: Option<String>,
    pub event: Option<String>,
    pub run_attempt: Option<i64>,
    pub check_suite_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Step {
    pub name: String,
    pub status: Option<String>,
    pub conclusion: Option<String>,
    pub number: Option<i32>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: i64,
    pub run_id: i64,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub html_url: Option<String>,
    pub steps: Vec<Step>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    pub id: i64,
    pub name: String,
    pub size_in_bytes: i64,
    pub archive_download_url: String,
    pub expired: bool,
    pub created_at: String,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: String,
    pub action: String,
    pub message: String,
    pub account_id: Option<String>,
    pub repo_full_name: Option<String>,
    pub run_id: Option<i64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunBundle {
    pub run: Run,
    pub jobs: Vec<Job>,
    pub artifacts: Vec<Artifact>,
    pub log_text: String,
    pub audit_entries: Vec<AuditEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerResponse {
    pub accepted: bool,
    pub message: String,
    pub run: Option<Run>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportResponse {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadResponse {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StoredState {
    pub accounts: Vec<AccountRecord>,
    pub selected_account_id: Option<String>,
    pub selected_repo_full_name: Option<String>,
    pub audit_entries: Vec<AuditEntry>,
    pub presets: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BootstrapData {
    pub accounts: Vec<AccountSummary>,
    pub selected_account_id: Option<String>,
    pub selected_repo_full_name: Option<String>,
    pub audit_entries: Vec<AuditEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppState {
    pub stored: StoredState,
}

pub struct AppContext {
    pub state: Mutex<AppState>,
}

impl AppContext {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(AppState::default()),
        }
    }
}
