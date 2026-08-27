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
import {
  docClient,
  getNextSequentialId,
  putItem,
} from '../shared/visit-task-utils';

type Payload = {
  id?: string;
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
  if (!tableName) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const payload = parseBody<Payload>(event.body);
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
      return buildHttpResponse(404, { message: 'Provider not found.' });
    }
    existing = found.Item as Record<string, unknown>;
  }

  const name = payload.name?.trim();
  if (!isUpdate && !name) {
    return buildHttpResponse(400, { message: 'name is required.' });
  }

  const timestamp = nowIso();
  const item: Record<string, unknown> = {
    ...(existing ?? {}),
    id: isUpdate
      ? payload.id?.trim()
      : await getNextSequentialId(tableName, 'PROVIDER'),
    name: name ?? (typeof existing?.name === 'string' ? existing.name : ''),
    active: payload.active ?? existing?.active ?? true,
    createdAt:
      (typeof existing?.createdAt === 'string' ? existing.createdAt : undefined) ??
      timestamp,
    updatedAt: timestamp,
  };

  try {
    await putItem(tableName, item);
    const providerName =
      typeof item.name === 'string' && item.name.trim()
        ? item.name
        : String(item.id);
    await recordActivityLog(event, {
      feature: LOG_FEATURES.MAINTENANCE_SETTINGS,
      action: isUpdate ? 'update' : 'create',
      entityId: typeof item.id === 'string' ? item.id : undefined,
      entityName: providerName,
      summary: isUpdate
        ? item.active === false
          ? `deactivated provider ${quoted(providerName)}`
          : `updated provider ${quoted(providerName)}`
        : `created provider ${quoted(providerName)}`,
    });
    return buildHttpResponse(200, { item });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save provider.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
