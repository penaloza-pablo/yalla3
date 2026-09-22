import { DEFAULT_OPENAI_MODEL, isAllowedOpenAiModel } from './models';
import type { AgentDefinition, CoveragePolicy } from './types';

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
  const model = asString(input.model) || options.existing?.model || DEFAULT_OPENAI_MODEL;
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

  return {
    ok: true,
    agent: {
      id,
      name,
      purpose: asString(input.purpose).slice(0, MAX_PURPOSE),
      instructions: asString(input.instructions).slice(0, MAX_INSTRUCTIONS),
      rules: asStringList(input.rules, MAX_RULE, MAX_RULES),
      allowedTools,
      provider: 'openai',
      model,
      schedule: existing?.schedule ?? {
        kind: 'manual',
        description: 'On demand from the Agents section.',
      },
      coveragePolicy: coverageFromInput(
        input.coveragePolicy,
        existing?.coveragePolicy ?? { type: 'tool_declared' },
      ),
      enabled: input.enabled === undefined ? existing?.enabled !== false : Boolean(input.enabled),
      catalogVersion: existing?.catalogVersion ?? 0,
    },
  };
};
