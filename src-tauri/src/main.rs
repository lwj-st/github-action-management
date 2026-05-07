mod github_client;
mod models;
mod storage;

use chrono::Utc;
use github_client::{flatten_logs, GitHubClient};
use models::*;
use serde_json::Value;
use std::fs;
use storage::{
    append_audit_entry, delete_token, downloads_dir, load_state, read_token, save_state, store_token,
    token_status,
};

fn split_repo(repo_full_name: &str) -> Result<(&str, &str), String> {
    let parts: Vec<&str> = repo_full_name.split('/').collect();
    if parts.len() != 2 {
        return Err("Repository must be in owner/repo format".to_string());
    }
    Ok((parts[0], parts[1]))
}

fn account_token(state: &StoredState, account_id: &str) -> Result<String, String> {
    if state.accounts.iter().any(|item| item.id == account_id) {
        read_token(account_id)
    } else {
        Err("Account not found".to_string())
    }
}

fn to_account_summary(account: &AccountRecord) -> AccountSummary {
    AccountSummary {
        id: account.id.clone(),
        name: account.name.clone(),
        created_at: account.created_at.clone(),
        last_used_at: account.last_used_at.clone(),
        token_status: token_status(account),
    }
}

async fn build_run_bundle(
    token: &str,
    repo_full_name: &str,
    run_id: i64,
    audit_entries: Vec<AuditEntry>,
) -> Result<RunBundle, String> {
    let client = GitHubClient::new(token)?;
    let (owner, repo) = split_repo(repo_full_name)?;
    let run = client.get_run(owner, repo, run_id).await?;
    let jobs = client.get_jobs(owner, repo, run_id).await?;
    let artifacts = client.get_artifacts(owner, repo, run_id).await?;
    let job_names = jobs.iter().map(|job| job.name.clone()).collect::<Vec<_>>();
    let job_summaries = client
        .get_job_summaries(owner, repo, run.id, &run.head_sha, &job_names, run.check_suite_id)
        .await
        .unwrap_or_default();

    let mut collected_logs = Vec::new();
    for job in &jobs {
        if let Ok(logs) = client.get_job_logs(owner, repo, job.id).await {
            collected_logs.push((job.id, logs));
        }
    }

    let log_text = flatten_logs(&jobs, &collected_logs);

    Ok(RunBundle {
        run,
        jobs,
        artifacts,
        log_text,
        job_summaries,
        audit_entries,
    })
}

#[tauri::command]
fn bootstrap_app(context: tauri::State<'_, AppContext>) -> Result<BootstrapData, String> {
    let stored = load_state()?;
    let accounts = stored.accounts.iter().map(to_account_summary).collect::<Vec<_>>();

    {
        let mut state = context.state.lock().map_err(|err| err.to_string())?;
        state.stored = stored.clone();
    }

    Ok(BootstrapData {
        accounts,
        selected_account_id: stored.selected_account_id.clone(),
        selected_repo_full_name: stored.selected_repo_full_name.clone(),
        audit_entries: stored.audit_entries.clone(),
    })
}

#[tauri::command]
async fn add_account(
    context: tauri::State<'_, AppContext>,
    name: String,
    token: String,
) -> Result<AccountSummary, String> {
    let client = GitHubClient::new(&token)?;
    client.validate_token().await?;

    let now = Utc::now().to_rfc3339();
    let account = AccountRecord {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        created_at: now.clone(),
        last_used_at: Some(now),
    };
    store_token(&account.id, &token)?;

    {
        let mut state = context.state.lock().map_err(|err| err.to_string())?;
        state.stored.accounts.push(account.clone());
        state.stored.selected_account_id = Some(account.id.clone());
        append_audit_entry(
            &mut state.stored,
            "account.added",
            "Added GitHub account",
            Some(account.id.clone()),
            None,
            None,
        );
        save_state(&state.stored)?;
    }

    Ok(to_account_summary(&account))
}

#[tauri::command]
fn remove_account(context: tauri::State<'_, AppContext>, account_id: String) -> Result<(), String> {
    {
        let mut state = context.state.lock().map_err(|err| err.to_string())?;
        state.stored.accounts.retain(|account| account.id != account_id);
        if state.stored.selected_account_id.as_deref() == Some(&account_id) {
            state.stored.selected_account_id = state.stored.accounts.first().map(|item| item.id.clone());
            state.stored.selected_repo_full_name = None;
        }
        append_audit_entry(
            &mut state.stored,
            "account.removed",
            "Removed GitHub account",
            Some(account_id.clone()),
            None,
            None,
        );
        save_state(&state.stored)?;
    }
    delete_token(&account_id)?;
    Ok(())
}

