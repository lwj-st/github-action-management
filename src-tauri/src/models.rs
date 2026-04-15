use serde::{Deserialize, Serialize};
use std::sync::Mutex;

// 账户信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: String,
    pub name: String,
    pub token: String, // 实际应用中应该加密存储
    pub created_at: String,
}

// 仓库信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Repository {
    pub id: i64,
    pub name: String,
    pub full_name: String,
    pub private: bool,
    pub language: Option<String>,
    pub updated_at: String,
    pub default_branch: String,
}

// Workflow 信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workflow {
    pub id: i64,
    pub name: String,
    pub path: String,
    pub state: String,
    pub created_at: String,
    pub updated_at: String,
}

// Workflow 输入参数
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WorkflowInput {
    pub name: String,
    pub description: Option<String>,
    pub required: bool,
    pub type_val: String, // string, choice, boolean, environment, number
    pub options: Option<Vec<String>>, // 仅用于 choice 类型
    pub default: Option<String>,
}

// Workflow 详情（包含输入参数）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowDetails {
    pub workflow: Workflow,
    pub inputs: Vec<WorkflowInput>,
}

// Workflow 运行状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RunStatus {
    Queued,
    InProgress,
    Completed,
    Waiting,
    WaitingSecurityPolicy,
    PermissionDenied,
    ActionFailure,
    TimedOut,
    Cancelled,
}

// Workflow 运行记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Run {
    pub id: i64,
    pub name: String,
    pub status: RunStatus,
    pub conclusion: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub html_url: String,
    pub head_branch: String,
    pub head_sha: String,
    pub workflow_id: i64,
    pub workflow_name: String,
}

// 作业信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Job {
    pub id: i64,
    pub run_id: i64,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub steps: Vec<Step>,
}

// 步骤信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Step {
    pub id: i32,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
}

// 日志内容
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogContent {
    pub content: String,
    pub is_ansi: bool,
}

// 制品信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Artifact {
    pub id: i32,
    pub name: String,
    pub size: i64,
    pub url: String,
    pub created_at: String,
    pub expires_at: Option<String>,
}

// API 响应结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

// 应用状态（用于状态管理）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppState {
    pub accounts: Vec<Account>,
    pub repositories: Vec<Repository>,
    pub workflows: Vec<WorkflowDetails>,
    pub runs: Vec<Run>,
    pub current_account: Option<String>,
    pub selected_repository: Option<String>,
}

// 线程安全的全局状态
pub struct AppContext {
    pub state: Mutex<AppState>,
    pub base_url: String,
}

impl AppContext {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(AppState::default()),
            base_url: "https://api.github.com".to_string(),
        }
    }
}
