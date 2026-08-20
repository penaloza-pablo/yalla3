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
  parseBody, rejectIfUnauthenticated } from '../shared/dynamo-http';
import {
  docClient,
  getNextSequentialId,
  putItem,
} from '../shared/visit-task-utils';

type VisitTypePayload = {
  id?: string;
  name?: string;
  description?: string;
  defaultTeamId?: string;
  defaultDurationMinutes?: number;
  appliesToHourBank?: boolean;
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

  const payload = parseBody<VisitTypePayload>(event.body);
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
      return buildHttpResponse(404, { message: 'Visit type not found.' });
    }
    existing = found.Item as Record<string, unknown>;
  }

  const name = payload.name?.trim();
  if (!isUpdate && !name) {
    return buildHttpResponse(400, { message: 'name is required.' });
  }

  const timestamp = nowIso();
  const item: Record<string, unknown> = {
    id: isUpdate
      ? payload.id?.trim()
      : await getNextSequentialId(tableName, 'VT'),
    name: name ?? (typeof existing?.name === 'string' ? existing.name : ''),
    description:
      payload.description?.trim() ??
      (typeof existing?.description === 'string' ? existing.description : ''),
    defaultTeamId:
      payload.defaultTeamId?.trim() ??
      (typeof existing?.defaultTeamId === 'string' ? existing.defaultTeamId : undefined),
    defaultDurationMinutes:
      payload.defaultDurationMinutes ??
      (typeof existing?.defaultDurationMinutes === 'number'
        ? existing.defaultDurationMinutes
        : undefined),
    appliesToHourBank:
      payload.appliesToHourBank ??
      (typeof existing?.appliesToHourBank === 'boolean'
        ? existing.appliesToHourBank
        : false),
    active: payload.active ?? existing?.active ?? true,
    createdAt:
      (typeof existing?.createdAt === 'string' ? existing.createdAt : undefined) ??
      timestamp,
    updatedAt: timestamp,
  };

  if (!item.defaultTeamId) {
    delete item.defaultTeamId;
  }
  if (
    typeof item.defaultDurationMinutes !== 'number' ||
    !Number.isFinite(item.defaultDurationMinutes)
  ) {
    delete item.defaultDurationMinutes;
  }
  if (!item.description) {
    delete item.description;
  }

  try {
    await putItem(tableName, item);
    const typeName =
      typeof item.name === 'string' && item.name.trim()
        ? item.name
        : typeof item.id === 'string'
          ? item.id
          : 'visit type';
    await recordActivityLog(event, {
      feature: LOG_FEATURES.OPERATIONS,
      action: isUpdate ? 'update' : 'create',
      entityId: typeof item.id === 'string' ? item.id : undefined,
      entityName: typeName,
      summary: isUpdate
        ? `updated visit type ${quoted(typeName)}`
        : `created visit type ${quoted(typeName)}`,
    });
    return buildHttpResponse(200, { item });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save visit type.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
