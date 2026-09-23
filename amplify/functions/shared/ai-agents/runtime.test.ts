import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_RUNTIME_LIMITS } from './limits';
import { executeAgentDefinition } from './runtime';
import { resolveDefinitionVersion } from './select-version';
import { executeTool } from './tool-executor';
import type {
  AgentDefinition,
  AgentRunRecord,
  ExecuteToolInput,
  LLMProvider,
} from './types';

const baseAgent = (patch: Partial<AgentDefinition>): AgentDefinition => ({
  id: 'agent-a',
  name: 'Agent A',
  purpose: 'Story',
  instructions: 'Write a story.',
  rules: ['Use the tool.'],
  allowedTools: ['list_today_checkin_guests'],
  provider: 'openai',
  model: 'gpt-4o-mini',
  schedule: { kind: 'manual', description: 'test' },
  coveragePolicy: { type: 'tool_declared' },
  enabled: true,
  catalogVersion: 1,
  status: 'published',
  draftVersion: 1,
  publishedVersion: 1,
  runtimeLimits: DEFAULT_RUNTIME_LIMITS,
  memoryPolicy: { kind: 'none' },
  permissionPolicy: { allowedTools: ['list_today_checkin_guests'] },
  approvalPolicy: { requireApprovalFor: [] },
  knowledgeSources: [],
  ...patch,
});

test('production uses published version, test uses draft', () => {
  const head = baseAgent({
    instructions: 'DRAFT',
    draftVersion: 2,
    publishedVersion: 1,
  });
  const published = baseAgent({
    instructions: 'PUBLISHED',
    draftVersion: 1,
    publishedVersion: 1,
  });
  const prod = resolveDefinitionVersion({
    head,
    published,
    executionMode: 'production',
  });
  assert.equal(prod.ok, true);
  if (prod.ok) {
    assert.equal(prod.definition.instructions, 'PUBLISHED');
  }
  const draft = resolveDefinitionVersion({
    head,
    published,
    executionMode: 'test',
    version: 'draft',
  });
  assert.equal(draft.ok, true);
  if (draft.ok) {
    assert.equal(draft.definition.instructions, 'DRAFT');
  }
});

test('ToolExecutor denies tools outside the allow-list', async () => {
  const result = await executeTool({
    toolId: 'list_today_checkin_guests',
    arguments: {},
    allowedTools: ['some_other_tool'],
  });
  assert.equal(result.status, 'error');
  if (result.status === 'error') {
    assert.match(result.error, /not allowed/);
  }
});

test('the same runtime executes two different definitions', async () => {
  const calls: string[] = [];
  const provider: LLMProvider = {
    id: 'openai',
    invoke: async (input) => {
      calls.push(input.instructions);
      return {
        turn: {
          text: `Answer for ${input.instructions.slice(0, 12)}`,
          toolCalls: [],
          usage: { inputTokens: 10, outputTokens: 8 },
        },
        conversation: { messages: [] },
      };
    },
    continueWithToolResults: async () => {
      throw new Error('should not continue');
    },
  };
  const executeToolFn = async (_input: ExecuteToolInput) => {
    throw new Error('tools should not run');
  };
  const persist = async () => undefined;
  const running = (agentId: string): AgentRunRecord => ({
    runId: `${agentId}-run`,
    agentId,
    status: 'running',
    trigger: 'test',
    startedAt: new Date().toISOString(),
    steps: [],
  });

  const agentA = baseAgent({
    id: 'agent-a',
    instructions: 'Agent A instructions',
    allowedTools: [],
    permissionPolicy: { allowedTools: [] },
  });
  const agentB = baseAgent({
    id: 'agent-b',
    name: 'Agent B',
    instructions: 'Agent B briefing',
    model: 'gpt-4o',
    allowedTools: [],
    permissionPolicy: { allowedTools: [] },
    coveragePolicy: { type: 'mention_in_output', expectedParagraphs: 1 },
  });

  const runA = await executeAgentDefinition({
    definition: agentA,
    input: 'Go',
    run: running('agent-a'),
    persist,
    provider,
    executeToolFn,
  });
  const runB = await executeAgentDefinition({
    definition: agentB,
    input: 'Go',
    run: running('agent-b'),
    persist,
    provider,
    executeToolFn,
  });

  assert.equal(runA.status, 'succeeded');
  assert.equal(runB.status, 'succeeded');
  assert.ok(runA.result?.includes('Agent A'));
  assert.ok(runB.result?.includes('Agent B'));
  assert.equal(calls.length, 2);
  assert.ok(runA.steps?.some((step) => step.type === 'MODEL_CALL'));
  assert.ok(runA.steps?.some((step) => step.type === 'FINAL_RESPONSE'));
  assert.notEqual(agentA.instructions, agentB.instructions);
});
