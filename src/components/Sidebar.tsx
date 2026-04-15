import type { Account, Repository } from '../types'
import '../components.css'

interface SidebarProps {
  accounts: Account[]
  selectedAccount: string | null
  repositories: Repository[]
  selectedRepo: string | null
  showAddAccount: boolean
  newAccountName: string
  newAccountToken: string
  onAddAccount: () => void
  onToggleAddAccount: () => void
  onSetNewAccountName: (name: string) => void
  onSetNewAccountToken: (token: string) => void
  onAddAccountSubmit: () => void
  onRemoveAccount: (accountId: string) => void
  onSelectAccount: (accountId: string) => void
  onSelectRepo: (repoFullName: string) => void
  onRefreshRuns: () => void
}

function Sidebar({
  accounts,
  selectedAccount,
  repositories,
  selectedRepo,
  showAddAccount,
  newAccountName,
  newAccountToken,
  onAddAccount,
  onToggleAddAccount,
  onSetNewAccountName,
  onSetNewAccountToken,
  onAddAccountSubmit,
  onRemoveAccount,
  onSelectAccount,
  onSelectRepo,
  onRefreshRuns,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>GitHub Actions</h2>
        <button className="btn btn-secondary" onClick={onAddAccount}>
          + 添加账户
        </button>
      </div>

      {/* 添加账户表单 */}
      {showAddAccount && (
        <div className="add-account-form">
          <input
            type="text"
            placeholder="账户名称"
            value={newAccountName}
            onChange={(e) => onSetNewAccountName(e.target.value)}
          />
          <input
            type="password"
            placeholder="GitHub PAT Token"
            value={newAccountToken}
            onChange={(e) => onSetNewAccountToken(e.target.value)}
          />
          <div className="form-actions">
            <button className="btn btn-primary" onClick={onAddAccountSubmit}>
              添加
            </button>
            <button className="btn btn-secondary" onClick={onToggleAddAccount}>
              取消
            </button>
          </div>
          <p className="hint">
            Token 权限要求：repo, workflow, actions
          </p>
        </div>
      )}

      {/* 账户列表 */}
      <div className="section">
        <h3>账户 ({accounts.length})</h3>
        <ul className="account-list">
          {accounts.map((account) => (
            <li
              key={account.id}
              className={`account-item ${selectedAccount === account.id ? 'selected' : ''}`}
            >
              <div className="account-info">
                <span onClick={() => onSelectAccount(account.id)}>{account.name}</span>
                <button
                  className="btn-remove"
                  onClick={() => onRemoveAccount(account.id)}
                >
                  ×
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* 仓库列表 */}
      {selectedAccount && (
        <div className="section">
          <div className="section-header">
            <h3>仓库 ({repositories.length})</h3>
            <button className="btn-refresh" onClick={onRefreshRuns} title="刷新">
              ↻
            </button>
          </div>
          <ul className="repo-list">
            {repositories.map((repo) => (
              <li
                key={repo.id}
                className={`repo-item ${selectedRepo === repo.full_name ? 'selected' : ''}`}
                onClick={() => onSelectRepo(repo.full_name)}
              >
                <span className="repo-name">{repo.full_name}</span>
                {repo.language && <span className="repo-language">{repo.language}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}

export default Sidebar
