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
  JOB_SCHEDULER_ID_PREFIX,
  mapJobSchedulerRule,
  normalizeIntervalDays,
} from '../shared/job-scheduler';
import {
  docClient,
  getNextSequentialId,
  putItem,
} from '../shared/visit-task-utils';

type Payload = {
  id?: string;
  propertyId?: string;
  name?: string;
  intervalDays?: number;
  templateIds?: unknown;
  createTemplateId?: string;
  enabled?: boolean;
  action?: string;
};

const uniqueTemplateIds = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const next: string[] = [];
  for (const entry of value) {
    const id = String(entry ?? '').trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    next.push(id);
  }
  return next;
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
      return buildHttpResponse(404, { message: 'Job scheduler rule not found.' });
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
    const mapped = mapJobSchedulerRule(existing);
    const name = mapped.name || payload.id.trim();
    await recordActivityLog(event, {
      feature: LOG_FEATURES.OPERATIONS,
      action: 'delete',
      entityId: payload.id.trim(),
      entityName: name,
      summary: `deleted job scheduler rule ${quoted(name)}`,
    });
    return buildHttpResponse(200, { deleted: true, id: payload.id.trim() });
  }

  const existingMapped = existing ? mapJobSchedulerRule(existing) : undefined;
  const propertyId =
    payload.propertyId?.trim() || existingMapped?.propertyId || '';
  const name = payload.name?.trim() || existingMapped?.name || '';
  const intervalDays =
    payload.intervalDays !== undefined
      ? normalizeIntervalDays(payload.intervalDays)
      : existingMapped?.intervalDays || 0;
  const templateIds = uniqueTemplateIds(
    payload.templateIds ?? existingMapped?.templateIds,
  );
  const createTemplateId =
    payload.createTemplateId?.trim() ||
    existingMapped?.createTemplateId ||
    templateIds[0] ||
    '';

  if (!propertyId || !name || intervalDays < 1 || templateIds.length === 0) {
    return buildHttpResponse(400, {
      message:
        'propertyId, name, intervalDays, and at least one templateId are required.',
    });
  }

  if (!templateIds.includes(createTemplateId)) {
    return buildHttpResponse(400, {
      message: 'createTemplateId must be one of the selected templateIds.',
    });
  }

  const timestamp = nowIso();
  const item: Record<string, unknown> = {
    id: isUpdate
      ? payload.id?.trim()
      : await getNextSequentialId(tableName, JOB_SCHEDULER_ID_PREFIX),
    propertyId,
    name,
    intervalDays,
    templateIds,
    createTemplateId,
    enabled:
      payload.enabled ??
      (typeof existingMapped?.enabled === 'boolean'
        ? existingMapped.enabled
        : true),
    createdAt: existingMapped?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };

  try {
    await putItem(tableName, item);
    const mapped = mapJobSchedulerRule(item);
    await recordActivityLog(event, {
      feature: LOG_FEATURES.OPERATIONS,
      action: isUpdate ? 'update' : 'create',
      entityId: mapped.id,
      entityName: mapped.name,
      summary: isUpdate
        ? `updated job scheduler rule ${quoted(mapped.name)}`
        : `created job scheduler rule ${quoted(mapped.name)}`,
    });
    return buildHttpResponse(200, { item: mapped });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save job scheduler rule.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
