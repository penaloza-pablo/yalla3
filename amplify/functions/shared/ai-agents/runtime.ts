import { nowIso } from '../dynamo-http';
import { applyCoveragePolicy, findingsFromCoverage } from './coverage';
import { invokeOpenAi } from './providers/openai';
import { hasOpenAiCredentials } from './providers/openai-secret';
import { getAgent, putRun, touchAgentRun } from './store';
import { resolveAllowedTools } from './tools/registry';
import type {
  AgentDefinition,
  AgentPublicRecord,
  AgentRunRecord,
  ProviderConfigStatus,
} from './types';

const providerStatusFor = async (
  agent: {
    enabled: boolean;
    provider: string;
  },
): Promise<ProviderConfigStatus> => {
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
});

export const runAgent = async (options: {
  agentId: string;
  trigger: AgentRunRecord['trigger'];
  triggeredBy?: string;
}) => {
  const agent = await getAgent(options.agentId);
  if (!agent) {
    throw new Error('Agent was not found.');
  }
  const providerStatus = await providerStatusFor(agent);
  const startedAt = nowIso();
  const runId = crypto.randomUUID();
  const running: AgentRunRecord = {
    runId,
    agentId: agent.id,
    status: 'running',
    trigger: options.trigger,
    startedAt,
    triggeredBy: options.triggeredBy,
    events: [
      {
        at: startedAt,
        type: 'info',
        name: 'run_started',
        outputSummary: `Trigger ${options.trigger}.`,
      },
    ],
  };
  await putRun(running);
  await touchAgentRun(agent.id, {
    lastRunAt: startedAt,
    lastRunStatus: 'running',
  });

  const fail = async (error: string): Promise<AgentRunRecord> => {
    const finishedAt = nowIso();
    const failed: AgentRunRecord = {
      ...running,
      status: 'failed',
      finishedAt,
      error,
      events: [
        ...(running.events ?? []),
        { at: finishedAt, type: 'error', name: 'run_failed', error },
      ],
    };
    await putRun(failed);
    await touchAgentRun(agent.id, {
      lastRunAt: finishedAt,
      lastRunStatus: 'failed',
      lastRunError: error,
    });
    return failed;
  };

  if (providerStatus === 'disabled') {
    return fail('This agent is disabled.');
  }
  if (providerStatus === 'missing_credentials') {
    return fail(
      'OpenAI is not configured. Add the API key to the yalla/openai secret.',
    );
  }
  if (providerStatus === 'unsupported_provider') {
    return fail(`Provider ${agent.provider} is not implemented yet.`);
  }

  const { tools, missing } = resolveAllowedTools(agent.allowedTools);
  if (missing.length > 0) {
    return fail(`Unknown tools in agent config: ${missing.join(', ')}.`);
  }

  try {
    const instructions = [
      agent.instructions.trim(),
      '',
      'Rules:',
      ...agent.rules.map((rule) => `- ${rule}`),
    ].join('\n');
    const invoked = await invokeOpenAi({
      model: agent.model,
      instructions,
      userMessage:
        'Execute your configured task for the current business day in Europe/Madrid.',
      tools,
    });
    const coverage = applyCoveragePolicy(
      agent.coveragePolicy,
      invoked.toolCoverage,
      invoked.text,
    );
    const findings = findingsFromCoverage(
      coverage,
      invoked.text,
      agent.coveragePolicy,
    );
    const finishedAt = nowIso();
    const succeeded: AgentRunRecord = {
      ...running,
      status: 'succeeded',
      finishedAt,
      result: invoked.text,
      coverage,
      findings,
      events: [
        ...(running.events ?? []),
        ...invoked.events,
        {
          at: finishedAt,
          type: 'info',
          name: 'run_finished',
          outputSummary: `Reviewed ${coverage.reviewed.length} of ${coverage.planned.length} planned item(s).`,
        },
      ],
      usage: invoked.usage,
    };
    await putRun(succeeded);
    await touchAgentRun(agent.id, {
      lastRunAt: finishedAt,
      lastRunStatus: 'succeeded',
    });
    return succeeded;
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
};
