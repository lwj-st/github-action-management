import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import './App.css'
import { inferDefaultValue, normalizeText, type FormValue } from './lib/workflow-utils'

type ThemeMode = 'system' | 'light' | 'dark'

interface AccountSummary {
  id: string
  name: string
  created_at: string
  last_used_at: string | null
  token_status: 'healthy' | 'expiring'
}

interface AuditEntry {
  id: string
  action: string
  message: string
  account_id: string | null
  repo_full_name: string | null
  run_id: number | null
  created_at: string
}

interface BootstrapData {
  accounts: AccountSummary[]
  selected_account_id: string | null
  selected_repo_full_name: string | null
  audit_entries: AuditEntry[]
}

interface Repository {
  id: number
  name: string
  full_name: string
  private: boolean
  language: string | null
  updated_at: string
  default_branch: string
  owner: {
    login: string
  }
}

interface WorkflowInput {
  name: string
  label: string
  description: string | null
  required: boolean
  type: 'string' | 'choice' | 'boolean' | 'environment' | 'number'
  options: string[]
  default_value: string | null
}

interface Workflow {
  id: number
  name: string
  path: string
  state: string
  created_at: string
  updated_at: string
  html_url?: string | null
}

interface WorkflowDetails {
  workflow: Workflow
  inputs: WorkflowInput[]
}

interface Run {
  id: number
  name: string
  status: string
  conclusion: string | null
  created_at: string
  updated_at: string
  html_url: string
  head_branch: string
  head_sha: string
  workflow_id: number
  display_title?: string | null
  event?: string | null
  run_attempt?: number | null
}

interface Step {
  name: string
  status: string | null
  conclusion: string | null
  number: number | null
  started_at: string | null
  completed_at: string | null
}

interface Job {
  id: number
  run_id: number
  name: string
  status: string
  conclusion: string | null
  started_at: string | null
  completed_at: string | null
  html_url?: string | null
  steps: Step[]
}

interface Artifact {
  id: number
  name: string
  size_in_bytes: number
  archive_download_url: string
  expired: boolean
  created_at: string
  expires_at: string | null
}

interface RunBundle {
  run: Run
  jobs: Job[]
  artifacts: Artifact[]
  log_text: string
  summary_lines: string[]
  audit_entries: AuditEntry[]
}

interface TriggerResponse {
  accepted: boolean
  message: string
  run: Run | null
}

interface DownloadResponse {
  path: string
}

interface ExportResponse {
  path: string
}

type InvokeArgs = Record<string, unknown> | undefined

const THEME_STORAGE_KEY = 'gham-theme-mode'
const PRESET_STORAGE_KEY = 'gham-local-presets'

const statusTone: Record<string, string> = {
  queued: 'queued',
  in_progress: 'running',
  completed: 'success',
  failure: 'danger',
  cancelled: 'muted',
  timed_out: 'danger',
}

async function safeInvoke<T>(command: string, args?: InvokeArgs): Promise<T> {
  return invoke<T>(command, args)
}

