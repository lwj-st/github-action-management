import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { Account, Repository, WorkflowDetails, Run, WorkflowInput } from './types'
import Sidebar from './components/Sidebar'
import WorkflowPanel from './components/WorkflowPanel'
import RunsPanel from './components/RunsPanel'
import './App.css'

function App() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null)
  const [workflows, setWorkflows] = useState<WorkflowDetails[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [newAccountName, setNewAccountName] = useState('')
  const [newAccountToken, setNewAccountToken] = useState('')

  // 获取账户列表
  const loadAccounts = async () => {
    try {
      const data = await invoke<Account[]>('get_accounts')
      setAccounts(data)
    } catch (error) {
      console.error('Failed to load accounts:', error)
    }
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  // 添加账户
  const handleAddAccount = async () => {
    if (!newAccountName || !newAccountToken) {
      alert('请填写账户名称和 Token')
      return
    }

    try {
      const account = await invoke<Account>('add_account', {
        name: newAccountName,
        token: newAccountToken,
      })
      setAccounts([...accounts, account])
      setNewAccountName('')
      setNewAccountToken('')
      setShowAddAccount(false)
    } catch (error) {
      alert(`添加账户失败：${error}`)
    }
  }

  // 移除账户
  const handleRemoveAccount = async (accountId: string) => {
    try {
      await invoke('remove_account', { accountId })
      setAccounts(accounts.filter((a) => a.id !== accountId))
      if (selectedAccount === accountId) {
        setSelectedAccount(null)
        setRepositories([])
        setSelectedRepo(null)
        setWorkflows([])
      }
    } catch (error) {
      alert(`删除账户失败：${error}`)
    }
  }

  // 选择账户
  const handleSelectAccount = async (accountId: string) => {
    setSelectedAccount(accountId)
    try {
      await invoke('set_current_account', { accountId })
      // 获取该账户的仓库列表
      const repos = await invoke<Repository[]>('fetch_repositories', {
        accountId,
      })
      setRepositories(repos)
      setSelectedRepo(null)
      setWorkflows([])
      setRuns([])
    } catch (error) {
      alert(`获取仓库失败：${error}`)
    }
  }

  // 选择仓库
  const handleSelectRepo = async (repoFullName: string) => {
    setSelectedRepo(repoFullName)
    try {
      await invoke('set_selected_repository', { repoFullName })
      // 获取该仓库的 workflows
      if (selectedAccount) {
        const workflows = await invoke<WorkflowDetails[]>('fetch_workflows', {
          accountId: selectedAccount,
          repoFullName,
        })
        setWorkflows(workflows)
        setRuns([])
      }
    } catch (error) {
      alert(`获取 Workflows 失败：${error}`)
    }
  }

  // 触发 Workflow
  const handleTriggerWorkflow = async (
    workflow: WorkflowDetails,
    inputs: Record<string, unknown>,
    ref: string,
  ) => {
    try {
      const run = await invoke<Run>('trigger_workflow', {
        accountId: selectedAccount!,
        repoFullName: selectedRepo!,
        workflowId: workflow.workflow.id,
        refBranch: ref,
        inputs: Object.keys(inputs).length > 0 ? inputs : undefined,
      })
      // 刷新运行列表
      loadRuns()
      alert(`Workflow 触发成功！Run ID: ${run.id}`)
    } catch (error) {
      alert(`触发失败：${error}`)
    }
  }

  // 加载运行列表
  const loadRuns = async () => {
    if (!selectedAccount || !selectedRepo) return

    try {
      const runsData = await invoke<Run[]>('fetch_runs', {
        accountId: selectedAccount,
        repoFullName: selectedRepo,
        limit: 50,
      })
      setRuns(runsData)
    } catch (error) {
      console.error('Failed to load runs:', error)
    }
  }

  // 取消运行
  const handleCancelRun = async (runId: number) => {
    if (!confirm('确定要取消这个运行吗？')) return

    try {
      await invoke('cancel_run', {
        accountId: selectedAccount!,
        repoFullName: selectedRepo!,
        runId,
      })
      loadRuns()
    } catch (error) {
      alert(`取消失败：${error}`)
    }
  }

  // 重新运行
  const handleRerunRun = async (runId: number) => {
    try {
      await invoke('rerun_run', {
        accountId: selectedAccount!,
        repoFullName: selectedRepo!,
        runId,
      })
      loadRuns()
      alert('重新运行成功')
    } catch (error) {
      alert(`重新运行失败：${error}`)
    }
  }

  // 重新运行失败的作业
  const handleRerunFailedJobs = async (runId: number) => {
    if (!confirm('确定要重新运行失败的作业吗？')) return

    try {
      await invoke('rerun_failed_jobs', {
        accountId: selectedAccount!,
        repoFullName: selectedRepo!,
        runId,
      })
      loadRuns()
      alert('重新运行失败作业成功')
    } catch (error) {
      alert(`重新运行失败：${error}`)
    }
  }

  return (
    <div className="app">
      <Sidebar
        accounts={accounts}
        selectedAccount={selectedAccount}
        repositories={repositories}
        selectedRepo={selectedRepo}
        showAddAccount={showAddAccount}
        newAccountName={newAccountName}
        newAccountToken={newAccountToken}
        onAddAccount={() => setShowAddAccount(true)}
        onToggleAddAccount={() => setShowAddAccount(!showAddAccount)}
        onSetNewAccountName={setNewAccountName}
        onSetNewAccountToken={setNewAccountToken}
        onAddAccountSubmit={handleAddAccount}
        onRemoveAccount={handleRemoveAccount}
        onSelectAccount={handleSelectAccount}
        onSelectRepo={handleSelectRepo}
        onRefreshRuns={loadRuns}
      />
      <main className="main-content">
        <WorkflowPanel
          selectedAccount={selectedAccount}
          selectedRepo={selectedRepo}
          workflows={workflows}
          onTriggerWorkflow={handleTriggerWorkflow}
        />
        <RunsPanel
          runs={runs}
          onCancelRun={handleCancelRun}
          onRerunRun={handleRerunRun}
          onRerunFailedJobs={handleRerunFailedJobs}
          onLoadRuns={loadRuns}
        />
      </main>
    </div>
  )
}

export default App
