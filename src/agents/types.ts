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

export type AgentRunStep = {
  id?: string
  at: string
  type: string
  name: string
  input?: unknown
  output?: unknown
  error?: string
  latencyMs?: number
  usage?: {
    inputTokens?: number
    outputTokens?: number
  }
  costUsd?: number
}

export type AgentRunEvent = {
  at: string
  type: 'tool' | 'model' | 'error' | 'info'
  name: string
  inputSummary?: string
  outputSummary?: string
  error?: string
}

export type AgentRunStatus =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'waiting_for_approval'
  | 'timed_out'
  | 'cost_limit'
  | 'max_turns'

export type AgentRun = {
  runId: string
  agentId: string
  agentName?: string
  agentVersion?: number
  executionMode?: 'production' | 'test' | 'tool'
  status: AgentRunStatus
  trigger: 'manual' | 'schedule' | 'test' | 'tool_debug'
  startedAt: string
  finishedAt?: string
  result?: string
  error?: string
  coverage?: AgentCoverage
  findings?: AgentFinding[]
  events?: AgentRunEvent[]
  steps?: AgentRunStep[]
  usage?: {
    inputTokens?: number
    outputTokens?: number
  }
  estimatedCostUsd?: number
  latencyMs?: number
  provider?: string
  model?: string
  triggeredBy?: string
  source?: string
  toolId?: string
}

export type AgentCoveragePolicy = {
  type: 'tool_declared' | 'mention_in_output'
  expectedParagraphs?: number
}

export type RuntimeLimits = {
  maxTurns: number
  timeoutMs: number
  maxCostUsd: number
  maxToolCalls: number
}

export type AgentToolInfo = {
  id?: string
  name: string
  description: string
  outputDescription: string
  riskLevel?: string
  requiresApproval?: boolean
  timeoutMs?: number
  enabled?: boolean
  catalogVersion?: number
  version?: number
  createdAt?: string
  updatedAt?: string
  inputSchema?: Record<string, unknown>
}

export type AgentVersionInfo = {
  version: number
  publishedAt?: string
  name: string
  model: string
  provider: string
  allowedTools: string[]
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
  coveragePolicy?: AgentCoveragePolicy
  enabled: boolean
  status?: 'draft' | 'published' | 'archived'
  draftVersion?: number
  publishedVersion?: number
  hasUnpublishedChanges?: boolean
  createdAt?: string
  updatedAt?: string
  publishedAt?: string
  runtimeLimits?: RuntimeLimits
  approvalPolicy?: { requireApprovalFor: string[] }
  knowledgeSources?: string[]
  providerStatus: AgentProviderStatus
  lastRunAt?: string
  lastRunStatus?: AgentRun['status']
  lastRunError?: string
}
