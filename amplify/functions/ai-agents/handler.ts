import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { getActorEmail } from '../shared/cognito-auth';
import { recordActivityLog } from '../shared/activity-log';
import { decorateAgent, runAgent } from '../shared/ai-agents/runtime';
import { normalizeAgentUpsert } from '../shared/ai-agents/agent-config';
import { TOOL_DEBUG_AGENT_ID } from '../shared/ai-agents/limits';
import { OPENAI_MODELS } from '../shared/ai-agents/models';
import {
  allocateAgentId,
  getAgent,
  getAgentVersion,
  getRun,
  getRunById,
  listAgentVersions,
  listAgents,
  listRecentRuns,
  listRuns,
  listStoredTools,
  listToolVersions,
  publishAgent,
  putAgent,
  putRun,
} from '../shared/ai-agents/store';
import { executeTool } from '../shared/ai-agents/tool-executor';
import {
  getRegisteredTool,
  registeredToolNames,
} from '../shared/ai-agents/tools/registry';
import type { ExecutionMode } from '../shared/ai-agents/types';
import type { VersionSelector } from '../shared/ai-agents/select-version';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | string[] | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  body?: string;
  agentId?: string;
  source?: string;
};

const parseLimit = (value?: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 40;
  }
  return Math.min(Math.trunc(parsed), 100);
};

const resourcesPayload = async () => ({
  tools: await listStoredTools(),
  models: [...OPENAI_MODELS],
});

const parseVersion = (value: unknown): VersionSelector | undefined => {
  if (value === 'draft' || value === 'published') {
    return value;
  }
  const numeric = Number(value);
  if (Number.isInteger(numeric) && numeric > 0) {
    return numeric;
  }
  return undefined;
};

