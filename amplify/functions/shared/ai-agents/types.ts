export type AgentProviderId = 'openai' | 'bedrock';

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

export type AgentRunEvent = {
  at: string;
  type: 'tool' | 'model' | 'error' | 'info';
  name: string;
  inputSummary?: string;
  outputSummary?: string;
  error?: string;
};

export type AgentRunRecord = {
  runId: string;
  agentId: string;
  status: 'running' | 'succeeded' | 'failed';
  trigger: 'manual' | 'schedule';
  startedAt: string;
  finishedAt?: string;
  result?: string;
  error?: string;
  coverage?: AgentCoverage;
  findings?: AgentFinding[];
  events?: AgentRunEvent[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  triggeredBy?: string;
};

export type AgentPublicRecord = AgentDefinition & {
  providerStatus: ProviderConfigStatus;
  lastRunAt?: string;
  lastRunStatus?: AgentRunRecord['status'];
  lastRunError?: string;
};

export type ToolCoverageHint = {
  planned: CoverageItem[];
  unchecked: CoverageItem[];
};

export type ToolResult = {
  content: unknown;
  coverage?: ToolCoverageHint;
};

export type AgentToolPublic = {
  name: string;
  description: string;
  outputDescription: string;
};

export type AgentTool = AgentToolPublic & {
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
};

export type ProviderInvokeInput = {
  model: string;
  instructions: string;
  userMessage: string;
  tools: AgentTool[];
};

export type ProviderInvokeResult = {
  text: string;
  events: AgentRunEvent[];
  toolCoverage: ToolCoverageHint[];
  usage?: AgentRunRecord['usage'];
};
