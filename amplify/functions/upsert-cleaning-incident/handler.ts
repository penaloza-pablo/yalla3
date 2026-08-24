import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import {
  dateOnly,
  findCleanerIdForVisit,
  getCleanerById,
  isCleaningVisit,
  refreshCleanerRatings,
} from '../shared/cleaner-stats';
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

type IncidentPayload = {
  id?: string;
  visitId?: string;
  description?: string;
  action?: string;
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const resolvePropertyLabel = async (
  visit: Record<string, unknown>,
  propertyId: string,
) => {
  const fromVisit = [visit.Property, visit.property]
    .map((value) => asString(value))
    .find(Boolean);
  if (fromVisit) {
    return fromVisit;
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
    asString(property?.ListingNickname) ||
    asString(property?.listingNickname) ||
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
  const visitsTable = process.env.VISITS_TABLE;
  if (!tableName || !visitsTable) {
    return buildHttpResponse(500, {
      message: 'TABLE_NAME or VISITS_TABLE is not configured.',
    });
  }

  const payload = parseBody<IncidentPayload>(event.body);
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
      return buildHttpResponse(404, { message: 'Incident not found.' });
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
      const cleanerId = asString(existing.cleanerId);
      if (cleanerId) {
        await refreshCleanerRatings(cleanerId);
      }
      await recordActivityLog(event, {
        feature: LOG_FEATURES.CLEANING_INCIDENTS,
        action: 'delete',
        entityId: asString(existing.id),
        entityName: asString(existing.property) || asString(existing.visitId),
        summary: `deleted cleaning incident ${quoted(asString(existing.id))}`,
      });
      return buildHttpResponse(200, { deleted: true, id: existing.id });
    }

    const visitId = asString(payload.visitId) || asString(existing?.visitId);
    const description =
      asString(payload.description) || asString(existing?.description);
    if (!visitId) {
      return buildHttpResponse(400, { message: 'visitId is required.' });
    }
    if (!description) {
      return buildHttpResponse(400, { message: 'description is required.' });
    }

    const visitResult = await docClient.send(
      new GetCommand({
        TableName: visitsTable,
        Key: { id: visitId },
      }),
    );
    const visit = visitResult.Item as Record<string, unknown> | undefined;
    if (!visit) {
      return buildHttpResponse(404, { message: 'Visit not found.' });
    }
    if (!isCleaningVisit(visit)) {
      return buildHttpResponse(400, {
        message: 'Incidents can only be created for cleaning visits.',
      });
    }

    const propertyId = asString(visit.propertyId);
    const date = dateOnly(visit.scheduledDate);
    const cleanerId = await findCleanerIdForVisit(visit);
    if (!cleanerId) {
      return buildHttpResponse(400, {
        message:
          'This cleaning visit has no cleaner assigned in the cleaning plan.',
      });
    }
    const cleaner = await getCleanerById(cleanerId);
    const cleanerName =
      asString(cleaner?.name) || asString(existing?.cleanerName) || cleanerId;
    const property = await resolvePropertyLabel(visit, propertyId);
    const timestamp = nowIso();
    const id = isUpdate
      ? asString(payload.id)
      : await getNextSequentialId(tableName, 'CI');
    const createdAt = asString(existing?.createdAt) || timestamp;
    const item: Record<string, unknown> = {
      id,
      visitId,
      visitTitle: asString(visit.title) || visitId,
      propertyId,
      property,
      date,
      cleanerId,
      cleanerName,
      description,
      createdAt,
      createdAtKey: `${createdAt}#${id}`,
      updatedAt: timestamp,
    };

    await putItem(tableName, item);
    await refreshCleanerRatings(cleanerId);
    const previousCleanerId = asString(existing?.cleanerId);
    if (previousCleanerId && previousCleanerId !== cleanerId) {
      await refreshCleanerRatings(previousCleanerId);
    }

    await recordActivityLog(event, {
      feature: LOG_FEATURES.CLEANING_INCIDENTS,
      action: isUpdate ? 'update' : 'create',
      entityId: id,
      entityName: property || visitId,
      summary: isUpdate
        ? `updated cleaning incident ${quoted(id)} for ${quoted(property)}`
        : `created cleaning incident ${quoted(id)} for ${quoted(property)}`,
    });
    return buildHttpResponse(200, { item });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save cleaning incident.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