#[tauri::command]
fn get_accounts(context: tauri::State<'_, AppContext>) -> Result<Vec<AccountSummary>, String> {
    let state = context.state.lock().map_err(|err| err.to_string())?;
    Ok(state.stored.accounts.iter().map(to_account_summary).collect())
}

#[tauri::command]
fn set_current_account(context: tauri::State<'_, AppContext>, account_id: String) -> Result<(), String> {
    {
        let mut state = context.state.lock().map_err(|err| err.to_string())?;
        state.stored.selected_account_id = Some(account_id);
        save_state(&state.stored)?;
    }
    Ok(())
}

#[tauri::command]
fn set_selected_repository(
    context: tauri::State<'_, AppContext>,
    repo_full_name: String,
) -> Result<(), String> {
    {
        let mut state = context.state.lock().map_err(|err| err.to_string())?;
        state.stored.selected_repo_full_name = Some(repo_full_name);
        save_state(&state.stored)?;
    }
    Ok(())
}

#[tauri::command]
async fn fetch_repositories(
    context: tauri::State<'_, AppContext>,
    account_id: String,
) -> Result<Vec<Repository>, String> {
    let token = {
        let state = context.state.lock().map_err(|err| err.to_string())?;
        account_token(&state.stored, &account_id)?
    };
    let client = GitHubClient::new(&token)?;
    let repositories = client.get_repositories().await?;

    {
        let mut state = context.state.lock().map_err(|err| err.to_string())?;
        if let Some(account) = state.stored.accounts.iter_mut().find(|item| item.id == account_id) {
            account.last_used_at = Some(Utc::now().to_rfc3339());
        }
        append_audit_entry(
            &mut state.stored,
            "repo.fetch",
            "Fetched repositories",
            Some(account_id),
            None,
            None,
        );
        save_state(&state.stored)?;
    }

    Ok(repositories)
}

#[tauri::command]
async fn fetch_workflows(
    context: tauri::State<'_, AppContext>,
    account_id: String,
    repo_full_name: String,
    reference: Option<String>,
) -> Result<Vec<WorkflowDetails>, String> {
    let token = {
        let state = context.state.lock().map_err(|err| err.to_string())?;
        account_token(&state.stored, &account_id)?
    };
    let client = GitHubClient::new(&token)?;
    let (owner, repo) = split_repo(&repo_full_name)?;
    let workflows = client.get_workflows(owner, repo).await?;

    let workflow_reference = reference
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "main".to_string());
    let mut detailed = Vec::new();
    for workflow in workflows {
        let inputs = client
            .get_workflow_inputs(owner, repo, &workflow.path, &workflow_reference)
            .await
            .unwrap_or_default();
        detailed.push(WorkflowDetails { workflow, inputs });
    }

    Ok(detailed)
}

#[tauri::command]
async fn fetch_branches(
    context: tauri::State<'_, AppContext>,
    account_id: String,
    repo_full_name: String,
) -> Result<Vec<String>, String> {
    let token = {
        let state = context.state.lock().map_err(|err| err.to_string())?;
        account_token(&state.stored, &account_id)?
    };
    let client = GitHubClient::new(&token)?;
    let (owner, repo) = split_repo(&repo_full_name)?;
    let branches = client.get_branches(owner, repo).await?;
    Ok(branches.into_iter().map(|branch| branch.name).collect())
}

#[tauri::command]
async fn trigger_workflow(
    context: tauri::State<'_, AppContext>,
    account_id: String,
    repo_full_name: String,
    workflow_id: i64,
    ref_branch: String,
    inputs: Option<Value>,
) -> Result<TriggerResponse, String> {
    let token = {
        let state = context.state.lock().map_err(|err| err.to_string())?;
        account_token(&state.stored, &account_id)?
    };
    let client = GitHubClient::new(&token)?;
    let (owner, repo) = split_repo(&repo_full_name)?;
    let run = client
        .trigger_workflow(owner, repo, workflow_id, &ref_branch, inputs)
        .await?;

    {
        let mut state = context.state.lock().map_err(|err| err.to_string())?;
        append_audit_entry(
            &mut state.stored,
            "workflow.trigger",
            "Triggered workflow_dispatch",
            Some(account_id),
            Some(repo_full_name),
            run.as_ref().map(|item| item.id),
        );
        save_state(&state.stored)?;
    }

    Ok(TriggerResponse {
        accepted: true,
        message: if run.is_some() {
            "Workflow dispatch accepted".to_string()
        } else {
            "Workflow dispatched; run not observed yet".to_string()
        },
        run,
    })
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
    let token = {
        let state = context.state.lock().map_err(|err| err.to_string())?;
        account_token(&state.stored, &account_id)?
    };
    let client = GitHubClient::new(&token)?;
    let (owner, repo) = split_repo(&repo_full_name)?;
    client
        .get_runs(owner, repo, workflow_id, branch.as_deref(), status.as_deref(), limit)
        .await
}

