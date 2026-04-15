// 账户信息
export interface Account {
  id: string
  name: string
  token: string
  created_at: string
}

// 仓库信息
export interface Repository {
  id: number
  name: string
  full_name: string
  private: boolean
  language: string | null
  updated_at: string
  default_branch: string
}

// Workflow 信息
export interface Workflow {
  id: number
  name: string
  path: string
  state: string
  created_at: string
  updated_at: string
}

// Workflow 输入参数
export interface WorkflowInput {
  name: string
  description: string | null
  required: boolean
  type: string
  options: string[] | null
  default: string | null
}

// Workflow 详情（包含输入参数）
export interface WorkflowDetails {
  workflow: Workflow
  inputs: WorkflowInput[]
}

// Workflow 运行状态
export type RunStatus =
  | 'queued'
  | 'in_progress'
  | 'completed'
  | 'waiting'
  | 'waiting_security_policy'
  | 'permission_denied'
  | 'action_failure'
  | 'timed_out'
  | 'cancelled'

// Workflow 运行记录
export interface Run {
  id: number
  name: string
  status: RunStatus
  conclusion: string | null
  created_at: string
  updated_at: string
  html_url: string
  head_branch: string
  head_sha: string
  workflow_id: number
  workflow_name: string
}

// 作业信息
export interface Job {
  id: number
  run_id: number
  name: string
  status: string
  conclusion: string | null
  steps: Step[]
}

// 步骤信息
export interface Step {
  id: number
  name: string
  status: string
  conclusion: string | null
  started_at: string | null
  completed_at: string | null
}

// 制品信息
export interface Artifact {
  id: number
  name: string
  size: number
  url: string
  created_at: string
  expires_at: string | null
}
