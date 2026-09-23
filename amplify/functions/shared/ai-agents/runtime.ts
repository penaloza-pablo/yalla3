import { nowIso } from '../dynamo-http';
import { applyCoveragePolicy, findingsFromCoverage } from './coverage';
import { estimateCostUsd } from './cost';
import { capStoredValue } from './limits';
import { openaiProvider } from './providers/openai';
import { hasOpenAiCredentials } from './providers/openai-secret';
import { resolveDefinitionVersion, type VersionSelector } from './select-version';
import {
  getAgent,
  getAgentVersion,
  putRun,
  touchAgentRun,
} from './store';
import { executeTool } from './tool-executor';
import { resolveAllowedTools } from './tools/registry';
import type {
  AgentDefinition,
  AgentPublicRecord,
  AgentRunRecord,
  AgentRunStep,
  AgentRunTrigger,
  ExecuteToolResult,
  ExecutionMode,
  LLMProvider,
  ProviderConversation,
  ProviderToolSpec,
  ProviderTurn,
  ToolCoverageHint,
} from './types';

const DEFAULT_PRODUCTION_INPUT =
  'Execute your configured task for the current business day in Europe/Madrid.';

const providerStatusFor = async (agent: {
  enabled: boolean;
  provider: string;
}): Promise<AgentPublicRecord['providerStatus']> => {
  if (!agent.enabled) {
    return 'disabled';
  }
  if (agent.provider === 'openai') {
    return (await hasOpenAiCredentials()) ? 'ready' : 'missing_credentials';
  }
  return 'unsupported_provider';
};

export const decorateAgent = async (
  agent: AgentDefinition & {
    lastRunAt?: string;
    lastRunStatus?: AgentRunRecord['status'];
    lastRunError?: string;
  },
): Promise<AgentPublicRecord> => ({
  ...agent,
  providerStatus: await providerStatusFor(agent),
  hasUnpublishedChanges:
    Boolean(agent.publishedVersion) &&
    agent.draftVersion !== agent.publishedVersion,
});

const toProviderTools = (definition: AgentDefinition): ProviderToolSpec[] => {
  const { tools } = resolveAllowedTools(
    definition.permissionPolicy.allowedTools.length > 0
      ? definition.permissionPolicy.allowedTools
      : definition.allowedTools,
  );
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
};

const composeInstructions = (agent: AgentDefinition) =>
  [agent.instructions.trim(), '', 'Rules:', ...agent.rules.map((rule) => `- ${rule}`)].join(
    '\n',
  );

const addStep = (
  run: AgentRunRecord,
  step: Omit<AgentRunStep, 'id'> & { id?: string },
): AgentRunRecord => ({
  ...run,
  steps: [
    ...(run.steps ?? []),
    {
      id: step.id ?? crypto.randomUUID(),
      at: step.at,
      type: step.type,
      name: step.name,
      input: capStoredValue(step.input),
      output: capStoredValue(step.output),
      error: step.error,
      latencyMs: step.latencyMs,
      usage: step.usage,
      costUsd: step.costUsd,
    },
  ],
});

const providerFor = (id: AgentDefinition['provider']): LLMProvider => {
  if (id === 'openai') {
    return openaiProvider;
  }
  throw new Error(`Provider ${id} is not implemented yet.`);
};

type PersistFn = (run: AgentRunRecord) => Promise<void>;

const finish = async (
  run: AgentRunRecord,
  patch: Partial<AgentRunRecord>,
  persist: PersistFn,
) => {
  const finishedAt = patch.finishedAt ?? nowIso();
  const next: AgentRunRecord = {
    ...run,
    ...patch,
    finishedAt,
    latencyMs: new Date(finishedAt).getTime() - new Date(run.startedAt).getTime(),
  };
  await persist(next);
  return next;
};

const applyModelUsage = (run: AgentRunRecord, turn: ProviderTurn, model: string) => {
  const inputTokens = (run.usage?.inputTokens ?? 0) + (turn.usage?.inputTokens ?? 0);
  const outputTokens =
    (run.usage?.outputTokens ?? 0) + (turn.usage?.outputTokens ?? 0);
  const usage = { inputTokens, outputTokens };
  return {
    ...run,
    usage,
    estimatedCostUsd: estimateCostUsd(model, usage),
  };
};

