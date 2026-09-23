import { DEFAULT_OPENAI_MODEL, isAllowedOpenAiModel } from './models';
import { clampRuntimeLimits, DEFAULT_RUNTIME_LIMITS } from './limits';
import type {
  AgentDefinition,
  ApprovalPolicy,
  CoveragePolicy,
  RuntimeLimits,
} from './types';

const MAX_NAME = 80;
const MAX_PURPOSE = 400;
const MAX_INSTRUCTIONS = 12000;
const MAX_RULE = 400;
const MAX_RULES = 40;

export type AgentUpsertInput = {
  id?: string;
  name?: string;
  purpose?: string;
  instructions?: string;
  rules?: unknown;
  allowedTools?: unknown;
  model?: string;
  enabled?: unknown;
  coveragePolicy?: { type?: string; expectedParagraphs?: unknown };
  runtimeLimits?: Partial<RuntimeLimits>;
  approvalPolicy?: { requireApprovalFor?: unknown };
  knowledgeSources?: unknown;
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asStringList = (value: unknown, maxItem: number, maxCount: number) => {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: string[] = [];
  for (const entry of value) {
    const text = asString(entry);
    if (!text) {
      continue;
    }
    items.push(text.slice(0, maxItem));
    if (items.length >= maxCount) {
      break;
    }
  }
  return items;
};

export const slugifyAgentId = (name: string) => {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'agent';
};

const coverageFromInput = (
  value: AgentUpsertInput['coveragePolicy'],
  fallback: CoveragePolicy,
): CoveragePolicy => {
  const type =
    value?.type === 'mention_in_output' || value?.type === 'tool_declared'
      ? value.type
      : fallback.type;
  const parsed = Number(value?.expectedParagraphs);
  const expectedParagraphs =
    Number.isInteger(parsed) && parsed > 0 && parsed <= 12
      ? parsed
      : type === fallback.type
        ? fallback.expectedParagraphs
        : undefined;
  return expectedParagraphs ? { type, expectedParagraphs } : { type };
};

const approvalFromInput = (
  value: AgentUpsertInput['approvalPolicy'],
  fallback: ApprovalPolicy,
  allowedTools: string[],
): ApprovalPolicy => {
  const requested = asStringList(value?.requireApprovalFor, 80, 20).filter(
    (tool) => allowedTools.includes(tool),
  );
  if (value?.requireApprovalFor === undefined) {
    return {
      requireApprovalFor: fallback.requireApprovalFor.filter((tool) =>
        allowedTools.includes(tool),
      ),
    };
  }
  return { requireApprovalFor: requested };
};

export type DefinitionFingerprintInput = Pick<
  AgentDefinition,
  | 'name'
  | 'purpose'
  | 'instructions'
  | 'rules'
  | 'allowedTools'
  | 'model'
  | 'enabled'
  | 'coveragePolicy'
  | 'runtimeLimits'
  | 'approvalPolicy'
  | 'knowledgeSources'
>;

export const fingerprintDefinition = (agent: DefinitionFingerprintInput) =>
  JSON.stringify({
    name: agent.name,
    purpose: agent.purpose,
    instructions: agent.instructions,
    rules: agent.rules,
    allowedTools: agent.allowedTools,
    model: agent.model,
    enabled: agent.enabled,
    coveragePolicy: agent.coveragePolicy,
    runtimeLimits: agent.runtimeLimits,
    approvalPolicy: agent.approvalPolicy,
    knowledgeSources: agent.knowledgeSources,
  });

export const nextDraftVersion = (
  existing: AgentDefinition | null | undefined,
  next: DefinitionFingerprintInput,
) => {
  if (!existing) {
    return 1;
  }
  const published = existing.publishedVersion;
  if (!published) {
    return existing.draftVersion || 1;
  }
  if (fingerprintDefinition(existing) === fingerprintDefinition(next)) {
    return existing.draftVersion;
  }
  if (existing.draftVersion === published) {
    return existing.draftVersion + 1;
  }
  return existing.draftVersion;
};

export const normalizeAgentUpsert = (
  input: AgentUpsertInput,
  options: {
    existing?: AgentDefinition | null;
    registeredToolNames: Set<string>;
    allocateId: (name: string) => string;
  },
): { ok: true; agent: AgentDefinition } | { ok: false; message: string } => {
  const name = asString(input.name).slice(0, MAX_NAME);
  if (!name) {
    return { ok: false, message: 'name is required.' };
  }
  const model =
    asString(input.model) || options.existing?.model || DEFAULT_OPENAI_MODEL;
  if (!isAllowedOpenAiModel(model) && model !== options.existing?.model) {
    return { ok: false, message: `Unsupported model: ${model}.` };
  }
  const allowedTools = asStringList(input.allowedTools, 80, 20);
  const unknownTools = allowedTools.filter(
    (tool) => !options.registeredToolNames.has(tool),
  );
  if (unknownTools.length > 0) {
    return {
      ok: false,
      message: `Unknown tools: ${unknownTools.join(', ')}.`,
    };
  }

  const existing = options.existing;
  const id = asString(input.id) || existing?.id || options.allocateId(name);
  if (!id) {
    return { ok: false, message: 'id is required.' };
  }

  const runtimeLimits = clampRuntimeLimits(
    input.runtimeLimits ?? existing?.runtimeLimits ?? DEFAULT_RUNTIME_LIMITS,
  );
  const approvalPolicy = approvalFromInput(
    input.approvalPolicy,
    existing?.approvalPolicy ?? { requireApprovalFor: [] },
    allowedTools,
  );
  const knowledgeSources = asStringList(
    input.knowledgeSources ?? existing?.knowledgeSources,
    120,
    20,
  );
  const draftFields = {
    name,
    purpose: asString(input.purpose).slice(0, MAX_PURPOSE),
    instructions: asString(input.instructions).slice(0, MAX_INSTRUCTIONS),
    rules: asStringList(input.rules, MAX_RULE, MAX_RULES),
    allowedTools,
    model,
    enabled:
      input.enabled === undefined
        ? existing?.enabled !== false
        : Boolean(input.enabled),
    coveragePolicy: coverageFromInput(
      input.coveragePolicy,
      existing?.coveragePolicy ?? { type: 'tool_declared' },
    ),
    runtimeLimits,
    approvalPolicy,
    knowledgeSources,
  };
  const draftVersion = nextDraftVersion(existing, draftFields);
  const publishedVersion = existing?.publishedVersion;
  const status = existing?.status === 'archived'
    ? 'archived'
    : publishedVersion
      ? 'published'
      : 'draft';

  return {
    ok: true,
    agent: {
      id,
      ...draftFields,
      provider: 'openai',
      schedule: existing?.schedule ?? {
        kind: 'manual',
        description: 'On demand from Agent Studio.',
      },
      catalogVersion: existing?.catalogVersion ?? 0,
      status,
      draftVersion,
      publishedVersion,
      createdAt: existing?.createdAt,
      publishedAt: existing?.publishedAt,
      memoryPolicy: existing?.memoryPolicy ?? { kind: 'none' },
      permissionPolicy: { allowedTools },
    },
  };
};