function toLocalTime(value: string | null | undefined) {
  if (!value) {
    return '-'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString('zh-CN', { hour12: false })
}

function storageKeyForWorkflow(workflowId: number) {
  return `${PRESET_STORAGE_KEY}:${workflowId}`
}

function readWorkflowPresets(workflowId: number): Array<{ name: string; ref: string; values: Record<string, FormValue> }> {
  const raw = window.localStorage.getItem(storageKeyForWorkflow(workflowId))
  if (!raw) {
    return []
  }
  try {
    return JSON.parse(raw) as Array<{ name: string; ref: string; values: Record<string, FormValue> }>
  } catch {
    return []
  }
}

function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('system')
  const [bootstrapped, setBootstrapped] = useState(false)
  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([])
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [workflows, setWorkflows] = useState<WorkflowDetails[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [runBundle, setRunBundle] = useState<RunBundle | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedRepoFullName, setSelectedRepoFullName] = useState<string | null>(null)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [repoQuery, setRepoQuery] = useState('')
  const [runFilter, setRunFilter] = useState<'all' | 'queued' | 'in_progress' | 'completed' | 'cancelled'>('all')
  const [selectedRef, setSelectedRef] = useState('')
  const [formValues, setFormValues] = useState<Record<string, FormValue>>({})
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [accountToken, setAccountToken] = useState('')
  const [loadingLabel, setLoadingLabel] = useState('')
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null
    if (storedTheme) {
      setThemeMode(storedTheme)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode)
  }, [themeMode])

  async function bootstrap() {
    setLoadingLabel('加载本地账户与审计记录')
    try {
      const data = await safeInvoke<BootstrapData>('bootstrap_app')
      setAccounts(data.accounts)
      setAuditEntries(data.audit_entries)
      setSelectedAccountId(data.selected_account_id ?? data.accounts[0]?.id ?? null)
      setSelectedRepoFullName(data.selected_repo_full_name)
      setBootstrapped(true)
    } catch (err) {
      setError(String(err))
      setBootstrapped(true)
    } finally {
      setLoadingLabel('')
    }
  }

  useEffect(() => {
    void bootstrap()
  }, [])

  async function loadRepositories(accountId: string) {
    setLoadingLabel('拉取仓库列表')
    setError('')
    try {
      const nextRepositories = await safeInvoke<Repository[]>('fetch_repositories', { accountId })
      setRepositories(nextRepositories)
      const nextRepo =
        nextRepositories.find((repo) => repo.full_name === selectedRepoFullName)?.full_name ??
        nextRepositories[0]?.full_name ??
        null
      setSelectedRepoFullName(nextRepo)
    } catch (err) {
      setError(String(err))
      setRepositories([])
    } finally {
      setLoadingLabel('')
    }
  }

  useEffect(() => {
    if (!selectedAccountId) {
      setRepositories([])
      return
    }
    void loadRepositories(selectedAccountId)
  }, [selectedAccountId])

  async function loadRepoData(accountId: string, repoFullName: string) {
    setLoadingLabel('同步 workflow 与运行记录')
    setError('')
    try {
      const [nextWorkflows, nextRuns] = await Promise.all([
        safeInvoke<WorkflowDetails[]>('fetch_workflows', { accountId, repoFullName }),
        safeInvoke<Run[]>('fetch_runs', { accountId, repoFullName, limit: 40 }),
      ])
      setWorkflows(nextWorkflows)
      setRuns(nextRuns)
      setSelectedWorkflowId(nextWorkflows[0]?.workflow.id ?? null)
      setSelectedRunId(nextRuns[0]?.id ?? null)
      setRunBundle(null)
    } catch (err) {
      setError(String(err))
      setWorkflows([])
      setRuns([])
      setRunBundle(null)
    } finally {
      setLoadingLabel('')
    }
  }

  useEffect(() => {
    if (!selectedAccountId || !selectedRepoFullName) {
      setWorkflows([])
      setRuns([])
      setRunBundle(null)
      return
    }
    void safeInvoke('set_selected_repository', { repoFullName: selectedRepoFullName }).catch(() => undefined)
    void loadRepoData(selectedAccountId, selectedRepoFullName)
  }, [selectedAccountId, selectedRepoFullName])

  useEffect(() => {
    if (!selectedAccountId || !selectedRepoFullName || !selectedRunId) {
      setRunBundle(null)
      return
    }

    let cancelled = false
    setLoadingLabel('拉取运行详情')
    void safeInvoke<RunBundle>('get_run_bundle', {
      accountId: selectedAccountId,
      repoFullName: selectedRepoFullName,
      runId: selectedRunId,
    })
      .then((bundle) => {
        if (!cancelled) {
          setRunBundle(bundle)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err))
          setRunBundle(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingLabel('')
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedAccountId, selectedRepoFullName, selectedRunId])

  const selectedRepository =
    repositories.find((repo) => repo.full_name === selectedRepoFullName) ?? null
  const selectedWorkflow =
    workflows.find((workflow) => workflow.workflow.id === selectedWorkflowId) ?? workflows[0] ?? null

  useEffect(() => {
    if (!selectedWorkflow) {
      setFormValues({})
      setSelectedRef(selectedRepository?.default_branch ?? 'main')
      return
    }

    const defaults: Record<string, FormValue> = {}
    selectedWorkflow.inputs.forEach((input) => {
      defaults[input.name] = inferDefaultValue(input)
    })
    setFormValues(defaults)
    setSelectedRef(selectedRepository?.default_branch ?? 'main')
  }, [selectedWorkflow?.workflow.id, selectedRepository?.default_branch])

  const visibleRepositories = useMemo(() => {
    const query = normalizeText(repoQuery)
    if (!query) {
      return repositories
    }
    return repositories.filter((repo) => {
      return (
        normalizeText(repo.full_name).includes(query) ||
        normalizeText(repo.language ?? '').includes(query) ||
        normalizeText(repo.owner.login).includes(query)
      )
    })
  }, [repositories, repoQuery])

  const visibleRuns = useMemo(() => {
    if (runFilter === 'all') {
      return runs
    }
    return runs.filter((run) => run.status === runFilter)
  }, [runs, runFilter])

  const insights = useMemo(() => {
    const successCount = runs.filter((run) => run.conclusion === 'success').length
    return {
      totalRuns: runs.length,
      successRate: runs.length === 0 ? 0 : Math.round((successCount / runs.length) * 100),
      runningCount: runs.filter((run) => run.status === 'in_progress').length,
    }
  }, [runs])

  async function handleAddAccount() {
    if (!accountName.trim() || !accountToken.trim()) {
      setToast('账户名称和 Token 不能为空')
      return
    }

    setLoadingLabel('验证并保存账户')
    setError('')
    try {
      const account = await safeInvoke<AccountSummary>('add_account', {
        name: accountName.trim(),
        token: accountToken.trim(),
      })
      const nextAccounts = [...accounts, account]
      setAccounts(nextAccounts)
      setSelectedAccountId(account.id)
      setAccountName('')
      setAccountToken('')
      setShowAddAccount(false)
      await safeInvoke('set_current_account', { accountId: account.id })
      setToast(`已添加账户：${account.name}`)
      await bootstrap()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoadingLabel('')
    }
  }

  async function handleRemoveAccount(accountId: string) {
    if (!window.confirm('确定要移除这个账户吗？')) {
      return
    }
    setLoadingLabel('移除账户')
    try {
      await safeInvoke('remove_account', { accountId })
      setToast('账户已移除')
      await bootstrap()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoadingLabel('')
    }
  }

  async function refreshRuns() {
    if (!selectedAccountId || !selectedRepoFullName) {
      return
    }
    setLoadingLabel('刷新运行记录')
    try {
      const nextRuns = await safeInvoke<Run[]>('fetch_runs', {
        accountId: selectedAccountId,
        repoFullName: selectedRepoFullName,
        limit: 40,
      })
      setRuns(nextRuns)
      setSelectedRunId(nextRuns[0]?.id ?? null)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoadingLabel('')
    }
  }

  async function handleTriggerWorkflow() {
    if (!selectedAccountId || !selectedRepoFullName || !selectedWorkflow) {
      return
    }

    const missingRequired = selectedWorkflow.inputs.find((input) => {
      if (!input.required) {
        return false
      }
      const value = formValues[input.name]
      return value === '' || value === null || value === undefined
    })

    if (missingRequired) {
      setToast(`缺少必填参数：${missingRequired.label}`)
      return
    }

    setLoadingLabel('触发 workflow')
    setError('')
    try {
      const response = await safeInvoke<TriggerResponse>('trigger_workflow', {
        accountId: selectedAccountId,
        repoFullName: selectedRepoFullName,
        workflowId: selectedWorkflow.workflow.id,
        refBranch: selectedRef,
        inputs: formValues,
      })
      setToast(response.message)
      await refreshRuns()
      await bootstrap()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoadingLabel('')
    }
  }

  async function handleRunAction(command: 'cancel_run' | 'rerun_run' | 'rerun_failed_jobs') {
    if (!selectedAccountId || !selectedRepoFullName || !runBundle) {
      return
    }
    setLoadingLabel('执行运行操作')
    setError('')
    try {
      await safeInvoke(command, {
        accountId: selectedAccountId,
        repoFullName: selectedRepoFullName,
        runId: runBundle.run.id,
      })
      setToast('操作已提交到 GitHub')
      await refreshRuns()
      await bootstrap()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoadingLabel('')
    }
  }

  async function handleDownloadArtifact(artifact: Artifact) {
    if (!selectedAccountId || !selectedRepoFullName) {
      return
    }
    setLoadingLabel('下载 Artifact')
    try {
      const response = await safeInvoke<DownloadResponse>('download_artifact', {
        accountId: selectedAccountId,
        repoFullName: selectedRepoFullName,
        artifactId: artifact.id,
        artifactName: artifact.name,
      })
      setToast(`已下载到：${response.path}`)
      await bootstrap()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoadingLabel('')
    }
  }

  async function handleExport(format: 'markdown' | 'json') {
    if (!selectedAccountId || !selectedRepoFullName || !runBundle) {
      return
    }
    setLoadingLabel('导出运行报告')
    try {
      const response = await safeInvoke<ExportResponse>('export_run_report', {
        accountId: selectedAccountId,
        repoFullName: selectedRepoFullName,
        runId: runBundle.run.id,
        format: format === 'json' ? 'json' : 'markdown',
      })
      setToast(`已导出：${response.path}`)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoadingLabel('')
    }
  }

  function savePreset() {
    if (!selectedWorkflow) {
      return
    }
    const name = window.prompt('输入预设名称')
    if (!name) {
      return
    }
    const nextPresets = [
      ...readWorkflowPresets(selectedWorkflow.workflow.id),
      { name, ref: selectedRef, values: formValues },
    ]
    window.localStorage.setItem(
      storageKeyForWorkflow(selectedWorkflow.workflow.id),
      JSON.stringify(nextPresets),
    )
    setToast(`已保存预设：${name}`)
  }

  function applyPreset(index: number) {
    if (!selectedWorkflow) {
      return
    }
    const presets = readWorkflowPresets(selectedWorkflow.workflow.id)
    const preset = presets[index]
    if (!preset) {
      return
    }
    setSelectedRef(preset.ref)
    setFormValues(preset.values)
    setToast(`已加载预设：${preset.name}`)
  }

  const presets = selectedWorkflow ? readWorkflowPresets(selectedWorkflow.workflow.id) : []

  if (!bootstrapped) {
    return <div className="shell"><div className="panel">正在启动应用…</div></div>
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Cross-platform GitHub Actions Desk</p>
          <h1>GitHub Action Management</h1>
        </div>
        <div className="topbar-actions">
          <div className="theme-toggle" role="tablist" aria-label="Theme mode">
            {(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => (
              <button
                key={mode}
                className={themeMode === mode ? 'active' : ''}
                onClick={() => setThemeMode(mode)}
              >
                {mode === 'system' ? '跟随系统' : mode === 'light' ? '浅色' : '深色'}
              </button>
            ))}
          </div>
          <button className="primary-button" onClick={handleTriggerWorkflow} disabled={!selectedWorkflow}>
            立即触发
          </button>
        </div>
      </header>

      {loadingLabel ? <div className="loading-banner">{loadingLabel}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <main className="workspace">
        <aside className="rail">
          <section className="panel account-panel">
            <div className="section-title">
              <span>账户与仓库</span>
              <div className="inline-actions">
                <span className="pill neutral">{accounts.length} 个账户</span>
                <button className="ghost-button" onClick={() => setShowAddAccount((value) => !value)}>
                  {showAddAccount ? '收起' : '添加账户'}
                </button>
              </div>
            </div>

            {showAddAccount ? (
              <div className="account-form">
                <label className="field">
                  <span>账户名称</span>
                  <input value={accountName} onChange={(event) => setAccountName(event.target.value)} />
                </label>
                <label className="field">
                  <span>GitHub PAT</span>
                  <input
                    type="password"
                    value={accountToken}
                    onChange={(event) => setAccountToken(event.target.value)}
                  />
                  <small>建议最小权限：`repo`、`workflow`、`actions`</small>
                </label>
                <div className="inline-actions">
                  <button className="primary-button" onClick={handleAddAccount}>保存账户</button>
                </div>
              </div>
            ) : null}

            <div className="account-list">
              {accounts.map((account) => (
                <div key={account.id} className={`account-card ${account.id === selectedAccountId ? 'selected' : ''}`}>
                  <button
                    className="account-select"
                    onClick={async () => {
                      setSelectedAccountId(account.id)
                      await safeInvoke('set_current_account', { accountId: account.id }).catch(() => undefined)
                    }}
                  >
                    <div>
                      <strong>{account.name}</strong>
                      <span>上次使用：{toLocalTime(account.last_used_at)}</span>
                    </div>
                    <span className={`dot ${account.token_status}`} />
                  </button>
                  <button className="remove-button" onClick={() => void handleRemoveAccount(account.id)}>
                    移除
                  </button>
                </div>
              ))}
            </div>

            <label className="search-field">
              <span>仓库搜索</span>
              <input
                placeholder="名称 / Owner / 语言"
                value={repoQuery}
                onChange={(event) => setRepoQuery(event.target.value)}
              />
            </label>

            <div className="repo-list">
              {visibleRepositories.map((repo) => (
                <button
                  key={repo.id}
                  className={`repo-card ${repo.full_name === selectedRepoFullName ? 'selected' : ''}`}
                  onClick={() => setSelectedRepoFullName(repo.full_name)}
                >
                  <div className="repo-main">
                    <strong>{repo.name}</strong>
                    <span>{repo.full_name}</span>
                  </div>
                  <div className="repo-meta">
                    <span className="language-tag">{repo.language ?? 'Unknown'}</span>
                    <span>{repo.private ? 'private' : 'public'}</span>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="panel insights-panel">
            <div className="section-title">
              <span>运行洞察</span>
              <span className="pill info">当前仓库</span>
            </div>
            <div className="insight-grid">
              <article>
                <span>成功率</span>
                <strong>{insights.successRate}%</strong>
              </article>
              <article>
                <span>运行中</span>
                <strong>{insights.runningCount}</strong>
              </article>
              <article>
                <span>总运行数</span>
                <strong>{insights.totalRuns}</strong>
              </article>
            </div>
          </section>
        </aside>

        <section className="center-column">
          <section className="panel hero-panel">
            <div className="hero-copy">
              <p className="eyebrow">PRD 对齐工作台</p>
              <h2>{selectedRepository?.full_name ?? '先添加账户并选择仓库'}</h2>
              <p>
                已接入真实 GitHub API 调用、系统钥匙串存储和本地审计记录。工作台围绕账户、Workflow Dispatch、运行监控、日志与制品处理展开。
              </p>
            </div>
            <div className="hero-metrics">
              <div className="metric-card">
                <span>默认分支</span>
                <strong>{selectedRepository?.default_branch ?? '-'}</strong>
              </div>
              <div className="metric-card">
                <span>最近更新</span>
                <strong>{toLocalTime(selectedRepository?.updated_at)}</strong>
              </div>
              <div className="metric-card">
                <span>Workflow 数</span>
                <strong>{workflows.length}</strong>
              </div>
            </div>
          </section>

          <section className="panel workflow-panel">
            <div className="section-title">
              <span>Workflow Dispatch</span>
              <div className="inline-actions">
                <button className="ghost-button" onClick={savePreset} disabled={!selectedWorkflow}>
                  保存为预设
                </button>
                <button className="ghost-button" onClick={() => void refreshRuns()}>
                  刷新运行记录
                </button>
              </div>
            </div>

            <div className="workflow-grid">
              <div className="workflow-list">
                {workflows.length > 0 ? workflows.map((item) => (
                  <button
                    key={item.workflow.id}
                    className={`workflow-card ${item.workflow.id === selectedWorkflowId ? 'selected' : ''}`}
                    onClick={() => setSelectedWorkflowId(item.workflow.id)}
                  >
                    <div className="workflow-card-head">
                      <strong>{item.workflow.name}</strong>
                      <span className={`pill ${item.workflow.state === 'active' ? 'success' : 'neutral'}`}>
                        {item.workflow.state}
                      </span>
                    </div>
                    <p>{item.workflow.path}</p>
                    <div className="workflow-card-meta">
                      <span>{item.inputs.length} 个参数</span>
                      <span>{toLocalTime(item.workflow.updated_at)}</span>
                    </div>
                  </button>
                )) : <div className="empty-state">当前仓库没有发现可用 workflow。</div>}
              </div>

              <div className="dispatch-card">
                {selectedWorkflow ? (
                  <>
                    <div className="dispatch-header">
                      <div>
                        <h3>{selectedWorkflow.workflow.name}</h3>
                        <p>{selectedWorkflow.workflow.path}</p>
                      </div>
                      <span className="pill info">{selectedWorkflow.inputs.length} inputs</span>
                    </div>

                    <div className="preset-row">
                      {presets.length > 0 ? presets.map((preset, index) => (
                        <button key={`${preset.name}-${index}`} className="preset-chip" onClick={() => applyPreset(index)}>
                          {preset.name}
                        </button>
                      )) : <span className="empty-inline">没有保存的参数预设</span>}
                    </div>

                    <div className="form-grid">
                      <label className="field">
                        <span>Ref / Branch / SHA</span>
                        <input value={selectedRef} onChange={(event) => setSelectedRef(event.target.value)} />
                      </label>

                      {selectedWorkflow.inputs.map((input) => (
                        <label className="field" key={input.name}>
                          <span>
                            {input.label}
                            {input.required ? <em>*</em> : null}
                          </span>
                          {input.type === 'boolean' ? (
                            <label className="switch" htmlFor={input.name}>
                              <input
                                id={input.name}
                                type="checkbox"
                                checked={Boolean(formValues[input.name])}
                                onChange={(event) =>
                                  setFormValues((current) => ({
                                    ...current,
                                    [input.name]: event.target.checked,
                                  }))
                                }
                              />
                              <span className="switch-track" />
                            </label>
                          ) : input.options.length > 0 ? (
                            <select
                              value={String(formValues[input.name] ?? '')}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  [input.name]:
                                    input.type === 'number' ? Number(event.target.value) : event.target.value,
                                }))
                              }
                            >
                              {input.options.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type={input.type === 'number' ? 'number' : 'text'}
                              value={String(formValues[input.name] ?? '')}
                              onChange={(event) =>
                                setFormValues((current) => ({
                                  ...current,
                                  [input.name]:
                                    input.type === 'number' ? Number(event.target.value) : event.target.value,
                                }))
                              }
                            />
                          )}
                          <small>{input.description ?? `字段类型：${input.type}`}</small>
                        </label>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="empty-state">选择一个 workflow 后才能触发。</div>
                )}
              </div>
            </div>
          </section>

          <section className="panel runs-panel">
            <div className="section-title">
              <span>运行记录</span>
              <div className="inline-actions">
                {(['all', 'queued', 'in_progress', 'completed', 'cancelled'] as const).map((filter) => (
                  <button
                    key={filter}
                    className={`filter-chip ${runFilter === filter ? 'active' : ''}`}
                    onClick={() => setRunFilter(filter)}
                  >
                    {filter === 'all'
                      ? '全部'
                      : filter === 'queued'
                        ? '排队中'
                        : filter === 'in_progress'
                          ? '运行中'
                          : filter === 'completed'
                            ? '已完成'
                            : '已取消'}
                  </button>
                ))}
              </div>
            </div>

            <div className="run-list">
              {visibleRuns.length > 0 ? visibleRuns.map((run) => (
                <button
                  key={run.id}
                  className={`run-card ${run.id === selectedRunId ? 'selected' : ''}`}
                  onClick={() => setSelectedRunId(run.id)}
                >
                  <div className="run-card-head">
                    <div>
                      <strong>{run.display_title ?? run.name}</strong>
                      <span>#{run.id} · {run.head_branch} · {toLocalTime(run.created_at)}</span>
                    </div>
                    <div className="run-badges">
                      <span className={`status-badge ${statusTone[run.status] ?? 'neutral'}`}>{run.status}</span>
                      {run.conclusion ? (
                        <span className={`status-badge ${statusTone[run.conclusion] ?? 'neutral'}`}>{run.conclusion}</span>
                      ) : null}
                    </div>
                  </div>
                  <p>{run.event ?? 'workflow_dispatch'} · attempt {run.run_attempt ?? 1}</p>
                </button>
              )) : <div className="empty-state">没有符合筛选条件的运行记录。</div>}
            </div>
          </section>
        </section>

        <aside className="details-column">
          <section className="panel detail-panel">
            <div className="section-title">
              <span>运行详情</span>
              <div className="inline-actions">
                <button className="ghost-button" onClick={() => void handleRunAction('cancel_run')} disabled={!runBundle || runBundle.run.status !== 'in_progress'}>
                  取消运行
                </button>
                <button className="ghost-button" onClick={() => void handleRunAction('rerun_failed_jobs')} disabled={!runBundle}>
                  重跑失败 Job
                </button>
                <button className="ghost-button" onClick={() => void handleRunAction('rerun_run')} disabled={!runBundle}>
                  重跑全部
                </button>
              </div>
            </div>

            {runBundle ? (
              <>
                <div className="detail-header">
                  <div>
                    <h3>{runBundle.run.display_title ?? runBundle.run.name}</h3>
                    <p>
                      {runBundle.run.head_branch} · {runBundle.run.head_sha}
                    </p>
                  </div>
                  <span className={`status-badge ${statusTone[runBundle.run.status] ?? 'neutral'}`}>
                    {runBundle.run.status}
                  </span>
                </div>

                <div className="detail-block">
                  <h4>Summary</h4>
                  <ul>
                    {runBundle.summary_lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <div className="inline-actions">
                    <button className="ghost-button" onClick={() => void handleExport('markdown')}>导出 Markdown</button>
                    <button className="ghost-button" onClick={() => void handleExport('json')}>导出 JSON</button>
                    <a className="ghost-link" href={runBundle.run.html_url} target="_blank" rel="noreferrer">
                      GitHub 页面
                    </a>
                  </div>
                </div>

                <div className="detail-block">
                  <h4>Jobs</h4>
                  <div className="audit-list">
                    {runBundle.jobs.map((job) => (
                      <article key={job.id}>
                        <strong>{job.name}</strong>
                        <span>{job.status} / {job.conclusion ?? 'n/a'} · {job.steps.length} steps</span>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="detail-block">
                  <h4>Artifacts</h4>
                  <div className="artifact-list">
                    {runBundle.artifacts.map((artifact) => (
                      <article className="artifact-card" key={artifact.id}>
                        <div>
                          <strong>{artifact.name}</strong>
                          <span>{Math.max(1, Math.round(artifact.size_in_bytes / 1024))} KB</span>
                        </div>
                        <div className="inline-actions">
                          <span className={`pill ${artifact.expired ? 'neutral' : 'success'}`}>
                            {artifact.expired ? 'expired' : 'ready'}
                          </span>
                          <button className="ghost-button" onClick={() => void handleDownloadArtifact(artifact)} disabled={artifact.expired}>
                            下载
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="detail-block">
                  <h4>实时日志</h4>
                  <div className="terminal">
                    {runBundle.log_text || '暂无日志'}
                  </div>
                </div>

                <div className="detail-block">
                  <h4>审计轨迹</h4>
                  <div className="audit-list">
                    {(runBundle.audit_entries.length > 0 ? runBundle.audit_entries : auditEntries.slice(0, 6)).map((entry) => (
                      <article key={entry.id}>
                        <strong>{entry.action}</strong>
                        <span>{entry.message} · {toLocalTime(entry.created_at)}</span>
                      </article>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="empty-state">选择一条运行记录后显示详情。</div>
            )}
          </section>
        </aside>
      </main>

      {toast ? (
        <div className="toast" onAnimationEnd={() => setToast('')}>
          {toast}
        </div>
      ) : null}
    </div>
  )
}

export default App
