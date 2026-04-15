import { useState, useEffect } from 'react'
import type { Run } from '../types'
import '../components.css'

interface RunsPanelProps {
  runs: Run[]
  onCancelRun: (runId: number) => void
  onRerunRun: (runId: number) => void
  onRerunFailedJobs: (runId: number) => void
  onLoadRuns: () => void
}

function RunsPanel({
  runs,
  onCancelRun,
  onRerunRun,
  onRerunFailedJobs,
  onLoadRuns,
}: RunsPanelProps) {
  const [selectedRun, setSelectedRun] = useState<Run | null>(null)
  const [logs, setLogs] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // 自动刷新运行状态（轮询）
  useEffect(() => {
    if (!selectedRun) return

    const interval = setInterval(async () => {
      if (selectedRun.status === 'in_progress' || selectedRun.status === 'queued') {
        try {
          // 重新加载运行详情
          const { invoke } = await import('@tauri-apps/api/core')
          const updatedRun = await invoke<Run>('get_run_details', {
            accountId: 'temp', // 需要从父组件传递
            repoFullName: 'temp/repo',
            runId: selectedRun.id,
          })
          if (updatedRun.status !== selectedRun.status) {
            setSelectedRun(updatedRun)
            onLoadRuns()
          }
        } catch (error) {
          console.error('Failed to fetch updated run:', error)
        }
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [selectedRun, onLoadRuns])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#2ea043' // green
      case 'failed':
      case 'action_failure':
        return '#da3633' // red
      case 'cancelled':
        return '#8a8a8a' // gray
      case 'timed_out':
        return '#cb2431' // red
      case 'in_progress':
      case 'queued':
        return '#79c0ff' // blue
      default:
        return '#8a8a8a'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return '✅'
      case 'failed':
      case 'action_failure':
      case 'timed_out':
        return '❌'
      case 'cancelled':
        return '⏸️'
      case 'in_progress':
      case 'queued':
        return '🟡'
      default:
        return '⏵'
    }
  }

  const filteredRuns = filterStatus === 'all' ? runs : runs.filter((r) => r.status === filterStatus)

  return (
    <section className="runs-panel">
      <div className="panel-header">
        <h2>运行记录</h2>
        <div className="runs-filters">
          <button
            className={filterStatus === 'all' ? 'active' : ''}
            onClick={() => setFilterStatus('all')}
          >
            全部
          </button>
          <button
            className={filterStatus === 'in_progress' ? 'active' : ''}
            onClick={() => setFilterStatus('in_progress')}
          >
            运行中
          </button>
          <button
            className={filterStatus === 'completed' ? 'active' : ''}
            onClick={() => setFilterStatus('completed')}
          >
            已完成
          </button>
          <button
            className="btn-refresh"
            onClick={onLoadRuns}
            title="刷新"
          >
            ↻
          </button>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="empty-state">
          <p>暂无运行记录</p>
        </div>
      ) : (
        <>
          <div className="runs-list">
            {filteredRuns.map((run) => (
              <div
                key={run.id}
                className={`run-item ${selectedRun?.id === run.id ? 'selected' : ''}`}
                style={{ borderColor: getStatusColor(run.status) }}
                onClick={() => {
                  setSelectedRun(run)
                  setLogs('')
                }}
              >
                <div className="run-header">
                  <div className="run-title">
                    <span className="run-icon">{getStatusIcon(run.status)}</span>
                    <span className="run-name">{run.name}</span>
                    <span className="run-id">#{run.id}</span>
                  </div>
                  <div className="run-meta">
                    <span className="run-branch">🌿 {run.head_branch}</span>
                    <span className="run-time">{new Date(run.created_at).toLocaleString('zh-CN')}</span>
                  </div>
                </div>
                <div className="run-actions">
                  {run.status === 'in_progress' && (
                    <button
                      className="btn btn-danger"
                      onClick={(e) => {
                        e.stopPropagation()
                        onCancelRun(run.id)
                      }}
                    >
                      取消
                    </button>
                  )}
                  {run.status === 'completed' && run.conclusion === 'failure' && (
                    <>
                      <button
                        className="btn btn-secondary"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRerunRun(run.id)
                        }}
                      >
                        重新运行
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={(e) => {
                          e.stopPropagation()
                          onRerunFailedJobs(run.id)
                        }}
                      >
                        重跑失败作业
                      </button>
                    </>
                  )}
                  <a
                    href={run.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    GitHub →
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* 运行详情 */}
          {selectedRun && (
            <div className="run-details">
              <div className="details-header">
                <h3>
                  {selectedRun.name} #{selectedRun.id}
                </h3>
                <div className="run-status-badge" style={{ backgroundColor: getStatusColor(selectedRun.status) }}>
                  {selectedRun.status}
                </div>
              </div>

              {selectedRun.status === 'completed' && (
                <details className="run-summary">
                  <summary>查看 Summary</summary>
                  <div className="summary-content">
                    <p>此处显示 GITHUB_STEP_SUMMARY 的内容</p>
                    {/* 实际应用中需要从 API 获取 */}
                  </div>
                </details>
              )}

              {/* 日志查看 */}
              <details className="run-logs">
                <summary>查看日志</summary>
                <div className="logs-container">
                  {loading ? (
                    <p>加载中...</p>
                  ) : logs ? (
                    <pre className="log-content">{logs}</pre>
                  ) : (
                    <p className="hint">点击"查看日志"以加载日志内容</p>
                  )}
                </div>
              </details>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export default RunsPanel
