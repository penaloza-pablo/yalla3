export type AgentProviderStatus =
  | 'ready'
  | 'disabled'
  | 'missing_credentials'
  | 'unsupported_provider'

export type AgentSchedule = {
  kind: 'manual' | 'cron'
  expression?: string
  timezone?: string
  description: string
}

export type CoverageItem = {
  id: string
  label: string
  detail?: string
  reason?: string
  source?: string
}

export type AgentCoverage = {
  planned: CoverageItem[]
  reviewed: CoverageItem[]
  unchecked: CoverageItem[]
}

export type AgentFinding = {
  severity: 'info' | 'warning' | 'error'
  title: string
  detail: string
}

export type AgentRunEvent = {
  at: string
  type: 'tool' | 'model' | 'error' | 'info'
  name: string
  inputSummary?: string
  outputSummary?: string
  error?: string
}

export type AgentRun = {
  runId: string
  agentId: string
  status: 'running' | 'succeeded' | 'failed'
  trigger: 'manual' | 'schedule'
  startedAt: string
  finishedAt?: string
  result?: string
  error?: string
  coverage?: AgentCoverage
  findings?: AgentFinding[]
  events?: AgentRunEvent[]
  usage?: {
    inputTokens?: number
    outputTokens?: number
  }
  triggeredBy?: string
}

export type AgentRecord = {
  id: string
  name: string
  purpose: string
  instructions: string
  rules: string[]
  allowedTools: string[]
  provider: string
  model: string
  schedule: AgentSchedule
  enabled: boolean
  providerStatus: AgentProviderStatus
  lastRunAt?: string
  lastRunStatus?: AgentRun['status']
  lastRunError?: string
}
