use crate::models::*;
use reqwest::Client;
use serde_json::json;
use std::sync::Arc;

/// GitHub API 客户端
pub struct GitHubClient {
    client: Client,
    token: String,
}

impl GitHubClient {
    pub fn new(token: String) -> Self {
        Self {
            client: Client::new(),
            token,
        }
    }

    /// 获取 HTTP 请求头
    fn headers(&self) -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            "Authorization",
            format!("Bearer {}", self.token)
                .parse()
                .unwrap(),
        );
        headers.insert(
            "Accept",
            "application/vnd.github.v3+json".parse().unwrap(),
        );
        headers.insert(
            "X-GitHub-Api-Version",
            "2022-11-28".parse().unwrap(),
        );
        headers
    }

    /// 获取用户信息
    pub async fn get_user(&self) -> Result<serde_json::Value, String> {
        let response = self
            .client
            .get("https://api.github.com/user")
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to get user: {}", e))?;

        if response.status().is_success() {
            Ok(response.json().await.unwrap_or_default())
        } else {
            Err(format!("GitHub API error: {}", response.status()))
        }
    }

    /// 获取用户有权限的仓库列表
    pub async fn get_repositories(&self) -> Result<Vec<Repository>, String> {
        let mut repos = Vec::new();
        let mut page = 1;
        let per_page = 100;

        loop {
            let url = format!(
                "https://api.github.com/user/repos?per_page={}&page={}&type=all&sort=updated",
                per_page, page
            );

            let response = self
                .client
                .get(&url)
                .headers(self.headers())
                .send()
                .await
                .map_err(|e| format!("Failed to fetch repos: {}", e))?;

            if !response.status().is_success() {
                return Err(format!("GitHub API error: {}", response.status()));
            }

            let repo_list: Vec<Repository> = response.json().await.unwrap_or_default();

            if repo_list.is_empty() {
                break;
            }

            repos.extend(repo_list);
            page += 1;

            // 如果获取的数量小于 per_page，说明已经是最后一页
            if repo_list.len() < per_page {
                break;
            }
        }

        Ok(repos)
    }

    /// 获取指定仓库的 Workflows 列表
    pub async fn get_workflows(
        &self,
        owner: &str,
        repo: &str,
    ) -> Result<Vec<Workflow>, String> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/actions/workflows",
            owner, repo
        );

        let response = self
            .client
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to get workflows: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("GitHub API error: {}", response.status()));
        }

        let data: serde_json::Value = response.json().await.unwrap_or_default();
        let workflows: Vec<Workflow> = data
            .get("workflows")
            .and_then(|w| w.as_array())
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|w| {
                serde_json::from_value(w).ok()
            })
            .collect();

        Ok(workflows)
    }

    /// 获取 Workflow 的 YAML 文件内容
    pub async fn get_workflow_yaml(
        &self,
        owner: &str,
        repo: &str,
        workflow_id: i64,
    ) -> Result<String, String> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/actions/workflows/{}.yml",
            owner, repo, workflow_id
        );

        let response = self
            .client
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to get workflow YAML: {}", e))?;

        if !response.status().is_success() {
            // 尝试 .yaml 后缀
            let url_yaml = format!(
                "https://api.github.com/repos/{}/{}/actions/workflows/{}.yaml",
                owner, repo, workflow_id
            );
            let response_yaml = self
                .client
                .get(&url_yaml)
                .headers(self.headers())
                .send()
                .await
                .map_err(|e| format!("Failed to get workflow YAML: {}", e))?;

            if !response_yaml.status().is_success() {
                return Err(format!("Failed to get workflow YAML: {}", response.status()));
            }

            Ok(response_yaml.text().await.unwrap_or_default())
        } else {
            Ok(response.text().await.unwrap_or_default())
        }
    }

    /// 解析 Workflow 的输入参数
    pub fn parse_workflow_inputs(yaml_content: &str) -> Result<Vec<WorkflowInput>, String> {
        let mut inputs = Vec::new();

        // 简单解析 YAML 中的 workflow_dispatch 部分
        // 注意：完整解析需要使用 YAML 解析库
        if !yaml_content.contains("workflow_dispatch") {
            return Ok(inputs);
        }

        // 查找 workflow_dispatch 块
        if let Some(start) = yaml_content.find("workflow_dispatch") {
            if let Some(inputs_start) = yaml_content[start..].find("inputs:") {
                let inputs_block_start = start + inputs_start + 7;
                let remaining = &yaml_content[inputs_block_start..];

                // 解析 inputs 下的每个参数
                let lines: Vec<&str> = remaining.lines().skip(1).collect();
                let mut current_input: Option<WorkflowInput> = None;

                for line in lines {
                    let trimmed = line.trim();
                    if trimmed.is_empty() || trimmed.starts_with("#") {
                        continue;
                    }

                    // 检测新的 input（以空格开头 + 冒号）
                    if trimmed.starts_with("- ") || trimmed.contains(":") && !trimmed.starts_with("  ") {
                        // 保存前一个 input
                        if let Some(input) = current_input.take() {
                            inputs.push(input);
                        }

                        // 解析新 input 的名称
                        if let Some(name_part) = trimmed.strip_prefix("- ") {
                            if let Some(name) = name_part.split(':').next() {
                                current_input = Some(WorkflowInput {
                                    name: name.trim().to_string(),
                                    description: None,
                                    required: false,
                                    type_val: "string".to_string(),
                                    options: None,
                                    default: None,
                                });
                            }
                        }
                    } else if let Some(ref mut input) = current_input {
                        // 解析当前 input 的属性
                        if trimmed.starts_with("description:") {
                            input.description = Some(
                                trimmed
                                    .split_once(":")
                                    .map(|(_, v)| v.trim().trim_matches('"').trim_matches('\'').to_string())
                                    .unwrap_or_default(),
                            );
                        } else if trimmed.starts_with("required:") {
                            input.required = trimmed
                                .split_once(":")
                                .map(|(_, v)| v.trim().to_lowercase() == "true")
                                .unwrap_or(false);
                        } else if trimmed.starts_with("type:") {
                            input.type_val = trimmed
                                .split_once(":")
                                .map(|(_, v)| v.trim().to_string())
                                .unwrap_or("string".to_string());
                        } else if trimmed.starts_with("default:") {
                            input.default = Some(
                                trimmed
                                    .split_once(":")
                                    .map(|(_, v)| v.trim().trim_matches('"').trim_matches('\'').to_string())
                                    .unwrap_or_default(),
                            );
                        } else if trimmed.starts_with("options:") {
                            // 解析选项列表
                            let mut options = Vec::new();
                            for opt_line in lines.iter().skip_while(|l| !l.starts_with("options:")) {
                                if opt_line.trim().starts_with("- ") {
                                    let opt = opt_line.trim()[2..]
                                        .trim_matches('"')
                                        .trim_matches('\'')
                                        .to_string();
                                    options.push(opt);
                                } else if !opt_line.trim().is_empty() && !opt_line.trim().starts_with("-") {
                                    break;
                                }
                            }
                            input.options = if options.is_empty() { None } else { Some(options) };
                            break;
                        }
                    }
                }

                // 保存最后一个 input
                if let Some(input) = current_input {
                    inputs.push(input);
                }
            }
        }

        Ok(inputs)
    }

    /// 触发 Workflow
    pub async fn trigger_workflow(
        &self,
        owner: &str,
        repo: &str,
        workflow_id: i64,
        ref_branch: &str,
        inputs: Option<&serde_json::Value>,
    ) -> Result<Run, String> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/actions/workflows/{}/dispatches",
            owner, repo, workflow_id
        );

        let mut payload = json!({
            "ref": ref_branch
        });

        if let Some(inputs_val) = inputs {
            payload["inputs"] = inputs_val.clone();
        }

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .json(&payload)
            .send()
            .await
            .map_err(|e| format!("Failed to trigger workflow: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to trigger workflow: {}", response.status()));
        }

        let run: Run = response.json().await.map_err(|e| format!("Failed to parse response: {}", e))?;

        Ok(run)
    }

    /// 获取 Workflow 运行列表
    pub async fn get_runs(
        &self,
        owner: &str,
        repo: &str,
        workflow_id: Option<i64>,
        branch: Option<&str>,
        status: Option<&str>,
        limit: i32,
    ) -> Result<Vec<Run>, String> {
        let mut url = format!(
            "https://api.github.com/repos/{}/{}/actions/runs?per_page={}",
            owner, repo, limit
        );

        if let Some(wid) = workflow_id {
            url = format!("{}&workflow_id={}", url, wid);
        }
        if let Some(br) = branch {
            url = format!("{}&branch={}", url, br);
        }
        if let Some(st) = status {
            url = format!("{}&status={}", url, st);
        }

        let response = self
            .client
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to get runs: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("GitHub API error: {}", response.status()));
        }

        let data: serde_json::Value = response.json().await.unwrap_or_default();
        let runs: Vec<Run> = data
            .get("workflow_runs")
            .and_then(|r| r.as_array())
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|r| serde_json::from_value(r).ok())
            .collect();

        Ok(runs)
    }

    /// 获取单个运行详情
    pub async fn get_run(&self, owner: &str, repo: &str, run_id: i64) -> Result<Run, String> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/actions/runs/{}",
            owner, repo, run_id
        );

        let response = self
            .client
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to get run: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("GitHub API error: {}", response.status()));
        }

        let run: Run = response.json().await.map_err(|e| format!("Failed to parse response: {}", e))?;

        Ok(run)
    }

    /// 取消运行
    pub async fn cancel_run(&self, owner: &str, repo: &str, run_id: i64) -> Result<(), String> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/actions/runs/{}",
            owner, repo, run_id
        );

        let response = self
            .client
            .post(format!("{}/cancel", url))
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to cancel run: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to cancel run: {}", response.status()));
        }

        Ok(())
    }

    /// 重新运行成功作业
    pub async fn rerun_run(&self, owner: &str, repo: &str, run_id: i64) -> Result<(), String> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/actions/runs/{}/rerun",
            owner, repo, run_id
        );

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to rerun run: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to rerun run: {}", response.status()));
        }

        Ok(())
    }

    /// 重新运行失败的作业
    pub async fn rerun_failed_jobs(&self, owner: &str, repo: &str, run_id: i64) -> Result<(), String> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/actions/runs/{}/rerun-failed-jobs",
            owner, repo, run_id
        );

        let response = self
            .client
            .post(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to rerun failed jobs: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to rerun failed jobs: {}", response.status()));
        }

        Ok(())
    }

    /// 获取作业的日志
    pub async fn get_job_logs(&self, owner: &str, repo: &str, job_id: i64) -> Result<String, String> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/actions/jobs/{}/logs",
            owner, repo, job_id
        );

        let response = self
            .client
            .redirect(reqwest::redirect::Policy::limited(5))
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to get logs: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to get logs: {}", response.status()));
        }

        Ok(response.text().await.unwrap_or_default())
    }

    /// 获取运行产生的制品列表
    pub async fn get_artifacts(
        &self,
        owner: &str,
        repo: &str,
        run_id: i64,
    ) -> Result<Vec<Artifact>, String> {
        let url = format!(
            "https://api.github.com/repos/{}/{}/actions/runs/{}/artifacts",
            owner, repo, run_id
        );

        let response = self
            .client
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to get artifacts: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("GitHub API error: {}", response.status()));
        }

        let data: serde_json::Value = response.json().await.unwrap_or_default();
        let artifacts: Vec<Artifact> = data
            .get("artifacts")
            .and_then(|a| a.as_array())
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .filter_map(|a| serde_json::from_value(a).ok())
            .collect();

        Ok(artifacts)
    }

    /// 下载制品
    pub async fn download_artifact(
        &self,
        artifact_url: &str,
        output_path: &str,
    ) -> Result<(), String> {
        let response = self
            .client
            .get(artifact_url)
            .headers(self.headers())
            .send()
            .await
            .map_err(|e| format!("Failed to download artifact: {}", e))?;

        if !response.status().is_success() {
            return Err(format!("Failed to download artifact: {}", response.status()));
        }

        let bytes = response.bytes().await.map_err(|e| format!("Failed to read bytes: {}", e))?;
        std::fs::write(output_path, &bytes).map_err(|e| format!("Failed to write file: {}", e))?;

        Ok(())
    }
}
