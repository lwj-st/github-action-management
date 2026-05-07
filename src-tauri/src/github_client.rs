use crate::models::{Artifact, Branch, Job, Repository, Run, Step, Workflow, WorkflowInput};
use base64::Engine;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use serde_yaml::{Mapping, Value as YamlValue};
use std::collections::{HashMap, HashSet};
use std::io::{Cursor, Read};
use tokio::time::{sleep, Duration};
use zip::ZipArchive;

const API_BASE: &str = "https://api.github.com";

#[derive(Debug, Deserialize)]
struct WorkflowListResponse {
    workflows: Vec<Workflow>,
}

#[derive(Debug, Deserialize)]
struct WorkflowRunListResponse {
    workflow_runs: Vec<Run>,
}

#[derive(Debug, Deserialize)]
struct JobsResponse {
    jobs: Vec<Job>,
}

#[derive(Debug, Deserialize)]
struct ArtifactListResponse {
    artifacts: Vec<Artifact>,
}

#[derive(Debug, Deserialize)]
struct BranchListItem {
    name: String,
}

#[derive(Debug, Deserialize)]
struct ContentResponse {
    content: String,
    encoding: String,
}

#[derive(Debug, Clone)]
struct ArchivedLogFile {
    path: String,
    text: String,
}

pub struct GitHubClient {
    client: reqwest::Client,
}

impl GitHubClient {
    pub fn new(token: &str) -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .default_headers(Self::headers(token)?)
            .redirect(reqwest::redirect::Policy::limited(10))
            .build()
            .map_err(|err| err.to_string())?;

