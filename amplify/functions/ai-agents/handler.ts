import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { getActorEmail } from '../shared/cognito-auth';
import { recordActivityLog } from '../shared/activity-log';
import { decorateAgent, runAgent } from '../shared/ai-agents/runtime';
import { getAgent, getRun, listAgents, listRuns } from '../shared/ai-agents/store';

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
        triggeredBy: 'scheduler',
      });
      return { ok: true, run };
    }

    if (method === 'POST') {
      const body = parseBody<{ agentId?: string }>(event.body) ?? {};
      const agentId = body.agentId?.trim();
      if (!agentId) {
        return buildHttpResponse(400, { message: 'agentId is required.' });
      }
      const triggeredBy = await getActorEmail(event);
      const run = await runAgent({
        agentId,
        trigger: 'manual',
        triggeredBy,
      });
      await recordActivityLog(event, {
        feature: 'Agents',
        action: 'run',
        entityId: agentId,
        entityName: agentId,
        summary: `Ran agent ${agentId} (${run.status}).`,
      });
      return buildHttpResponse(run.status === 'failed' ? 422 : 200, { run });
    }

    const agentId = query.id?.trim();
    const runId = query.runId?.trim();
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
    if (agentId) {
      const agent = await getAgent(agentId);
      if (!agent) {
        return buildHttpResponse(404, { message: 'Agent was not found.' });
      }
      const decorated = await decorateAgent(agent);
      const runs = await listRuns(agentId, 8);
      return buildHttpResponse(200, { item: decorated, recentRuns: runs });
    }

    const agents = await listAgents();
    const items: Awaited<ReturnType<typeof decorateAgent>>[] = [];
    for (const agent of agents) {
      items.push(await decorateAgent(agent));
    }
    return buildHttpResponse(200, { items, count: items.length });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to process agents request.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