#[tauri::command]
async fn get_run_bundle(
    context: tauri::State<'_, AppContext>,
    account_id: String,
    repo_full_name: String,
    run_id: i64,
) -> Result<RunBundle, String> {
    let token = {
        let state = context.state.lock().map_err(|err| err.to_string())?;
        account_token(&state.stored, &account_id)?
    };
    let audit_entries = {
        let state = context.state.lock().map_err(|err| err.to_string())?;
        state
            .stored
            .audit_entries
            .iter()
            .filter(|entry| entry.run_id == Some(run_id))
            .cloned()
            .collect::<Vec<_>>()
    };

    build_run_bundle(&token, &repo_full_name, run_id, audit_entries).await
}

#[tauri::command]
async fn cancel_run(
    context: tauri::State<'_, AppContext>,
    account_id: String,
    repo_full_name: String,
    run_id: i64,
) -> Result<(), String> {
    let token = {
        let state = context.state.lock().map_err(|err| err.to_string())?;
        account_token(&state.stored, &account_id)?
    };
    let client = GitHubClient::new(&token)?;
    let (owner, repo) = split_repo(&repo_full_name)?;
    client.cancel_run(owner, repo, run_id).await?;

    {
        let mut state = context.state.lock().map_err(|err| err.to_string())?;
        append_audit_entry(
            &mut state.stored,
            "run.cancel",
            "Cancelled workflow run",
            Some(account_id),
            Some(repo_full_name),
            Some(run_id),
        );
        save_state(&state.stored)?;
    }

    Ok(())
}

#[tauri::command]
async fn rerun_run(
    context: tauri::State<'_, AppContext>,
    account_id: String,
    repo_full_name: String,
    run_id: i64,
) -> Result<(), String> {
    let token = {
        let state = context.state.lock().map_err(|err| err.to_string())?;
        account_token(&state.stored, &account_id)?
    };
    let client = GitHubClient::new(&token)?;
    let (owner, repo) = split_repo(&repo_full_name)?;
    client.rerun_run(owner, repo, run_id).await?;

    {
        let mut state = context.state.lock().map_err(|err| err.to_string())?;
        append_audit_entry(
            &mut state.stored,
            "run.rerun",
            "Requested rerun for workflow run",
            Some(account_id),
            Some(repo_full_name),
            Some(run_id),
        );
        save_state(&state.stored)?;
    }

    Ok(())
}

#[tauri::command]
async fn rerun_failed_jobs(
    context: tauri::State<'_, AppContext>,
    account_id: String,
    repo_full_name: String,
    run_id: i64,
) -> Result<(), String> {
    let token = {
        let state = context.state.lock().map_err(|err| err.to_string())?;
        account_token(&state.stored, &account_id)?
    };
    let client = GitHubClient::new(&token)?;
    let (owner, repo) = split_repo(&repo_full_name)?;
    client.rerun_failed_jobs(owner, repo, run_id).await?;

    {
        let mut state = context.state.lock().map_err(|err| err.to_string())?;
        append_audit_entry(
            &mut state.stored,
            "run.rerun_failed_jobs",
            "Requested rerun for failed jobs",
            Some(account_id),
            Some(repo_full_name),
            Some(run_id),
        );
        save_state(&state.stored)?;
    }

    Ok(())
}