        Ok(Self { client })
    }

    fn headers(token: &str) -> Result<HeaderMap, String> {
        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).map_err(|err| err.to_string())?,
        );
        headers.insert(
            ACCEPT,
            HeaderValue::from_static("application/vnd.github+json"),
        );
        headers.insert(
            "X-GitHub-Api-Version",
            HeaderValue::from_static("2022-11-28"),
        );
        headers.insert(
            USER_AGENT,
            HeaderValue::from_static("github-action-management-desktop"),
        );
        Ok(headers)
    }

    async fn send_json<T: for<'de> Deserialize<'de>>(
        &self,
        request: reqwest::RequestBuilder,
    ) -> Result<T, String> {
        let response = request.send().await.map_err(|err| err.to_string())?;
        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("GitHub API error {status}: {body}"));
        }
        response.json::<T>().await.map_err(|err| err.to_string())
    }

    async fn send_unit(&self, request: reqwest::RequestBuilder) -> Result<(), String> {
        let response = request.send().await.map_err(|err| err.to_string())?;
        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("GitHub API error {status}: {body}"));
        }
        Ok(())
    }

    pub async fn validate_token(&self) -> Result<(), String> {
        self.send_unit(self.client.get(format!("{API_BASE}/user"))).await
    }

    pub async fn get_repositories(&self, all_accessible: bool) -> Result<Vec<Repository>, String> {
        let mut page = 1;
        let mut repositories = Vec::new();
        let repo_type = if all_accessible { "all" } else { "owner" };

        loop {
            let page_result: Vec<Repository> = self
                .send_json(
                    self.client.get(format!(
                        "{API_BASE}/user/repos?per_page=100&page={page}&sort=updated&type={repo_type}"
                    )),
                )
                .await?;

            if page_result.is_empty() {
                break;
            }

            repositories.extend(page_result.iter().cloned());

            if page_result.len() < 100 {
                break;
            }
            page += 1;
        }

        Ok(repositories)
    }

    pub async fn get_branches(&self, owner: &str, repo: &str) -> Result<Vec<Branch>, String> {
        let mut page = 1;
        let mut branches = Vec::new();

        loop {
            let page_result: Vec<BranchListItem> = self
                .send_json(
                    self.client
                        .get(format!("{API_BASE}/repos/{owner}/{repo}/branches?per_page=100&page={page}")),
                )
                .await?;
            let page_len = page_result.len();

            if page_result.is_empty() {
                break;
            }

            branches.extend(
                page_result
                    .into_iter()
                    .map(|branch| Branch { name: branch.name }),
            );

            if page_len < 100 {
                break;
            }
            page += 1;
        }

        Ok(branches)
    }

    pub async fn get_workflows(&self, owner: &str, repo: &str) -> Result<Vec<Workflow>, String> {
        let response: WorkflowListResponse = self
            .send_json(self.client.get(format!(
                "{API_BASE}/repos/{owner}/{repo}/actions/workflows"
            )))
            .await?;
        Ok(response.workflows)
    }

    pub async fn get_workflow_inputs(
        &self,
        owner: &str,
        repo: &str,
        path: &str,
        reference: &str,
    ) -> Result<Vec<WorkflowInput>, String> {
        let encoded_path = path
            .split('/')
            .map(urlencoding::encode)
            .collect::<Vec<_>>()
            .join("/");
        let content: ContentResponse = self
            .send_json(self.client.get(format!(
                "{API_BASE}/repos/{owner}/{repo}/contents/{encoded_path}?ref={reference}"
            )))
            .await?;

        let yaml_content = if content.encoding == "base64" {
            let decoded = base64::engine::general_purpose::STANDARD
                .decode(content.content.replace('\n', ""))
                .map_err(|err| err.to_string())?;
            String::from_utf8(decoded).map_err(|err| err.to_string())?
        } else {
            content.content
        };

        Self::parse_workflow_inputs(&yaml_content)
    }

    pub fn parse_workflow_inputs(yaml_content: &str) -> Result<Vec<WorkflowInput>, String> {
        let root: YamlValue = serde_yaml::from_str(yaml_content).map_err(|err| err.to_string())?;
        let root_mapping = root
            .as_mapping()
            .ok_or("Workflow YAML root is not a mapping")?;

        let on_node = mapping_get(root_mapping, "on").or_else(|| mapping_get(root_mapping, "\"on\""));
        let Some(on_node) = on_node else {
            return Ok(Vec::new());
        };

        let dispatch_node = match on_node {
            YamlValue::Mapping(mapping) => mapping_get(mapping, "workflow_dispatch"),
            _ => None,
        };
        let Some(dispatch_node) = dispatch_node else {
            return Ok(Vec::new());
        };

        let dispatch_mapping = dispatch_node
            .as_mapping()
            .ok_or("workflow_dispatch must be a mapping")?;
        let inputs_node = mapping_get(dispatch_mapping, "inputs");
        let Some(inputs_node) = inputs_node else {
            return Ok(Vec::new());
        };

        let inputs_mapping = inputs_node
            .as_mapping()
            .ok_or("workflow_dispatch.inputs must be a mapping")?;

        let mut inputs = Vec::new();
        for (name_node, config_node) in inputs_mapping {
            let Some(name) = name_node.as_str() else {
                continue;
            };
            let Some(config) = config_node.as_mapping() else {
                continue;
            };

            let label = name.replace('_', " ");
            let description = mapping_get(config, "description")
                .and_then(YamlValue::as_str)
                .map(str::to_string);
            let required = mapping_get(config, "required")
                .and_then(YamlValue::as_bool)
                .unwrap_or(false);
            let input_type = mapping_get(config, "type")
                .and_then(YamlValue::as_str)
                .unwrap_or("string")
                .to_string();
            let options = mapping_get(config, "options")
                .and_then(YamlValue::as_sequence)
                .map(|values| {
                    values
                        .iter()
                        .filter_map(|item| item.as_str().map(str::to_string))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            let default_value = mapping_get(config, "default").map(yaml_scalar_to_string);

            inputs.push(WorkflowInput {
                name: name.to_string(),
                label,
                description,
                required,
                input_type,
                options,
                default_value,
            });
        }

        Ok(inputs)
    }

    pub async fn trigger_workflow(
        &self,
        owner: &str,
        repo: &str,
        workflow_id: i64,
        reference: &str,
        inputs: Option<Value>,
    ) -> Result<Option<Run>, String> {
        let mut payload = Map::new();
        payload.insert("ref".to_string(), Value::String(reference.to_string()));
        if let Some(Value::Object(object)) = inputs {
            payload.insert("inputs".to_string(), Value::Object(object));
        }

        self.send_unit(
            self.client
                .post(format!(
                    "{API_BASE}/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches"
                ))
                .json(&Value::Object(payload)),
        )
        .await?;

        for _ in 0..5 {
            sleep(Duration::from_millis(1200)).await;
            let runs = self
                .get_runs(owner, repo, Some(workflow_id), Some(reference), None, 10)
                .await?;
            if let Some(run) = runs.into_iter().next() {
                return Ok(Some(run));
            }
        }

        Ok(None)
    }

    pub async fn get_runs(
        &self,
        owner: &str,
        repo: &str,
        workflow_id: Option<i64>,
        branch: Option<&str>,
        status: Option<&str>,
        per_page: i32,
    ) -> Result<Vec<Run>, String> {
        let mut url = if let Some(workflow_id) = workflow_id {
            format!(
                "{API_BASE}/repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs?per_page={per_page}"
            )
        } else {
            format!("{API_BASE}/repos/{owner}/{repo}/actions/runs?per_page={per_page}")
        };
        if let Some(branch) = branch {
            url.push_str(&format!("&branch={branch}"));
        }
        if let Some(status) = status {
            url.push_str(&format!("&status={status}"));
        }

        let response: WorkflowRunListResponse = self.send_json(self.client.get(url)).await?;
        Ok(response.workflow_runs)
    }

    pub async fn get_run(&self, owner: &str, repo: &str, run_id: i64) -> Result<Run, String> {
        self.send_json(
            self.client
                .get(format!("{API_BASE}/repos/{owner}/{repo}/actions/runs/{run_id}")),
        )
        .await
    }

    pub async fn get_jobs(&self, owner: &str, repo: &str, run_id: i64) -> Result<Vec<Job>, String> {
        let response: JobsResponse = self
            .send_json(
                self.client
                    .get(format!("{API_BASE}/repos/{owner}/{repo}/actions/runs/{run_id}/jobs")),
            )
            .await?;
        Ok(response.jobs)
    }

    pub async fn get_job_logs(&self, owner: &str, repo: &str, job_id: i64) -> Result<String, String> {
        let response = self
            .client
            .get(format!("{API_BASE}/repos/{owner}/{repo}/actions/jobs/{job_id}/logs"))
            .send()
            .await
            .map_err(|err| err.to_string())?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("GitHub API error {status}: {body}"));
        }

        response.text().await.map_err(|err| err.to_string())
    }

    pub async fn collect_logs_for_run(
        &self,
        owner: &str,
        repo: &str,
        run: &Run,
        jobs: &[Job],
    ) -> Vec<(i64, String)> {
        let mut direct_logs = HashMap::new();
        let mut missing_jobs = Vec::new();

        for job in jobs {
            match self.get_job_logs(owner, repo, job.id).await {
                Ok(logs) if !logs.trim().is_empty() => {
                    direct_logs.insert(job.id, logs);
                }
                _ => missing_jobs.push(job),
            }
        }

        let archive_logs = self
            .get_run_logs_archive(owner, repo, run.id, run.run_attempt)
            .await
            .ok()
            .unwrap_or_default();

        let archive_matches = match_archived_logs_to_jobs(jobs, &archive_logs);

        let mut merged = Vec::with_capacity(jobs.len());
        for job in jobs {
            let direct = direct_logs.get(&job.id).cloned();
            let archive = archive_matches.get(&job.id).cloned();
            let logs = choose_better_log(direct, archive);
            if let Some(logs) = logs {
                merged.push((job.id, logs));
            }
        }

        if merged.is_empty() && !missing_jobs.is_empty() {
            return Vec::new();
        }

        merged
    }

    pub async fn get_artifacts(
        &self,
        owner: &str,
        repo: &str,
        run_id: i64,
    ) -> Result<Vec<Artifact>, String> {
        let response: ArtifactListResponse = self
            .send_json(
                self.client
                    .get(format!("{API_BASE}/repos/{owner}/{repo}/actions/runs/{run_id}/artifacts")),
            )
            .await?;
        Ok(response.artifacts)
    }

    pub async fn cancel_run(&self, owner: &str, repo: &str, run_id: i64) -> Result<(), String> {
        self.send_unit(
            self.client.post(format!(
                "{API_BASE}/repos/{owner}/{repo}/actions/runs/{run_id}/cancel"
            )),
        )
        .await
    }

    pub async fn rerun_run(&self, owner: &str, repo: &str, run_id: i64) -> Result<(), String> {
        self.send_unit(
            self.client.post(format!(
                "{API_BASE}/repos/{owner}/{repo}/actions/runs/{run_id}/rerun"
            )),
        )
        .await
    }

    pub async fn rerun_failed_jobs(
        &self,
        owner: &str,
        repo: &str,
        run_id: i64,
    ) -> Result<(), String> {
        self.send_unit(
            self.client.post(format!(
                "{API_BASE}/repos/{owner}/{repo}/actions/runs/{run_id}/rerun-failed-jobs"
            )),
        )
        .await
    }

    pub async fn download_artifact_bytes(
        &self,
        owner: &str,
        repo: &str,
        artifact_id: i64,
    ) -> Result<Vec<u8>, String> {
        let response = self
            .client
            .get(format!(
                "{API_BASE}/repos/{owner}/{repo}/actions/artifacts/{artifact_id}/zip"
            ))
            .send()
            .await
            .map_err(|err| err.to_string())?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("GitHub API error {status}: {body}"));
        }

        response
            .bytes()
            .await
            .map(|value| value.to_vec())
            .map_err(|err| err.to_string())
    }

    async fn get_run_logs_archive(
        &self,
        owner: &str,
        repo: &str,
        run_id: i64,
        run_attempt: Option<i64>,
    ) -> Result<Vec<ArchivedLogFile>, String> {
        let url = if let Some(attempt) = run_attempt {
            format!(
                "{API_BASE}/repos/{owner}/{repo}/actions/runs/{run_id}/attempts/{attempt}/logs"
            )
        } else {
            format!("{API_BASE}/repos/{owner}/{repo}/actions/runs/{run_id}/logs")
        };

        let response = self.client.get(url).send().await.map_err(|err| err.to_string())?;
        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(format!("GitHub API error {status}: {body}"));
        }

        let bytes = response.bytes().await.map_err(|err| err.to_string())?;
        parse_run_logs_archive(bytes.as_ref())
    }
}