const asToolArguments = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const handler = async (event: HttpEvent) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }
  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) {
      return denied;
    }
  }

  try {
    const method = event.requestContext?.http?.method?.toUpperCase() || 'GET';
    const query = event.queryStringParameters ?? {};
    const scheduledAgentId = event.agentId;
    if (!isHttp && scheduledAgentId) {
      const run = await runAgent({
        agentId: scheduledAgentId,
        trigger: 'schedule',
        actor: 'scheduler',
        source: 'scheduler',
        executionMode: 'production',
      });
      return { ok: true, run };
    }

    if (method === 'PUT') {
      const body = parseBody<{
        id?: string;
        name?: string;
        purpose?: string;
        instructions?: string;
        rules?: unknown;
        allowedTools?: unknown;
        model?: string;
        enabled?: unknown;
        coveragePolicy?: { type?: string; expectedParagraphs?: unknown };
        runtimeLimits?: {
          maxTurns?: number;
          timeoutMs?: number;
          maxCostUsd?: number;
          maxToolCalls?: number;
        };
        approvalPolicy?: { requireApprovalFor?: unknown };
      }>(event.body);
      if (!body) {
        return buildHttpResponse(400, { message: 'Invalid JSON body.' });
      }
      const existingId = body.id?.trim();
      const existing = existingId ? await getAgent(existingId) : null;
      if (existingId && !existing) {
        return buildHttpResponse(404, { message: 'Agent was not found.' });
      }
      const normalized = normalizeAgentUpsert(body, {
        existing,
        registeredToolNames: registeredToolNames(),
        allocateId: (name) => name,
      });
      if (!normalized.ok) {
        return buildHttpResponse(400, { message: normalized.message });
      }
      const agent = existing
        ? normalized.agent
        : {
            ...normalized.agent,
            id: await allocateAgentId(normalized.agent.name),
            createdAt: nowIso(),
          };
      await putAgent(agent);
      const decorated = await decorateAgent(
        (await getAgent(agent.id)) ?? {
          ...agent,
        },
      );
      await recordActivityLog(event, {
        feature: 'Agent Studio',
        action: existing ? 'update' : 'create',
        entityId: agent.id,
        entityName: agent.name,
        summary: existing
          ? `Updated draft of ${agent.name} (v${agent.draftVersion}).`
          : `Created agent ${agent.name}.`,
      });
      return buildHttpResponse(200, {
        item: decorated,
        ...(await resourcesPayload()),
      });
    }

    if (method === 'POST') {
      const body =
        parseBody<{
          agentId?: string;
          tool?: string;
          action?: string;
          input?: string;
          arguments?: Record<string, unknown>;
          executionMode?: ExecutionMode;
          version?: VersionSelector;
          runId?: string;
          approvalId?: string;
        }>(event.body) ?? {};
      if (body.action === 'publish') {
        const agentId = body.agentId?.trim();
        if (!agentId) {
          return buildHttpResponse(400, { message: 'agentId is required.' });
        }
        const published = await publishAgent(agentId);
        if (!published) {
          return buildHttpResponse(404, { message: 'Agent was not found.' });
        }
        const decorated = await decorateAgent(published);
        await recordActivityLog(event, {
          feature: 'Agent Studio',
          action: 'publish',
          entityId: agentId,
          entityName: published.name,
          summary: `Published ${published.name} v${published.publishedVersion}.`,
        });
        return buildHttpResponse(200, {
          item: decorated,
          ...(await resourcesPayload()),
        });
      }
      if (body.action === 'approve') {
        return buildHttpResponse(501, {
          message:
            'Approval resume is persisted on the run but the Approvals UI is not implemented yet.',
          runId: body.runId,
          approvalId: body.approvalId,
        });
      }
      const toolName = body.tool?.trim();
      if (toolName) {
        const tool = getRegisteredTool(toolName);
        if (!tool) {
          return buildHttpResponse(404, {
            message: `Unknown tool: ${toolName}.`,
          });
        }
        const startedAt = nowIso();
        const runId = crypto.randomUUID();
        const actor = await getActorEmail(event);
        const toolArguments = asToolArguments(body.arguments);
        const executed = await executeTool({
          toolId: toolName,
          arguments: toolArguments,
          actor,
          agentId: TOOL_DEBUG_AGENT_ID,
          runId,
          allowedTools: [toolName],
        });
        const finishedAt = nowIso();
        const run = {
          runId,
          agentId: TOOL_DEBUG_AGENT_ID,
          agentName: toolName,
          toolId: toolName,
          executionMode: 'tool' as const,
          status:
            executed.status === 'ok'
              ? ('succeeded' as const)
              : ('failed' as const),
          trigger: 'tool_debug' as const,
          startedAt,
          finishedAt,
          triggeredBy: actor,
          source: 'agent-studio-tools',
          result:
            executed.status === 'ok'
              ? JSON.stringify(executed.content)
              : undefined,
          error:
            executed.status === 'error'
              ? executed.error
              : executed.status === 'needs_approval'
                ? 'Approval required.'
                : undefined,
          estimatedCostUsd: 0,
          latencyMs:
            executed.status === 'needs_approval' ? 0 : executed.latencyMs,
          steps: [
            {
              id: crypto.randomUUID(),
              at: startedAt,
              type: 'TOOL_CALL' as const,
              name: toolName,
              input: toolArguments,
            },
            {
              id: crypto.randomUUID(),
              at: finishedAt,
              type:
                executed.status === 'ok'
                  ? ('TOOL_RESULT' as const)
                  : ('ERROR' as const),
              name: toolName,
              output: executed.status === 'ok' ? executed.content : undefined,
              error:
                executed.status === 'error'
                  ? executed.error
                  : executed.status === 'needs_approval'
                    ? 'Approval required.'
                    : undefined,
              latencyMs:
                executed.status === 'needs_approval'
                  ? undefined
                  : executed.latencyMs,
            },
          ],
        };
        await putRun(run);
        await recordActivityLog(event, {
          feature: 'Agent Studio',
          action: 'run-tool',
          entityId: toolName,
          entityName: toolName,
          summary: `Ran tool ${toolName}.`,
        });
        if (executed.status !== 'ok') {
          return buildHttpResponse(422, {
            tool: toolName,
            run,
            message:
              executed.status === 'error'
                ? executed.error
                : 'Approval required.',
          });
        }
        return buildHttpResponse(200, {
          tool: toolName,
          output: executed.content,
          coverage: executed.coverage ?? null,
          run,
        });
      }
      const agentId = body.agentId?.trim();
      if (!agentId) {
        return buildHttpResponse(400, {
          message: 'agentId or tool is required.',
        });
      }
      const triggeredBy = await getActorEmail(event);
      const executionMode: ExecutionMode =
        body.executionMode === 'test' ? 'test' : 'production';
      const run = await runAgent({
        agentId,
        input: body.input,
        actor: triggeredBy,
        executionMode,
        version: parseVersion(body.version),
        trigger: executionMode === 'test' ? 'test' : 'manual',
        source: 'agent-studio',
      });
      await recordActivityLog(event, {
        feature: 'Agent Studio',
        action: 'run',
        entityId: agentId,
        entityName: agentId,
        summary: `Ran agent ${agentId} (${run.status}).`,
      });
      return buildHttpResponse(
        run.status === 'succeeded' || run.status === 'waiting_for_approval'
          ? 200
          : 422,
        { run },
      );
    }

    const view = query.view?.trim();
    if (view === 'runtime') {
      const items = await listRecentRuns(parseLimit(query.limit));
      return buildHttpResponse(200, { items, count: items.length });
    }
    if (view === 'tools') {
      const tools = await listStoredTools();
      return buildHttpResponse(200, {
        items: tools,
        count: tools.length,
        models: [...OPENAI_MODELS],
      });
    }
    if (view === 'tool-versions') {
      const tool = query.tool?.trim();
      if (!tool) {
        return buildHttpResponse(400, { message: 'tool is required.' });
      }
      const items = await listToolVersions(tool);
      return buildHttpResponse(200, { items, count: items.length });
    }

    const agentId = query.id?.trim();
    const runId = query.runId?.trim();
    if (runId && !agentId) {
      const run = await getRunById(runId);
      if (!run) {
        return buildHttpResponse(404, { message: 'Run was not found.' });
      }
      return buildHttpResponse(200, { run });
    }
    if (agentId && runId) {
      const run = await getRun(agentId, runId);
      if (!run) {
        return buildHttpResponse(404, { message: 'Run was not found.' });
      }
      return buildHttpResponse(200, { run });
    }
    if (agentId && query.runs === '1') {
      const runs = await listRuns(agentId, parseLimit(query.limit));
      return buildHttpResponse(200, { items: runs, count: runs.length });
    }
    if (agentId && query.versions === '1') {
      const versions = await listAgentVersions(agentId);
      return buildHttpResponse(200, { items: versions, count: versions.length });
    }
    if (agentId && query.version) {
      const version = Number(query.version);
      if (!Number.isInteger(version) || version <= 0) {
        return buildHttpResponse(400, { message: 'Invalid version.' });
      }
      const item = await getAgentVersion(agentId, version);
      if (!item) {
        return buildHttpResponse(404, { message: 'Version was not found.' });
      }
      return buildHttpResponse(200, { item });
    }
    if (agentId) {
      const agent = await getAgent(agentId);
      if (!agent) {
        return buildHttpResponse(404, { message: 'Agent was not found.' });
      }
      const decorated = await decorateAgent(agent);
      const [runs, versions] = await Promise.all([
        listRuns(agentId, 8),
        listAgentVersions(agentId),
      ]);
      return buildHttpResponse(200, {
        item: decorated,
        recentRuns: runs,
        versions,
        ...(await resourcesPayload()),
      });
    }

    const agents = await listAgents();
    const items: Awaited<ReturnType<typeof decorateAgent>>[] = [];
    for (const agent of agents) {
      items.push(await decorateAgent(agent));
    }
    return buildHttpResponse(200, {
      items,
      count: items.length,
      ...(await resourcesPayload()),
    });
  } catch (error) {
    console.error('agents handler failed', error);
    return buildHttpResponse(500, {
      message: 'Failed to process agents request.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
