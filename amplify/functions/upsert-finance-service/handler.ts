import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import {
  asString,
  generateOccurrences,
  isDateOnly,
  mergeOccurrences,
  normalizeRecurrence,
  normalizeServiceType,
  parseOccurrences,
} from '../shared/finance-services';
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

type ServicePayload = {
  id?: string;
  type?: string;
  propertyId?: string;
  propertyName?: string;
  title?: string;
  recurrence?: string;
  startDate?: string;
  items?: unknown[];
  action?: string;
};

const resolvePropertyName = async (propertyId: string, fallback: string) => {
  if (fallback) {
    return fallback;
  }
  const tableName = process.env.PROPERTIES_TABLE;
  if (!tableName || !propertyId) {
    return propertyId;
  }
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { id: propertyId },
    }),
  );
  const property = result.Item as Record<string, unknown> | undefined;
  return (
    asString(property?.listingNickname) ||
    asString(property?.ListingNickname) ||
    asString(property?.nickname) ||
    asString(property?.Nickname) ||
    asString(property?.title) ||
    propertyId
  );
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

  const payload = parseBody<ServicePayload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }

  const action = asString(payload.action).toLowerCase();
  const isDelete = action === 'delete';
  const isUpdate = Boolean(asString(payload.id));
  let existing: Record<string, unknown> | undefined;

  if (isUpdate || isDelete) {
    const found = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { id: asString(payload.id) },
      }),
    );
    if (!found.Item) {
      return buildHttpResponse(404, { message: 'Service not found.' });
    }
    existing = found.Item as Record<string, unknown>;
  }

  try {
    if (isDelete && existing) {
      await docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { id: asString(existing.id) },
        }),
      );
      await recordActivityLog(event, {
        feature: LOG_FEATURES.SERVICES,
        action: 'delete',
        entityId: asString(existing.id),
        entityName: asString(existing.title),
        summary: `deleted service ${quoted(asString(existing.id))}`,
      });
      return buildHttpResponse(200, { deleted: true, id: existing.id });
    }

    const type = normalizeServiceType(
      asString(payload.type) || asString(existing?.type),
    );
    const title = asString(payload.title) || asString(existing?.title);
    const recurrence = normalizeRecurrence(
      asString(payload.recurrence) || asString(existing?.recurrence),
    );
    const startDate =
      asString(payload.startDate) || asString(existing?.startDate);
    const propertyId =
      type === 'apartment'
        ? asString(payload.propertyId) || asString(existing?.propertyId)
        : '';

    if (!type) {
      return buildHttpResponse(400, {
        message: 'type must be apartment or ops.',
      });
    }
    if (!title) {
      return buildHttpResponse(400, { message: 'title is required.' });
    }
    if (!recurrence) {
      return buildHttpResponse(400, { message: 'recurrence is required.' });
    }
    if (!startDate || !isDateOnly(startDate)) {
      return buildHttpResponse(400, { message: 'startDate is required.' });
    }
    if (type === 'apartment' && !propertyId) {
      return buildHttpResponse(400, {
        message: 'propertyId is required for apartment services.',
      });
    }

    const timestamp = nowIso();
    const id =
      asString(existing?.id) || (await getNextSequentialId(tableName, 'SVC'));
    const existingItems = parseOccurrences(existing?.items, id);
    const generated = generateOccurrences(id, startDate, recurrence);
    const shouldRegenerate =
      existingItems.length === 0 ||
      asString(existing?.recurrence) !== recurrence ||
      asString(existing?.startDate) !== startDate;
    const items = Array.isArray(payload.items)
      ? parseOccurrences(payload.items, id)
      : shouldRegenerate
        ? mergeOccurrences(generated, existingItems)
        : existingItems;
    const propertyName = propertyId
      ? await resolvePropertyName(
          propertyId,
          asString(payload.propertyName) || asString(existing?.propertyName),
        )
      : '';

    const item = {
      id,
      type,
      propertyId: propertyId || undefined,
      propertyName: propertyName || undefined,
      title,
      recurrence,
      startDate,
      items,
      createdAt: asString(existing?.createdAt) || timestamp,
      updatedAt: timestamp,
    };

    await putItem(tableName, item);
    await recordActivityLog(event, {
      feature: LOG_FEATURES.SERVICES,
      action: isUpdate ? 'update' : 'create',
      entityId: item.id,
      entityName: item.title,
      summary: `${isUpdate ? 'updated' : 'created'} service ${quoted(item.id)}`,
    });
    return buildHttpResponse(200, { item });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save the finance service.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