fn mapping_get<'a>(mapping: &'a Mapping, key: &str) -> Option<&'a YamlValue> {
    mapping.get(YamlValue::String(key.to_string()))
}

fn yaml_scalar_to_string(value: &YamlValue) -> String {
    match value {
        YamlValue::Bool(value) => value.to_string(),
        YamlValue::Number(value) => value.to_string(),
        YamlValue::String(value) => value.clone(),
        _ => serde_json::to_string(&yaml_value_to_json(value)).unwrap_or_default(),
    }
}

fn yaml_value_to_json(value: &YamlValue) -> Value {
    match value {
        YamlValue::Bool(value) => Value::Bool(*value),
        YamlValue::Number(value) => {
            if let Some(int) = value.as_i64() {
                json!(int)
            } else if let Some(float) = value.as_f64() {
                json!(float)
            } else {
                Value::Null
            }
        }
        YamlValue::String(value) => Value::String(value.clone()),
        YamlValue::Sequence(values) => {
            Value::Array(values.iter().map(yaml_value_to_json).collect::<Vec<_>>())
        }
        YamlValue::Mapping(mapping) => {
            let mut object = Map::new();
            for (key, value) in mapping {
                if let Some(key) = key.as_str() {
                    object.insert(key.to_string(), yaml_value_to_json(value));
                }
            }
            Value::Object(object)
        }
        _ => Value::Null,
    }
}

