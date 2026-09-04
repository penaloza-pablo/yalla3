import { GetCommand } from '@aws-sdk/lib-dynamodb';
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
import { scanAllItems } from '../shared/cleaning-plan';
import { docClient, putItem } from '../shared/visit-task-utils';

type AgentPayload = {
  id?: string;
  userId?: string;
  name?: string;
  active?: boolean;
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
  const usersTable = process.env.USERS_TABLE;
  if (!tableName) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const payload = parseBody<AgentPayload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }

  const isUpdate = Boolean(payload.id?.trim());
  let existing: Record<string, unknown> | undefined;

  if (isUpdate) {
    const found = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { id: payload.id?.trim() },
      }),
    );
    if (!found.Item) {
      return buildHttpResponse(404, { message: 'Agent not found.' });
    }
    existing = found.Item as Record<string, unknown>;
  }

  const userId = payload.userId?.trim() || (isUpdate
    ? String(existing?.userId ?? existing?.id ?? '')
    : '');
  if (!isUpdate && !userId) {
    return buildHttpResponse(400, { message: 'userId is required.' });
  }

  if (!isUpdate && usersTable) {
    const user = await docClient.send(
      new GetCommand({
        TableName: usersTable,
        Key: { id: userId },
      }),
    );
    if (!user.Item) {
      return buildHttpResponse(400, { message: 'Selected user was not found.' });
    }
    if (!payload.name?.trim()) {
      payload.name =
        typeof user.Item.name === 'string' ? user.Item.name : undefined;
    }
  }

  if (!isUpdate) {
    const current = await scanAllItems(tableName);
    const duplicate = current.find(
      (entry) =>
        String(entry.userId ?? entry.id ?? '') === userId ||
        String(entry.id ?? '') === userId,
    );
    if (duplicate) {
      return buildHttpResponse(400, {
        message: 'That user is already a maintenance agent.',
      });
    }
  }

  const name = payload.name?.trim();
  if (!isUpdate && !name) {
    return buildHttpResponse(400, { message: 'name is required.' });
  }

  const timestamp = nowIso();
  const item: Record<string, unknown> = {
    ...(existing ?? {}),
    id: isUpdate ? payload.id?.trim() : userId,
    userId: userId || (typeof existing?.userId === 'string' ? existing.userId : ''),
    name: name ?? (typeof existing?.name === 'string' ? existing.name : ''),
    active: payload.active ?? existing?.active ?? true,
    createdAt:
      (typeof existing?.createdAt === 'string' ? existing.createdAt : undefined) ??
      timestamp,
    updatedAt: timestamp,
  };

  try {
    await putItem(tableName, item);
    const agentName =
      typeof item.name === 'string' && item.name.trim()
        ? item.name
        : typeof item.id === 'string'
          ? item.id
          : 'agent';
    await recordActivityLog(event, {
      feature: LOG_FEATURES.MAINTENANCE_SETTINGS,
      action: isUpdate ? 'update' : 'create',
      entityId: typeof item.id === 'string' ? item.id : undefined,
      entityName: agentName,
      summary: isUpdate
        ? item.active === false
          ? `deactivated maintenance agent ${quoted(agentName)}`
          : `updated maintenance agent ${quoted(agentName)}`
        : `created maintenance agent ${quoted(agentName)}`,
    });
    return buildHttpResponse(200, { item });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save maintenance agent.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
