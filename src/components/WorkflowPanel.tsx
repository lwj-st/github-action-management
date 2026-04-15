import { useState } from 'react'
import type { WorkflowDetails, WorkflowInput } from '../types'
import '../components.css'

interface WorkflowPanelProps {
  selectedAccount: string | null
  selectedRepo: string | null
  workflows: WorkflowDetails[]
  onTriggerWorkflow: (
    workflow: WorkflowDetails,
    inputs: Record<string, unknown>,
    ref: string,
  ) => void
}

function WorkflowPanel({
  selectedAccount,
  selectedRepo,
  workflows,
  onTriggerWorkflow,
}: WorkflowPanelProps) {
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowDetails | null>(null)
  const [inputs, setInputs] = useState<Record<string, unknown>>({})
  const [refBranch, setRefBranch] = useState('main')

  const handleInputChange = (inputName: string, value: unknown) => {
    setInputs((prev) => ({ ...prev, [inputName]: value }))
  }

  const handleTrigger = () => {
    if (!selectedWorkflow) return
    onTriggerWorkflow(selectedWorkflow, inputs, refBranch)
    // 重置
    setSelectedWorkflow(null)
    setInputs({})
  }

  if (!selectedRepo) {
    return (
      <div className="empty-state">
        <p>请选择一个仓库以查看 Workflows</p>
      </div>
    )
  }

  return (
    <section className="workflow-panel">
      <div className="panel-header">
        <h2>Workflows</h2>
        {workflows.length === 0 && (
          <p className="hint">该仓库没有可用的 Workflows</p>
        )}
      </div>

      <div className="workflow-list">
        {workflows.map((workflow) => (
          <div
            key={workflow.workflow.id}
            className={`workflow-card ${selectedWorkflow?.workflow.id === workflow.workflow.id ? 'active' : ''}`}
            onClick={() => {
              setSelectedWorkflow(workflow)
              // 重置输入为默认值
              const defaults: Record<string, unknown> = {}
              workflow.inputs.forEach((input) => {
                if (input.default !== null && input.default !== undefined) {
                  defaults[input.name] = input.default
                }
              })
              setInputs(defaults)
            }}
          >
            <div className="workflow-header">
              <h3>{workflow.workflow.name}</h3>
              <span className={`workflow-state ${workflow.workflow.state}`}>
                {workflow.workflow.state === 'active' ? '✓' : '✗'}
              </span>
            </div>
            <p className="workflow-path">{workflow.workflow.path}</p>

            {workflow.inputs.length > 0 && selectedWorkflow?.workflow.id === workflow.workflow.id && (
              <div className="workflow-inputs">
                <div className="input-row">
                  <label>Branch/Ref:</label>
                  <input
                    type="text"
                    value={refBranch}
                    onChange={(e) => setRefBranch(e.target.value)}
                    placeholder="main"
                  />
                </div>
                {workflow.inputs.map((input) => (
                  <div key={input.name} className="input-group">
                    <label>
                      {input.name}
                      {input.required && <span className="required">*</span>}
                    </label>
                    {input.type === 'boolean' ? (
                      <select
                        value={String(inputs[input.name] ?? input.default ?? false)}
                        onChange={(e) =>
                          handleInputChange(input.name, e.target.value === 'true')
                        }
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : input.options ? (
                      <select
                        value={inputs[input.name] ?? input.default ?? ''}
                        onChange={(e) => handleInputChange(input.name, e.target.value)}
                      >
                        <option value="">-- 请选择 --</option>
                        {input.options.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={input.type === 'number' ? 'number' : 'text'}
                        value={inputs[input.name] ?? input.default ?? ''}
                        onChange={(e) =>
                          handleInputChange(input.name, input.type === 'number' ? Number(e.target.value) : e.target.value)
                        }
                        placeholder={input.description || '请输入'}
                      />
                    )}
                    {input.description && (
                      <span className="input-description">{input.description}</span>
                    )}
                  </div>
                ))}
                <button className="btn btn-primary" onClick={handleTrigger}>
                  触发 Workflow
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

export default WorkflowPanel