fn parse_run_logs_archive(bytes: &[u8]) -> Result<Vec<ArchivedLogFile>, String> {
    let reader = Cursor::new(bytes);
    let mut archive = ZipArchive::new(reader).map_err(|err| err.to_string())?;
    let mut files = Vec::new();

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|err| err.to_string())?;
        if !entry.is_file() {
            continue;
        }

        let path = entry.name().replace('\\', "/");
        if !(path.ends_with(".txt") || path.ends_with(".log")) {
            continue;
        }

        let mut buffer = Vec::new();
        entry.read_to_end(&mut buffer).map_err(|err| err.to_string())?;
        let text = String::from_utf8_lossy(&buffer).trim().to_string();
        if text.is_empty() {
            continue;
        }

        files.push(ArchivedLogFile { path, text });
    }

    Ok(files)
}

fn choose_better_log(direct: Option<String>, archive: Option<String>) -> Option<String> {
    match (direct, archive) {
        (Some(direct), Some(archive)) => {
            if archive.trim().len() > direct.trim().len() {
                Some(archive)
            } else {
                Some(direct)
            }
        }
        (Some(direct), None) => Some(direct),
        (None, Some(archive)) => Some(archive),
        (None, None) => None,
    }
}

fn match_archived_logs_to_jobs(jobs: &[Job], files: &[ArchivedLogFile]) -> HashMap<i64, String> {
    let mut matched = HashMap::new();
    let mut used_indices = HashSet::new();

    if jobs.len() == 1 && !files.is_empty() {
        matched.insert(jobs[0].id, format_archived_files(files.iter()));
        return matched;
    }

    for job in jobs {
        let normalized_name = normalize_log_key(&job.name);
        let mut chunks = Vec::new();

        for (index, file) in files.iter().enumerate() {
            if used_indices.contains(&index) {
                continue;
            }

            let normalized_path = normalize_log_key(&file.path);
            let file_name = file
                .path
                .rsplit('/')
                .next()
                .map(normalize_log_key)
                .unwrap_or_default();
            let stem = file_name
                .strip_suffix("txt")
                .or_else(|| file_name.strip_suffix("log"))
                .map(|value| value.trim_end_matches('.').to_string())
                .unwrap_or(file_name.clone());

            let is_match = normalized_path.contains(&normalized_name)
                || file_name.contains(&normalized_name)
                || stem.contains(&normalized_name);

            if is_match {
                used_indices.insert(index);
                chunks.push(format!("### {}\n{}\n", file.path, file.text));
            }
        }

        if !chunks.is_empty() {
            matched.insert(job.id, chunks.join("\n"));
        }
    }

    if matched.is_empty() && !files.is_empty() {
        if let Some(active_job) = jobs
            .iter()
            .find(|job| job.status != "completed" || job.conclusion.is_none())
            .or_else(|| jobs.first())
        {
            matched.insert(active_job.id, format_archived_files(files.iter()));
        }
    }

    matched
}

