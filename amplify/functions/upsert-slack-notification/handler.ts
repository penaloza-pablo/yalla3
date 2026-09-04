import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import {
  isKnownSlackNotificationId,
  type SlackNotificationId,
} from '../shared/slack-notifications';
import { putItem } from '../shared/visit-task-utils';

type Payload = {
  id?: string;
  enabled?: boolean;
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
}) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) return denied;
  }

  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const payload = parseBody<Payload>(event.body);
  const id = payload?.id?.trim() ?? '';
  if (!isKnownSlackNotificationId(id)) {
    return buildHttpResponse(400, { message: 'Unknown Slack notification.' });
  }
  if (typeof payload?.enabled !== 'boolean') {
    return buildHttpResponse(400, { message: 'enabled is required.' });
  }

  const timestamp = nowIso();
  const item = {
    id: id as SlackNotificationId,
    enabled: payload.enabled,
    updatedAt: timestamp,
  };

  try {
    await putItem(tableName, item);
    await recordActivityLog(event, {
      feature: LOG_FEATURES.SLACK,
      action: payload.enabled ? 'enable' : 'disable',
      entityId: id,
      entityName: id,
      summary: payload.enabled
        ? `enabled Slack notification ${quoted(id)}`
        : `disabled Slack notification ${quoted(id)}`,
    });
    return buildHttpResponse(200, { item });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save Slack notification.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
