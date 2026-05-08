import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/tauri'
import { open } from '@tauri-apps/api/dialog'
import './App.css'
import { inferDefaultValue, normalizeText, type FormValue } from './lib/workflow-utils'

type ThemeMode = 'light' | 'dark'

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
  download_settings: DownloadSettings
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
  check_suite_id?: number | null
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

interface ArtifactPreview {
  artifact_id: number
  artifact_name: string
  entry_path: string
  content: string
}

interface RunBundle {
  run: Run
  jobs: Job[]
  artifacts: Artifact[]
  artifact_previews: ArtifactPreview[]
  log_text: string
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

interface DownloadSettings {
  download_dir: string | null
}

type InvokeArgs = Record<string, unknown> | undefined

const THEME_STORAGE_KEY = 'gham-theme-mode'

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

const plainTextInputProps = {
  autoCapitalize: 'none' as const,
  autoCorrect: 'off' as const,
  spellCheck: false,
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

function splitLogSections(logText: string) {
  if (!logText.trim()) {
    return []
  }

  const sections = logText
    .split(/^## Job:\s+/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean)

  if (sections.length <= 1 && !logText.includes('## Job:')) {
    return [{ title: '运行日志', body: logText.trim() }]
  }

  return sections.map((section, index) => {
    const [titleLine, ...rest] = section.split('\n')
    return {
      title: titleLine?.trim() || `Job ${index + 1}`,
      body: rest.join('\n').trim(),
    }
  })
}

function ellipsize(value: string | null | undefined, max = 88) {
  const text = (value ?? '').trim()
  if (!text) {
    return ''
  }
  if (text.length <= max) {
    return text
  }
  return `${text.slice(0, max - 1)}…`
}

function App() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark')
  const [bootstrapped, setBootstrapped] = useState(false)
  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [branches, setBranches] = useState<string[]>([])
  const [workflows, setWorkflows] = useState<WorkflowDetails[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [runBundle, setRunBundle] = useState<RunBundle | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [selectedRepoFullName, setSelectedRepoFullName] = useState<string | null>(null)
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [repoQuery, setRepoQuery] = useState('')
  const [showAllRepos, setShowAllRepos] = useState(true)
  const [selectedRef, setSelectedRef] = useState('')
  const [formValues, setFormValues] = useState<Record<string, FormValue>>({})
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [accountToken, setAccountToken] = useState('')
  const [downloadDir, setDownloadDir] = useState('')
  const [loadingLabel, setLoadingLabel] = useState('')
  const [toast, setToast] = useState('')
  const [error, setError] = useState('')
  const [triggerFlash, setTriggerFlash] = useState(false)

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeMode | null
    if (storedTheme === 'light' || storedTheme === 'dark') {
      setThemeMode(storedTheme)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode)
  }, [themeMode])

  useEffect(() => {
    if (!triggerFlash) {
      return
    }
    const timer = window.setTimeout(() => setTriggerFlash(false), 900)
    return () => window.clearTimeout(timer)
  }, [triggerFlash])

  async function bootstrap() {
    setLoadingLabel('加载本地账户与审计记录')
    try {
      const data = await safeInvoke<BootstrapData>('bootstrap_app')
      setAccounts(data.accounts)
      setSelectedAccountId(data.selected_account_id ?? data.accounts[0]?.id ?? null)
      setSelectedRepoFullName(data.selected_repo_full_name)
      setDownloadDir(data.download_settings.download_dir ?? '')
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

  async function loadRepositories(accountId: string, allAccessible = showAllRepos) {
    setLoadingLabel('拉取仓库列表')
    setError('')
    try {
      const nextRepositories = await safeInvoke<Repository[]>('fetch_repositories', {
        accountId,
        allAccessible,
      })
      setRepositories(nextRepositories)
      const nextRepo =
        nextRepositories.find((repo) => repo.full_name === selectedRepoFullName)?.full_name ??
        nextRepositories[0]?.full_name ??
        null
      setSelectedRepoFullName(nextRepo)
    } catch (err) {
      setError(String(err))
      setRepositories([])
      setBranches([])
    } finally {
      setLoadingLabel('')
    }
  }

  useEffect(() => {
    if (!selectedAccountId) {
      setRepositories([])
      setBranches([])
      return
    }
    void loadRepositories(selectedAccountId, showAllRepos)
  }, [selectedAccountId, showAllRepos])

  async function loadRepoData(accountId: string, repoFullName: string, reference?: string) {
    setLoadingLabel('同步 workflow')
    setError('')
    setSelectedWorkflowId(null)
    setRuns([])
    setSelectedRunId(null)
    setRunBundle(null)
    try {
      const [nextWorkflows, nextBranches] = await Promise.all([
        safeInvoke<WorkflowDetails[]>('fetch_workflows', {
          accountId,
          repoFullName,
          reference,
        }),
        safeInvoke<string[]>('fetch_branches', {
          accountId,
          repoFullName,
        })
      ])
      setWorkflows(nextWorkflows)
      setBranches(nextBranches)
      setSelectedWorkflowId(nextWorkflows[0]?.workflow.id ?? null)
      setRuns([])
      setSelectedRunId(null)
      setRunBundle(null)
    } catch (err) {
      setError(String(err))
      setWorkflows([])
      setBranches([])
      setRuns([])
      setSelectedWorkflowId(null)
      setSelectedRunId(null)
      setRunBundle(null)
    } finally {
      setLoadingLabel('')
    }
  }

  async function loadRuns(
    accountId: string,
    repoFullName: string,
    workflowId: number | null,
    silent = false,
  ) {
    if (!workflowId) {
      setRuns([])
      setSelectedRunId(null)
      return
    }
    if (!silent) {
      setLoadingLabel('同步运行记录')
      setError('')
    }
    try {
      const nextRuns = await safeInvoke<Run[]>('fetch_runs', {
        accountId,
        repoFullName,
        workflowId,
        limit: 40,
      })
      setRuns(nextRuns)
      setSelectedRunId((current) =>
        nextRuns.some((run) => run.id === current) ? current : (nextRuns[0]?.id ?? null),
      )
    } catch (err) {
      if (!silent) {
        setError(String(err))
      }
      setRuns([])
      setSelectedRunId(null)
    } finally {
      if (!silent) {
        setLoadingLabel('')
      }
    }
  }

  async function fetchRunBundle(accountId: string, repoFullName: string, runId: number, silent = false) {
    if (!silent) {
      setLoadingLabel('拉取运行详情')
    }
    try {
      const bundle = await safeInvoke<RunBundle>('get_run_bundle', {
        accountId,
        repoFullName,
        runId,
      })
      setRunBundle(bundle)
      return bundle
    } catch (err) {
      if (!silent) {
        setError(String(err))
      }
      setRunBundle(null)
      return null
    } finally {
      if (!silent) {
        setLoadingLabel('')
      }
    }
  }

  useEffect(() => {
    if (!selectedAccountId || !selectedRepoFullName) {
      setWorkflows([])
      setBranches([])
      setRuns([])
      setSelectedWorkflowId(null)
      setSelectedRunId(null)
      setRunBundle(null)
      return
    }
    const selectedRepo = repositories.find((repo) => repo.full_name === selectedRepoFullName)
    void safeInvoke('set_selected_repository', { repoFullName: selectedRepoFullName }).catch(() => undefined)
    void loadRepoData(selectedAccountId, selectedRepoFullName, selectedRepo?.default_branch)
  }, [repositories, selectedAccountId, selectedRepoFullName])

  useEffect(() => {
    if (!selectedAccountId || !selectedRepoFullName) {
      setRuns([])
      setSelectedRunId(null)
      return
    }

    void loadRuns(selectedAccountId, selectedRepoFullName, selectedWorkflowId)
  }, [selectedAccountId, selectedRepoFullName, selectedWorkflowId])

  useEffect(() => {
    if (!selectedAccountId || !selectedRepoFullName || !selectedRunId) {
      setRunBundle(null)
      return
    }

    let cancelled = false
    void fetchRunBundle(selectedAccountId, selectedRepoFullName, selectedRunId)
      .then((bundle) => {
        if (!cancelled) {
          setRunBundle(bundle)
        }
      })

    return () => {
      cancelled = true
    }
  }, [selectedAccountId, selectedRepoFullName, selectedRunId])

  useEffect(() => {
    if (!selectedAccountId || !selectedRepoFullName || !selectedRunId || !runBundle) {
      return
    }
    if (runBundle.run.status === 'completed') {
      return
    }

    const timer = window.setInterval(() => {
      void loadRuns(selectedAccountId, selectedRepoFullName, selectedWorkflowId, true)
      void fetchRunBundle(selectedAccountId, selectedRepoFullName, selectedRunId, true)
    }, 4000)

    return () => window.clearInterval(timer)
  }, [selectedAccountId, selectedRepoFullName, selectedRunId, selectedWorkflowId, runBundle?.run.status])

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
      return normalizeText(repo.name).includes(query)
    })
  }, [repositories, repoQuery])

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
    await loadRuns(selectedAccountId, selectedRepoFullName, selectedWorkflowId)
  }

  async function handleSaveDownloadSettings() {
    setLoadingLabel('保存下载路径配置')
    setError('')
    try {
      const settings = await safeInvoke<DownloadSettings>('update_download_settings', {
        downloadDir,
      })
      setDownloadDir(settings.download_dir ?? '')
      setToast('下载路径已保存')
    } catch (err) {
      setError(String(err))
    } finally {
      setLoadingLabel('')
    }
  }

  async function handlePickDownloadDir() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        defaultPath: downloadDir || undefined,
      })
      if (typeof selected === 'string') {
        setDownloadDir(selected)
      }
    } catch (err) {
      setError(String(err))
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
      if (response.run) {
        setSelectedRunId(response.run.id)
      }
      setTriggerFlash(true)
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

  const logSections = useMemo(
    () => splitLogSections(runBundle?.log_text ?? ''),
    [runBundle?.log_text],
  )
  const logSectionMap = useMemo(
    () => new Map(logSections.map((section) => [section.title, section.body])),
    [logSections],
  )
  const activeArtifactPreview = runBundle?.artifact_previews[0] ?? null

  if (!bootstrapped) {
    return <div className="shell"><div className="panel">正在启动应用…</div></div>
  }

  return (
    <div className="shell">
      {loadingLabel ? <div className="loading-banner">{loadingLabel}</div> : null}
      {error ? <div className="error-banner">{error}</div> : null}

      <main className="workspace">
        <aside className="rail">
          <section className="panel account-panel">
            <div className="theme-strip">
              <div className="theme-toggle" role="tablist" aria-label="Theme mode">
                {(['light', 'dark'] as ThemeMode[]).map((mode) => (
                  <button
                    key={mode}
                    className={themeMode === mode ? 'active' : ''}
                    onClick={() => setThemeMode(mode)}
                  >
                    {mode === 'light' ? '浅色' : '深色'}
                  </button>
                ))}
              </div>
            </div>

            <div className="section-title">
              <span>账户</span>
              <button className="ghost-button add-account-button" onClick={() => setShowAddAccount((value) => !value)}>
                {showAddAccount ? '收起' : '添加账户'}
              </button>
            </div>

            <div className="rail-filters">
              <button
                className={`filter-chip repo-scope-chip ${showAllRepos ? 'active' : ''}`}
                onClick={() => setShowAllRepos((value) => !value)}
                type="button"
              >
                all repo
              </button>
            </div>

            {showAddAccount ? (
              <div className="account-form">
                <label className="field">
                  <span>账户名称</span>
                  <input {...plainTextInputProps} value={accountName} onChange={(event) => setAccountName(event.target.value)} />
                </label>
                <label className="field">
                  <span>GitHub PAT</span>
                  <input
                    {...plainTextInputProps}
                    type="password"
                    value={accountToken}
                    onChange={(event) => setAccountToken(event.target.value)}
                  />
                  <small>建议最小权限：`repo`、`workflow`、`actions`。PAT 会保存到本地数据库文件。</small>
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
                    title={account.name}
                  >
                    <strong className="truncate-1">{account.name}</strong>
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
                {...plainTextInputProps}
                placeholder="仅按仓库名搜索"
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
                  title={repo.full_name}
                >
                  <strong className="repo-name">{repo.name}</strong>
                </button>
              ))}
            </div>

            <div className="download-settings">
              <div className="section-title compact">
                <span>下载路径</span>
              </div>
              <label className="field">
                <span>统一下载目录</span>
                <input
                  {...plainTextInputProps}
                  placeholder="默认：Downloads/github-actions-artifacts"
                  value={downloadDir}
                  onChange={(event) => setDownloadDir(event.target.value)}
                />
              </label>
              <div className="inline-actions">
                <button className="ghost-button" onClick={() => void handlePickDownloadDir()}>
                  选择目录
                </button>
                <button className="ghost-button" onClick={() => void handleSaveDownloadSettings()}>
                  保存路径
                </button>
              </div>
            </div>
          </section>

        </aside>

        <section className="content-stack">
          <div className="top-panels">
            <section className="panel workflow-panel">
            <div className="section-title">
              <span>Workflow Dispatch</span>
            </div>

            <div className="workflow-grid">
              <div className="workflow-list scroll-panel">
                {workflows.length > 0 ? workflows.map((item) => (
                  <button
                    key={item.workflow.id}
                    className={`workflow-card ${item.workflow.id === selectedWorkflowId ? 'selected' : ''}`}
                    onClick={() => setSelectedWorkflowId(item.workflow.id)}
                    title={item.workflow.name}
                  >
                    <div className="workflow-card-head">
                      <strong className="truncate-1">{item.workflow.name}</strong>
                      <span className={`pill ${item.workflow.state === 'active' ? 'success' : 'neutral'}`}>
                        {item.workflow.state}
                      </span>
                    </div>
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
                        <h3 title={selectedWorkflow.workflow.name}>{selectedWorkflow.workflow.name}</h3>
                      </div>
                      <span className="pill info">{selectedWorkflow.inputs.length} inputs</span>
                    </div>

                    <div className="dispatch-body scroll-panel">
                      <div className="form-grid">
                        <label className="field field-span-2">
                          <span>Ref / Branch / SHA</span>
                          {branches.length > 0 ? (
                            <select value={selectedRef} onChange={(event) => setSelectedRef(event.target.value)}>
                              {branches.map((branch) => (
                                <option key={branch} value={branch}>
                                  {branch}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input {...plainTextInputProps} value={selectedRef} onChange={(event) => setSelectedRef(event.target.value)} />
                          )}
                        </label>

                        {selectedWorkflow.inputs.map((input) => (
                          <label className="field" key={input.name} title={input.description ?? input.label}>
                            <span>
                              <span className="truncate-1">{input.label}</span>
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
                                {...plainTextInputProps}
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
                            <small title={input.description ?? `字段类型：${input.type}`}>
                              {ellipsize(input.description ?? `字段类型：${input.type}`, 72)}
                            </small>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div className="dispatch-actions">
                      <button
                        className={`primary-button ${triggerFlash ? 'trigger-success' : ''}`}
                        onClick={handleTriggerWorkflow}
                        disabled={!selectedWorkflow}
                      >
                        立即触发
                      </button>
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
                <button className="ghost-button" onClick={() => void refreshRuns()} disabled={!selectedRepoFullName}>
                  刷新运行记录
                </button>
              </div>
            </div>

            <div className="run-list scroll-panel run-list-compact">
              {runs.length > 0 ? runs.map((run) => (
                <button
                  key={run.id}
                  className={`run-card ${run.id === selectedRunId ? 'selected' : ''}`}
                  onClick={() => setSelectedRunId(run.id)}
                  title={run.display_title ?? run.name}
                >
                  <div className="run-card-head">
                    <div>
                      <strong className="truncate-1">{run.display_title ?? run.name}</strong>
                      <span className="truncate-1" title={`#${run.id} · ${run.head_branch} · ${toLocalTime(run.created_at)}`}>
                        #{run.id} · {run.head_branch} · {toLocalTime(run.created_at)}
                      </span>
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
          </div>

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
                  <h4>Jobs</h4>
                  <div className="audit-list">
                    {runBundle.jobs.map((job) => (
                      <article key={job.id} title={job.name}>
                        <strong className="truncate-1">{job.name}</strong>
                        <span className="truncate-1" title={`${job.status} / ${job.conclusion ?? 'n/a'} · ${job.steps.length} steps`}>
                          {job.status} / {job.conclusion ?? 'n/a'} · {job.steps.length} steps
                        </span>
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
                          <strong className="truncate-1" title={artifact.name}>{artifact.name}</strong>
                          <span>{Math.max(1, Math.round(artifact.size_in_bytes / 1024))} KB</span>
                        </div>
                        <div className="inline-actions">
                          <span className={`pill ${artifact.expired ? 'neutral' : 'success'}`}>
                            {artifact.expired ? 'expired' : 'ready'}
                          </span>
                          {runBundle.artifact_previews.some((preview) => preview.artifact_id === artifact.id) ? (
                            <span className="pill info">summary.md</span>
                          ) : (
                            <button className="ghost-button" onClick={() => void handleDownloadArtifact(artifact)} disabled={artifact.expired}>
                              下载
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                {activeArtifactPreview ? (
                  <div className="detail-block">
                    <h4>Artifact 文档</h4>
                    <article className="log-card">
                      <header>
                        <div className="log-card-title">
                          <strong className="truncate-1" title={activeArtifactPreview.artifact_name}>
                            {activeArtifactPreview.artifact_name}
                          </strong>
                          <span className="pill info">{activeArtifactPreview.entry_path}</span>
                        </div>
                      </header>
                      <pre className="document-preview">{activeArtifactPreview.content || '文档为空'}</pre>
                    </article>
                  </div>
                ) : null}

                <div className="detail-block">
                  <h4>实时日志</h4>
                  <div className="log-stack scroll-panel">
                    {runBundle.jobs.length > 0 ? runBundle.jobs.map((job) => (
                      <article key={job.id} className="log-card">
                        <header>
                          <div className="log-card-title">
                            <strong className="truncate-1" title={job.name}>{job.name}</strong>
                            <span className={`status-badge ${statusTone[job.conclusion ?? job.status] ?? 'neutral'}`}>
                              {job.conclusion ?? job.status}
                            </span>
                          </div>
                          <p className="truncate-1" title={job.steps.map((step) => step.name).join(' · ')}>
                            {job.steps.length > 0
                              ? job.steps.map((step) => step.name).join(' · ')
                              : '暂无 step 信息'}
                          </p>
                        </header>
                        <pre>{logSectionMap.get(job.name) || '暂无日志内容'}</pre>
                      </article>
                    )) : (
                      <div className="terminal">暂无日志</div>
                    )}
                  </div>
                </div>

                <div className="inline-actions detail-links">
                  <button className="ghost-button" onClick={() => void handleExport('markdown')}>导出 Markdown</button>
                  <button className="ghost-button" onClick={() => void handleExport('json')}>导出 JSON</button>
                  <a className="ghost-link" href={runBundle.run.html_url} target="_blank" rel="noreferrer">
                    GitHub 页面
                  </a>
                </div>

              </>
            ) : (
              <div className="empty-state">选择一条运行记录后显示详情。</div>
            )}
          </section>
        </section>
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
