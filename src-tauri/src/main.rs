mod github_client;
mod models;

use github_client::GitHubClient;
use models::*;
use serde::{Deserialize, Serialize};
use tauri::Manager;
use std::sync::Arc;

#[derive(Debug, Serialize, Deserialize)]
struct AppData {
    context: Arc<AppContext>,
}

// ============ 账户管理 ============

#[tauri::command]
fn add_account(context: tauri::State<'_, AppContext>, name: String, token: String) -> Result<Account, String> {
    let mut state = context.state.lock().map_err(|e| e.to_string())?;

    let account = Account {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        token, // 实际应用中应该加密
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    state.accounts.push(account.clone());
    Ok(account)
}

#[tauri::command]
fn get_accounts(context: tauri::State<'_, AppContext>) -> Result<Vec<Account>, String> {
    let state = context.state.lock().map_err(|e| e.to_string())?;
    Ok(state.accounts.clone())
}

#[tauri::command]
fn remove_account(context: tauri::State<'_, AppContext>, account_id: String) -> Result<(), String> {
    let mut state = context.state.lock().map_err(|e| e.to_string())?;
    state.accounts.retain(|a| a.id != account_id);
    Ok(())
}

#[tauri::command]
fn set_current_account(context: tauri::State<'_, AppContext>, account_id: String) -> Result<(), String> {
    let mut state = context.state.lock().map_err(|e| e.to_string())?;
    state.current_account = Some(account_id);
    Ok(())
}

// ============ 仓库管理 ============

#[tauri::command]
async fn fetch_repositories(
    app: tauri::AppHandle,
    context: tauri::State<'_, AppContext>,
    account_id: String,
) -> Result<Vec<Repository>, String> {
    let state = context.state.lock().map_err(|e| e.to_string())?;
    let account = state
        .accounts
        .iter()
        .find(|a| a.id == account_id)
        .ok_or("Account not found")?;

    let client = GitHubClient::new(account.token.clone());
    let repos = client.get_repositories().await?;

    let mut state = context.state.lock().map_err(|e| e.to_string())?;
    state.repositories = repos.clone();

    Ok(repos)
}

#[tauri::command]
fn set_selected_repository(
    context: tauri::State<'_, AppContext>,
    repo_full_name: String,
) -> Result<(), String> {
    let mut state = context.state.lock().map_err(|e| e.to_string())?;
    state.selected_repository = Some(repo_full_name);
    Ok(())
}

// ============ Workflow 管理 ============

#[tauri::command]
async fn fetch_workflows(
    context: tauri::State<'_, AppContext>,
    account_id: String,
    repo_full_name: String,
) -> Result<Vec<WorkflowDetails>, String> {
    let state = context.state.lock().map_err(|e| e.to_string())?;
    let account = state
        .accounts
        .iter()
        .find(|a| a.id == account_id)
        .ok_or("Account not found")?;

    let parts: Vec<&str> = repo_full_name.split('/').collect();
    if parts.len() != 2 {
        return Err("Invalid repository name format".to_string());
    }

    let (owner, repo) = (parts[0], parts[1]);
    let client = GitHubClient::new(account.token.clone());

    let workflows = client.get_workflows(owner, repo).await?;

    // 获取每个 workflow 的 YAML 并解析输入参数
    let mut workflow_details = Vec::new();
    for workflow in workflows {
        let yaml_content = client.get_workflow_yaml(owner, repo, workflow.id).await?;
        let inputs = GitHubClient::parse_workflow_inputs(&yaml_content)?;

        workflow_details.push(WorkflowDetails {
            workflow: workflow.clone(),
            inputs,
        });
    }

    Ok(workflow_details)
}

// ============ Workflow 运行管理 ============

#[tauri::command]
async fn trigger_workflow(
    context: tauri::State<'_, AppContext>,
    account_id: String,
    repo_full_name: String,
    workflow_id: i64,
    ref_branch: String,
    inputs: Option<serde_json::Value>,
) -> Result<Run, String> {
    let state = context.state.lock().map_err(|e| e.to_string())?;
    let account = state
        .accounts
        .iter()
        .find(|a| a.id == account_id)
        .ok_or("Account not found")?;

    let parts: Vec<&str> = repo_full_name.split('/').collect();
    if parts.len() != 2 {
        return Err("Invalid repository name format".to_string());
    }

    let (owner, repo) = (parts[0], parts[1]);
    let client = GitHubClient::new(account.token.clone());

    let run = client
        .trigger_workflow(owner, repo, workflow_id, &ref_branch, inputs.as_ref())
        .await?;

    Ok(run)
}

#[tauri::command]
async fn fetch_runs(
    context: tauri::State<'_, AppContext>,
    account_id: String,
    repo_full_name: String,
    workflow_id: Option<i64>,
    branch: Option<String>,
    status: Option<String>,
    limit: i32,
) -> Result<Vec<Run>, String> {
    let state = context.state.lock().map_err(|e| e.to_string())?;
    let account = state
        .accounts
        .iter()
        .find(|a| a.id == account_id)
        .ok_or("Account not found")?;

    let parts: Vec<&str> = repo_full_name.split('/').collect();
    if parts.len() != 2 {
        return Err("Invalid repository name format".to_string());
    }

    let (owner, repo) = (parts[0], parts[1]);
    let client = GitHubClient::new(account.token.clone());

    let runs = client
        .get_runs(owner, repo, workflow_id, branch.as_deref(), status.as_deref(), limit)
        .await?;

    let mut state = context.state.lock().map_err(|e| e.to_string())?;
    state.runs = runs.clone();

    Ok(runs)
}

#[tauri::command]
async fn cancel_run(
    context: tauri::State<'_, AppContext>,
    account_id: String,
    repo_full_name: String,
    run_id: i64,
) -> Result<(), String> {
    let state = context.state.lock().map_err(|e| e.to_string())?;
    let account = state
        .accounts
        .iter()
        .find(|a| a.id == account_id)
        .ok_or("Account not found")?;

    let parts: Vec<&str> = repo_full_name.split('/').collect();
    if parts.len() != 2 {
        return Err("Invalid repository name format".to_string());
    }

    let (owner, repo) = (parts[0], parts[1]);
    let client = GitHubClient::new(account.token.clone());

    client.cancel_run(owner, repo, run_id).await?;

    Ok(())
}

#[tauri::command]
async fn rerun_run(
    context: tauri::State<'_, AppContext>,
    account_id: String,
    repo_full_name: String,
    run_id: i64,
) -> Result<(), String> {
    let state = context.state.lock().map_err(|e| e.to_string())?;
    let account = state
        .accounts
        .iter()
        .find(|a| a.id == account_id)
        .ok_or("Account not found")?;

    let parts: Vec<&str> = repo_full_name.split('/').collect();
    if parts.len() != 2 {
        return Err("Invalid repository name format".to_string());
    }

    let (owner, repo) = (parts[0], parts[1]);
    let client = GitHubClient::new(account.token.clone());

    client.rerun_run(owner, repo, run_id).await?;

    Ok(())
}

#[tauri::command]
async fn rerun_failed_jobs(
    context: tauri::State<'_, AppContext>,
    account_id: String,
    repo_full_name: String,
    run_id: i64,
) -> Result<(), String> {
    let state = context.state.lock().map_err(|e| e.to_string())?;
    let account = state
        .accounts
        .iter()
        .find(|a| a.id == account_id)
        .ok_or("Account not found")?;

    let parts: Vec<&str> = repo_full_name.split('/').collect();
    if parts.len() != 2 {
        return Err("Invalid repository name format".to_string());
    }

    let (owner, repo) = (parts[0], parts[1]);
    let client = GitHubClient::new(account.token.clone());

    client.rerun_failed_jobs(owner, repo, run_id).await?;

    Ok(())
}

#[tauri::command]
async fn get_run_details(
    context: tauri::State<'_, AppContext>,
    account_id: String,
    repo_full_name: String,
    run_id: i64,
) -> Result<Run, String> {
    let state = context.state.lock().map_err(|e| e.to_string())?;
    let account = state
        .accounts
        .iter()
        .find(|a| a.id == account_id)
        .ok_or("Account not found")?;

    let parts: Vec<&str> = repo_full_name.split('/').collect();
    if parts.len() != 2 {
        return Err("Invalid repository name format".to_string());
    }

    let (owner, repo) = (parts[0], parts[1]);
    let client = GitHubClient::new(account.token.clone());

    let run = client.get_run(owner, repo, run_id).await?;

    Ok(run)
}

#[tauri::command]
async fn get_artifacts(
    context: tauri::State<'_, AppContext>,
    account_id: String,
    repo_full_name: String,
    run_id: i64,
) -> Result<Vec<Artifact>, String> {
    let state = context.state.lock().map_err(|e| e.to_string())?;
    let account = state
        .accounts
        .iter()
        .find(|a| a.id == account_id)
        .ok_or("Account not found")?;

    let parts: Vec<&str> = repo_full_name.split('/').collect();
    if parts.len() != 2 {
        return Err("Invalid repository name format".to_string());
    }

    let (owner, repo) = (parts[0], parts[1]);
    let client = GitHubClient::new(account.token.clone());

    let artifacts = client.get_artifacts(owner, repo, run_id).await?;

    Ok(artifacts)
}

// ============ 状态获取 ============

#[tauri::command]
fn get_app_state(context: tauri::State<'_, AppContext>) -> Result<AppState, String> {
    let state = context.state.lock().map_err(|e| e.to_string())?;
    Ok(state.clone())
}

fn main() {
    tauri::Builder::default()
        .manage(AppData {
            context: Arc::new(AppContext::new()),
        })
        .invoke_handler(tauri::generate_handler![
            add_account,
            get_accounts,
            remove_account,
            set_current_account,
            fetch_repositories,
            set_selected_repository,
            fetch_workflows,
            trigger_workflow,
            fetch_runs,
            cancel_run,
            rerun_run,
            rerun_failed_jobs,
            get_run_details,
            get_artifacts,
            get_app_state
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