fn format_archived_files<'a>(files: impl Iterator<Item = &'a ArchivedLogFile>) -> String {
    files
        .map(|file| format!("### {}\n{}\n", file.path, file.text))
        .collect::<Vec<_>>()
        .join("\n")
}

fn normalize_log_key(value: &str) -> String {
    value
        .chars()
        .map(|char| if char.is_ascii_alphanumeric() { char.to_ascii_lowercase() } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn flatten_logs(jobs: &[Job], job_logs: &[(i64, String)]) -> String {
    let mut output = String::new();

    for job in jobs {
        output.push_str(&format!("## Job: {}\n", job.name));
        output.push_str(&format!("status={} conclusion={:?}\n", job.status, job.conclusion));

        if let Some((_, logs)) = job_logs.iter().find(|(job_id, _)| *job_id == job.id) {
            output.push_str(logs);
        } else {
            if job.status != "completed" {
                output.push_str("GitHub 尚未提供可下载实时日志，当前先展示步骤状态。应用会继续轮询。\n");
            } else {
                output.push_str("GitHub 未返回该 Job 的可下载日志，当前先展示步骤状态。\n");
            }
            for Step { name, status, conclusion, .. } in &job.steps {
                output.push_str(&format!(
                    "- step={} status={:?} conclusion={:?}\n",
                    name, status, conclusion
                ));
            }
        }

        output.push('\n');
    }

    output
}

#[cfg(test)]
mod tests {
    use super::{flatten_logs, GitHubClient};
    use crate::models::{Job, Step};

    #[test]
    fn parses_workflow_dispatch_inputs() {
        let yaml = r#"
name: test
on:
  workflow_dispatch:
    inputs:
      environment:
        description: Deploy environment
        required: true
        type: choice
        options:
          - dev
          - prod
        default: dev
      canary:
        required: false
        type: boolean
        default: true
"#;

        let inputs = GitHubClient::parse_workflow_inputs(yaml).unwrap();
        assert_eq!(inputs.len(), 2);
        assert_eq!(inputs[0].name, "environment");
        assert_eq!(inputs[0].options, vec!["dev".to_string(), "prod".to_string()]);
        assert_eq!(inputs[1].default_value.as_deref(), Some("true"));
    }

    #[test]
    fn flattens_logs_with_fallback_steps() {
        let jobs = vec![Job {
            id: 3,
            run_id: 1,
            name: "lint".into(),
            status: "completed".into(),
            conclusion: Some("success".into()),
            started_at: None,
            completed_at: None,
            html_url: None,
            steps: vec![Step {
                name: "install".into(),
                status: Some("completed".into()),
                conclusion: Some("success".into()),
                number: Some(1),
                started_at: None,
                completed_at: None,
            }],
        }];

        let text = flatten_logs(&jobs, &[]);
        assert!(text.contains("install"));
    }
}