export const executeAgentDefinition = async (options: {
  definition: AgentDefinition;
  input: string;
  run: AgentRunRecord;
  persist: PersistFn;
  provider?: LLMProvider;
  executeToolFn?: typeof executeTool;
}): Promise<AgentRunRecord> => {
  const definition = options.definition;
  const persist = options.persist;
  const provider = options.provider ?? providerFor(definition.provider);
  const runTool = options.executeToolFn ?? executeTool;
  const limits = definition.runtimeLimits;
  const tools = toProviderTools(definition);
  const allowedTools =
    definition.permissionPolicy.allowedTools.length > 0
      ? definition.permissionPolicy.allowedTools
      : definition.allowedTools;
  const { missing } = resolveAllowedTools(allowedTools);
  if (missing.length > 0) {
    return finish(
      addStep(options.run, {
        at: nowIso(),
        type: 'ERROR',
        name: 'tools',
        error: `Unknown tools in agent config: ${missing.join(', ')}.`,
      }),
      {
        status: 'failed',
        error: `Unknown tools in agent config: ${missing.join(', ')}.`,
      },
      persist,
    );
  }

  let run = options.run;
  let conversation: ProviderConversation = { messages: [] };
  let toolCoverage: ToolCoverageHint[] = [];
  let toolCalls = 0;
  const deadline = Date.now() + limits.timeoutMs;

  const checkLimits = async (next: AgentRunRecord) => {
    if (Date.now() > deadline) {
      return finish(
        addStep(next, {
          at: nowIso(),
          type: 'ERROR',
          name: 'timeout',
          error: `Timed out after ${limits.timeoutMs}ms.`,
        }),
        {
          status: 'timed_out',
          error: `Timed out after ${limits.timeoutMs}ms.`,
        },
        persist,
      );
    }
    if ((next.estimatedCostUsd ?? 0) > limits.maxCostUsd) {
      return finish(
        addStep(next, {
          at: nowIso(),
          type: 'ERROR',
          name: 'cost_limit',
          error: `Estimated cost ${next.estimatedCostUsd} USD exceeded ${limits.maxCostUsd}.`,
        }),
        {
          status: 'cost_limit',
          error: `Estimated cost exceeded ${limits.maxCostUsd} USD.`,
        },
        persist,
      );
    }
    return null;
  };

  try {
    const first = await provider.invoke({
      model: definition.model,
      instructions: composeInstructions(definition),
      userMessage: options.input,
      tools,
    });
    conversation = first.conversation;
    run = applyModelUsage(run, first.turn, definition.model);
    run = addStep(run, {
      at: nowIso(),
      type: 'MODEL_CALL',
      name: definition.model,
      output: first.turn.toolCalls.length
        ? { toolCalls: first.turn.toolCalls.map((call) => call.name) }
        : first.turn.text,
      usage: first.turn.usage,
      costUsd: estimateCostUsd(definition.model, first.turn.usage),
    });
    await persist(run);
    const limited = await checkLimits(run);
    if (limited) {
      return limited;
    }

    let turn = first.turn;
    for (let index = 0; index < limits.maxTurns; index += 1) {
      if (turn.toolCalls.length === 0) {
        const text = String(turn.text ?? '').trim();
        if (!text) {
          return finish(
            addStep(run, {
              at: nowIso(),
              type: 'ERROR',
              name: 'empty_response',
              error: 'The model did not return a final answer.',
            }),
            {
              status: 'failed',
              error: 'The model did not return a final answer.',
            },
            persist,
          );
        }
        const coverage = applyCoveragePolicy(
          definition.coveragePolicy,
          toolCoverage,
          text,
        );
        return finish(
          addStep(run, {
            at: nowIso(),
            type: 'FINAL_RESPONSE',
            name: 'response',
            output: text,
          }),
          {
            status: 'succeeded',
            result: text,
            coverage,
            findings: findingsFromCoverage(
              coverage,
              text,
              definition.coveragePolicy,
            ),
          },
          persist,
        );
      }

      const results: Array<{ toolCallId: string; content: unknown }> = [];
      for (const call of turn.toolCalls) {
        toolCalls += 1;
        if (toolCalls > limits.maxToolCalls) {
          return finish(
            addStep(run, {
              at: nowIso(),
              type: 'ERROR',
              name: 'max_tool_calls',
              error: `Exceeded ${limits.maxToolCalls} tool calls.`,
            }),
            {
              status: 'failed',
              error: `Exceeded ${limits.maxToolCalls} tool calls.`,
            },
            persist,
          );
        }
        run = addStep(run, {
          at: nowIso(),
          type: 'TOOL_CALL',
          name: call.name,
          input: call.arguments,
        });
        await persist(run);
        const executed: ExecuteToolResult = await runTool({
          toolId: call.name,
          arguments: call.arguments,
          actor: run.triggeredBy,
          agentId: definition.id,
          runId: run.runId,
          allowedTools,
          approvalPolicy: definition.approvalPolicy,
        });
        if (executed.status === 'needs_approval') {
          run = addStep(run, {
            at: nowIso(),
            type: 'APPROVAL_REQUEST',
            name: call.name,
            input: call.arguments,
            output: { approvalId: executed.approvalId },
          });
          return finish(
            run,
            {
              status: 'waiting_for_approval',
              executionState: {
                conversation,
                pendingToolCall: call,
                approvalId: executed.approvalId,
                input: options.input,
                turnIndex: index,
              },
            },
            persist,
          );
        }
        if (executed.status === 'error') {
          run = addStep(run, {
            at: nowIso(),
            type: 'ERROR',
            name: call.name,
            input: call.arguments,
            error: executed.error,
            latencyMs: executed.latencyMs,
          });
          results.push({
            toolCallId: call.id,
            content: { error: executed.error },
          });
        } else {
          if (executed.coverage) {
            toolCoverage.push(executed.coverage);
          }
          run = addStep(run, {
            at: nowIso(),
            type: 'TOOL_RESULT',
            name: call.name,
            input: call.arguments,
            output: executed.content,
            latencyMs: executed.latencyMs,
          });
          results.push({
            toolCallId: call.id,
            content: executed.content,
          });
        }
        await persist(run);
      }

      const continued = await provider.continueWithToolResults({
        model: definition.model,
        conversation,
        tools,
        results,
      });
      conversation = continued.conversation;
      turn = continued.turn;
      run = applyModelUsage(run, turn, definition.model);
      run = addStep(run, {
        at: nowIso(),
        type: 'MODEL_CALL',
        name: definition.model,
        output: turn.toolCalls.length
          ? { toolCalls: turn.toolCalls.map((call) => call.name) }
          : turn.text,
        usage: turn.usage,
        costUsd: estimateCostUsd(definition.model, turn.usage),
      });
      await persist(run);
      const after = await checkLimits(run);
      if (after) {
        return after;
      }
    }

    return finish(
      addStep(run, {
        at: nowIso(),
        type: 'ERROR',
        name: 'max_turns',
        error: `Reached ${limits.maxTurns} model turns without a final answer.`,
      }),
      {
        status: 'max_turns',
        error: `Reached ${limits.maxTurns} model turns without a final answer.`,
      },
      persist,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return finish(
      addStep(run, {
        at: nowIso(),
        type: 'ERROR',
        name: 'runtime',
        error: message,
      }),
      { status: 'failed', error: message },
      persist,
    );
  }
};

const persistRun = async (agentId: string, run: AgentRunRecord) => {
  await putRun(run);
  if (run.status !== 'running') {
    await touchAgentRun(agentId, {
      lastRunAt: run.finishedAt ?? nowIso(),
      lastRunStatus: run.status,
      lastRunError: run.error,
    });
  }
};

export const runAgent = async (options: {
  agentId: string;
  input?: string;
  actor?: string;
  context?: Record<string, unknown>;
  executionMode?: ExecutionMode;
  version?: VersionSelector;
  trigger?: AgentRunTrigger;
  source?: string;
  provider?: LLMProvider;
  executeToolFn?: typeof executeTool;
}) => {
  const executionMode = options.executionMode ?? 'production';
  const head = await getAgent(options.agentId);
  if (!head) {
    throw new Error('Agent was not found.');
  }
  const published = head.publishedVersion
    ? await getAgentVersion(head.id, head.publishedVersion)
    : null;
  const resolved = resolveDefinitionVersion({
    head,
    published,
    executionMode,
    version: options.version,
  });
  if (!resolved.ok) {
    throw new Error(resolved.message);
  }
  const definition = resolved.definition;
  const providerStatus = await providerStatusFor(definition);
  const startedAt = nowIso();
  const runId = crypto.randomUUID();
  let running: AgentRunRecord = {
    runId,
    agentId: definition.id,
    agentName: definition.name,
    agentVersion: definition.draftVersion,
    executionMode,
    status: 'running',
    trigger: options.trigger ?? (executionMode === 'test' ? 'test' : 'manual'),
    startedAt,
    triggeredBy: options.actor,
    source: options.source,
    provider: definition.provider,
    model: definition.model,
    steps: [
      {
        id: crypto.randomUUID(),
        at: startedAt,
        type: 'INFO',
        name: 'run_started',
        output: {
          trigger: options.trigger ?? executionMode,
          version: definition.draftVersion,
          executionMode,
        },
      },
    ],
  };
  if (head.publishedVersion && executionMode === 'production') {
    running = { ...running, agentVersion: head.publishedVersion };
  }
  await persistRun(definition.id, running);

  if (providerStatus === 'disabled') {
    return finish(
      addStep(running, {
        at: nowIso(),
        type: 'ERROR',
        name: 'disabled',
        error: 'This agent is disabled.',
      }),
      { status: 'failed', error: 'This agent is disabled.' },
      (run) => persistRun(definition.id, run),
    );
  }
  if (providerStatus === 'missing_credentials') {
    return finish(
      addStep(running, {
        at: nowIso(),
        type: 'ERROR',
        name: 'credentials',
        error: 'OpenAI is not configured. Add the API key to the yalla/openai secret.',
      }),
      {
        status: 'failed',
        error:
          'OpenAI is not configured. Add the API key to the yalla/openai secret.',
      },
      (run) => persistRun(definition.id, run),
    );
  }
  if (providerStatus === 'unsupported_provider') {
    return finish(
      addStep(running, {
        at: nowIso(),
        type: 'ERROR',
        name: 'provider',
        error: `Provider ${definition.provider} is not implemented yet.`,
      }),
      {
        status: 'failed',
        error: `Provider ${definition.provider} is not implemented yet.`,
      },
      (run) => persistRun(definition.id, run),
    );
  }

  return executeAgentDefinition({
    definition,
    input: options.input?.trim() || DEFAULT_PRODUCTION_INPUT,
    run: running,
    persist: (run) => persistRun(definition.id, run),
    provider: options.provider,
    executeToolFn: options.executeToolFn,
  });
};