#[tauri::command]
async fn download_artifact(
    context: tauri::State<'_, AppContext>,
    account_id: String,
    repo_full_name: String,
    artifact_id: i64,
    artifact_name: String,
) -> Result<DownloadResponse, String> {
    let token = {
        let state = context.state.lock().map_err(|err| err.to_string())?;
        account_token(&state.stored, &account_id)?
    };
    let client = GitHubClient::new(&token)?;
    let (owner, repo) = split_repo(&repo_full_name)?;
    let bytes = client.download_artifact_bytes(owner, repo, artifact_id).await?;

    let dir = downloads_dir().join(format!("{}_{}", owner, repo));
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let safe_name = artifact_name.replace('/', "-");
    let path = dir.join(format!("{safe_name}-{artifact_id}.zip"));
    fs::write(&path, bytes).map_err(|err| err.to_string())?;

    {
        let mut state = context.state.lock().map_err(|err| err.to_string())?;
        append_audit_entry(
            &mut state.stored,
            "artifact.download",
            "Downloaded workflow artifact",
            Some(account_id),
            Some(repo_full_name),
            None,
        );
        save_state(&state.stored)?;
    }

    Ok(DownloadResponse {
        path: path.to_string_lossy().to_string(),
    })
}

#[tauri::command]
async fn export_run_report(
    context: tauri::State<'_, AppContext>,
    account_id: String,
    repo_full_name: String,
    run_id: i64,
    format: String,
) -> Result<ExportResponse, String> {
    let token = {
        let state = context.state.lock().map_err(|err| err.to_string())?;
        account_token(&state.stored, &account_id)?
    };
    let audit_entries = {
        let state = context.state.lock().map_err(|err| err.to_string())?;
        state
            .stored
            .audit_entries
            .iter()
            .filter(|entry| entry.run_id == Some(run_id))
            .cloned()
            .collect::<Vec<_>>()
    };
    let bundle = build_run_bundle(&token, &repo_full_name, run_id, audit_entries).await?;
    let dir = downloads_dir().join("reports");
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;

    let path = match format.as_str() {
        "json" => {
            let path = dir.join(format!("run-{run_id}.json"));
            let content = serde_json::to_string_pretty(&bundle).map_err(|err| err.to_string())?;
            fs::write(&path, content).map_err(|err| err.to_string())?;
            path
        }
        _ => {
            let path = dir.join(format!("run-{run_id}.md"));
            let mut markdown = String::new();
            markdown.push_str(&format!("# Workflow Run Report #{run_id}\n\n"));
            markdown.push_str(&format!("- Repository: `{repo_full_name}`\n"));
            markdown.push_str(&format!("- Status: `{}`\n", bundle.run.status));
            markdown.push_str(&format!(
                "- Conclusion: `{}`\n\n",
                bundle.run.conclusion.clone().unwrap_or_else(|| "n/a".to_string())
            ));
            markdown.push_str("## GitHub Action Summary\n");
            if bundle.job_summaries.is_empty() {
                markdown.push_str("- No job summaries were returned by GitHub.\n");
            } else {
                for summary in &bundle.job_summaries {
                    markdown.push_str(&format!("### {}\n\n", summary.name));
                    if !summary.summary.is_empty() {
                        markdown.push_str(&summary.summary);
                        markdown.push_str("\n\n");
                    }
                    if let Some(text) = &summary.text {
                        markdown.push_str(text);
                        markdown.push_str("\n\n");
                    }
                }
            }
            markdown.push_str("\n## Jobs\n");
            for job in &bundle.jobs {
                markdown.push_str(&format!(
                    "- `{}` status=`{}` conclusion=`{}`\n",
                    job.name,
                    job.status,
                    job.conclusion.clone().unwrap_or_else(|| "n/a".to_string())
                ));
            }
            markdown.push_str("\n## Artifacts\n");
            for artifact in &bundle.artifacts {
                markdown.push_str(&format!(
                    "- `{}` ({} bytes)\n",
                    artifact.name, artifact.size_in_bytes
                ));
            }
            markdown.push_str("\n## Logs\n\n```text\n");
            markdown.push_str(&bundle.log_text);
            markdown.push_str("\n```\n");
            fs::write(&path, markdown).map_err(|err| err.to_string())?;
            path
        }
    };

    Ok(ExportResponse {
        path: path.to_string_lossy().to_string(),
    })
}

fn main() {
    tauri::Builder::default()
        .manage(AppContext::new())
        .invoke_handler(tauri::generate_handler![
            bootstrap_app,
            add_account,
            remove_account,
            get_accounts,
            set_current_account,
            set_selected_repository,
            fetch_repositories,
            fetch_workflows,
            fetch_branches,
            trigger_workflow,
            fetch_runs,
            get_run_bundle,
            cancel_run,
            rerun_run,
            rerun_failed_jobs,
            download_artifact,
            export_run_report
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
