import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
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
import { normalizeTitlePrefix } from '../shared/visit-template-auto-assign';

type Payload = {
  id?: string;
  propertyId?: string;
  templateId?: string;
  titlePrefix?: string;
  enabled?: boolean;
  action?: string;
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
      return buildHttpResponse(404, { message: 'Auto-assign rule not found.' });
    }
    existing = found.Item as Record<string, unknown>;
  }

  if (payload.action === 'delete') {
    if (!existing || !payload.id?.trim()) {
      return buildHttpResponse(400, { message: 'id is required.' });
    }
    await docClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { id: payload.id.trim() },
      }),
    );
    const name =
      typeof existing.titlePrefix === 'string' && existing.titlePrefix.trim()
        ? existing.titlePrefix
        : payload.id.trim();
    await recordActivityLog(event, {
      feature: LOG_FEATURES.OPERATIONS,
      action: 'delete',
      entityId: payload.id.trim(),
      entityName: name,
      summary: `deleted template auto-assign ${quoted(name)}`,
    });
    return buildHttpResponse(200, { deleted: true, id: payload.id.trim() });
  }

  const propertyId = payload.propertyId?.trim();
  const templateId = payload.templateId?.trim();
  const titlePrefix = normalizeTitlePrefix(payload.titlePrefix ?? '');

  if (!isUpdate && (!propertyId || !templateId || !titlePrefix)) {
    return buildHttpResponse(400, {
      message: 'propertyId, templateId, and titlePrefix are required.',
    });
  }

  const timestamp = nowIso();
  const item: Record<string, unknown> = {
    id: isUpdate
      ? payload.id?.trim()
      : await getNextSequentialId(tableName, 'TAA'),
    propertyId:
      propertyId ||
      (typeof existing?.propertyId === 'string' ? existing.propertyId : ''),
    templateId:
      templateId ||
      (typeof existing?.templateId === 'string' ? existing.templateId : ''),
    titlePrefix:
      titlePrefix ||
      (typeof existing?.titlePrefix === 'string' ? existing.titlePrefix : ''),
    enabled:
      payload.enabled ??
      (typeof existing?.enabled === 'boolean' ? existing.enabled : true),
    createdAt:
      (typeof existing?.createdAt === 'string' ? existing.createdAt : undefined) ??
      timestamp,
    updatedAt: timestamp,
  };

  if (!item.propertyId || !item.templateId || !item.titlePrefix) {
    return buildHttpResponse(400, {
      message: 'propertyId, templateId, and titlePrefix are required.',
    });
  }

  try {
    await putItem(tableName, item);
    const name = String(item.titlePrefix);
    await recordActivityLog(event, {
      feature: LOG_FEATURES.OPERATIONS,
      action: isUpdate ? 'update' : 'create',
      entityId: typeof item.id === 'string' ? item.id : undefined,
      entityName: name,
      summary: isUpdate
        ? `updated template auto-assign ${quoted(name)}`
        : `created template auto-assign ${quoted(name)}`,
    });
    return buildHttpResponse(200, { item });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save template auto-assign rule.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
