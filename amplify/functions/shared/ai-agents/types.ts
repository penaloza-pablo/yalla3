export type AgentProviderId = 'openai' | 'bedrock';

export type AgentDefinitionStatus = 'draft' | 'published' | 'archived';

export type AgentSchedule = {
  kind: 'manual' | 'cron';
  expression?: string;
  timezone?: string;
  description: string;
};

export type CoveragePolicy = {
  type: 'tool_declared' | 'mention_in_output';
  expectedParagraphs?: number;
};

export type RuntimeLimits = {
  maxTurns: number;
  timeoutMs: number;
  maxCostUsd: number;
  maxToolCalls: number;
};

export type MemoryPolicy = {
  kind: 'none';
};

export type PermissionPolicy = {
  allowedTools: string[];
};

export type ApprovalPolicy = {
  requireApprovalFor: string[];
};

export type AgentDefinition = {
  id: string;
  name: string;
  purpose: string;
  instructions: string;
  rules: string[];
  allowedTools: string[];
  provider: AgentProviderId;
  model: string;
  schedule: AgentSchedule;
  coveragePolicy: CoveragePolicy;
  enabled: boolean;
  catalogVersion: number;
  status: AgentDefinitionStatus;
  draftVersion: number;
  publishedVersion?: number;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  runtimeLimits: RuntimeLimits;
  memoryPolicy: MemoryPolicy;
  permissionPolicy: PermissionPolicy;
  approvalPolicy: ApprovalPolicy;
  knowledgeSources: string[];
};

export type AgentVersionRecord = AgentDefinition & {
  recordType: 'agent-version';
  agentId: string;
  version: number;
};

export type ProviderConfigStatus =
  | 'ready'
  | 'disabled'
  | 'missing_credentials'
  | 'unsupported_provider';

export type CoverageItem = {
  id: string;
  label: string;
  detail?: string;
  reason?: string;
  source?: string;
};

export type AgentCoverage = {
  planned: CoverageItem[];
  reviewed: CoverageItem[];
  unchecked: CoverageItem[];
};

export type AgentFinding = {
  severity: 'info' | 'warning' | 'error';
  title: string;
  detail: string;
};

export type AgentRunStepType =
  | 'MODEL_CALL'
  | 'TOOL_CALL'
  | 'TOOL_RESULT'
  | 'APPROVAL_REQUEST'
  | 'APPROVAL_RESULT'
  | 'HANDOFF'
  | 'FINAL_RESPONSE'
  | 'ERROR'
  | 'INFO';

export type AgentRunStep = {
  id: string;
  at: string;
  type: AgentRunStepType;
  name: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  latencyMs?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  costUsd?: number;
};

/** Legacy summary events kept so older runs still render. */
export type AgentRunEvent = {
  at: string;
  type: 'tool' | 'model' | 'error' | 'info';
  name: string;
  inputSummary?: string;
  outputSummary?: string;
  error?: string;
};

export type AgentRunStatus =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'waiting_for_approval'
  | 'timed_out'
  | 'cost_limit'
  | 'max_turns';

export type AgentRunTrigger =
  | 'manual'
  | 'schedule'
  | 'test'
  | 'tool_debug';

export type ExecutionMode = 'production' | 'test' | 'tool';

export type AgentRunRecord = {
  runId: string;
  agentId: string;
  agentName?: string;
  agentVersion?: number;
  executionMode?: ExecutionMode;
  status: AgentRunStatus;
  trigger: AgentRunTrigger;
  startedAt: string;
  finishedAt?: string;
  result?: string;
  error?: string;
  coverage?: AgentCoverage;
  findings?: AgentFinding[];
  events?: AgentRunEvent[];
  steps?: AgentRunStep[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  estimatedCostUsd?: number;
  latencyMs?: number;
  provider?: AgentProviderId;
  model?: string;
  triggeredBy?: string;
  source?: string;
  toolId?: string;
  executionState?: Record<string, unknown>;
};

export type AgentPublicRecord = AgentDefinition & {
  providerStatus: ProviderConfigStatus;
  lastRunAt?: string;
  lastRunStatus?: AgentRunRecord['status'];
  lastRunError?: string;
  hasUnpublishedChanges: boolean;
};

export type ToolCoverageHint = {
  planned: CoverageItem[];
  unchecked: CoverageItem[];
};

export type ToolResult = {
  content: unknown;
  coverage?: ToolCoverageHint;
};

export type ToolRiskLevel = 'read' | 'write-low-risk' | 'write-controlled';

export type AgentToolPublic = {
  id: string;
  name: string;
  description: string;
  outputDescription: string;
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
  timeoutMs: number;
  enabled: boolean;
  catalogVersion: number;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  executionTarget: 'internal';
};

export type AgentTool = AgentToolPublic & {
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
};

export type ToolVersionRecord = AgentToolPublic & {
  recordType: 'tool-version';
  version: number;
  createdAt?: string;
};

export type ProviderToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type ProviderToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ProviderTurn = {
  text?: string;
  toolCalls: ProviderToolCall[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  finishReason?: string;
};

export type ProviderConversation = {
  messages: unknown[];
};

export type LLMProvider = {
  id: AgentProviderId;
  invoke: (input: {
    model: string;
    instructions: string;
    userMessage: string;
    tools: ProviderToolSpec[];
  }) => Promise<{ turn: ProviderTurn; conversation: ProviderConversation }>;
  continueWithToolResults: (input: {
    model: string;
    conversation: ProviderConversation;
    tools: ProviderToolSpec[];
    results: Array<{ toolCallId: string; content: unknown }>;
  }) => Promise<{ turn: ProviderTurn; conversation: ProviderConversation }>;
};

export type ExecuteToolInput = {
  toolId: string;
  arguments: Record<string, unknown>;
  actor?: string;
  agentId?: string;
  runId?: string;
  allowedTools: string[];
  approvalPolicy?: ApprovalPolicy;
};

export type ExecuteToolResult =
  | {
      status: 'ok';
      toolId: string;
      content: unknown;
      coverage?: ToolCoverageHint;
      latencyMs: number;
    }
  | {
      status: 'error';
      toolId: string;
      error: string;
      latencyMs: number;
    }
  | {
      status: 'needs_approval';
      toolId: string;
      arguments: Record<string, unknown>;
      approvalId: string;
    };
