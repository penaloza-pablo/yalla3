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
  MAINTENANCE_VISIT_TYPE_ID,
  OTHER_PROVIDER_ID,
  asString,
} from '../shared/maintenance-billing';
import {
  docClient,
  getNextSequentialId,
  putItem,
} from '../shared/visit-task-utils';

type Payload = {
  id?: string;
  visitId?: string;
  description?: string;
  providerId?: string;
  providerName?: string;
  action?: string;
};

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
  const providersTable = process.env.PROVIDERS_TABLE;
  if (!tableName || !visitsTable) {
    return buildHttpResponse(500, {
      message: 'TABLE_NAME or VISITS_TABLE is not configured.',
    });
  }

  const payload = parseBody<Payload>(event.body);
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
      await recordActivityLog(event, {
        feature: LOG_FEATURES.MAINTENANCE_INCIDENTS,
        action: 'delete',
        entityId: asString(existing.id),
        entityName: asString(existing.property) || asString(existing.visitId),
        summary: `deleted maintenance incident ${quoted(asString(existing.id))}`,
      });
      return buildHttpResponse(200, { deleted: true, id: existing.id });
    }

    const visitId = asString(payload.visitId) || asString(existing?.visitId);
    const description =
      asString(payload.description) || asString(existing?.description);
    let providerId =
      asString(payload.providerId) || asString(existing?.providerId);
    let providerName =
      asString(payload.providerName) || asString(existing?.providerName);
    if (!visitId) {
      return buildHttpResponse(400, { message: 'visitId is required.' });
    }
    if (!description) {
      return buildHttpResponse(400, { message: 'description is required.' });
    }
    if (!providerId && !providerName) {
      return buildHttpResponse(400, { message: 'provider is required.' });
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
    if (asString(visit.visitTypeId) !== MAINTENANCE_VISIT_TYPE_ID) {
      return buildHttpResponse(400, {
        message: 'Incidents can only be created for maintenance visits.',
      });
    }

    if (providerId && providerId !== OTHER_PROVIDER_ID && providersTable) {
      const providerResult = await docClient.send(
        new GetCommand({
          TableName: providersTable,
          Key: { id: providerId },
        }),
      );
      const provider = providerResult.Item as Record<string, unknown> | undefined;
      if (provider) {
        providerName = asString(provider.name) || providerName || providerId;
      }
    }
    if (providerId === OTHER_PROVIDER_ID && !providerName) {
      return buildHttpResponse(400, {
        message: 'providerName is required when using Other.',
      });
    }

    const propertyId = asString(visit.propertyId);
    const date = asString(visit.scheduledDate).slice(0, 10);
    const property = await resolvePropertyLabel(visit, propertyId);
    const timestamp = nowIso();
    const id = isUpdate
      ? asString(payload.id)
      : await getNextSequentialId(tableName, 'MI');
    const createdAt = asString(existing?.createdAt) || timestamp;
    const item: Record<string, unknown> = {
      id,
      visitId,
      visitTitle: asString(visit.title) || visitId,
      propertyId,
      property,
      date,
      providerId: providerId || OTHER_PROVIDER_ID,
      providerName: providerName || providerId,
      isOtherProvider: providerId === OTHER_PROVIDER_ID,
      description,
      createdAt,
      createdAtKey: `${createdAt}#${id}`,
      updatedAt: timestamp,
    };

    await putItem(tableName, item);
    await recordActivityLog(event, {
      feature: LOG_FEATURES.MAINTENANCE_INCIDENTS,
      action: isUpdate ? 'update' : 'create',
      entityId: id,
      entityName: property || visitId,
      summary: isUpdate
        ? `updated maintenance incident ${quoted(id)} for ${quoted(property)}`
        : `created maintenance incident ${quoted(id)} for ${quoted(property)}`,
    });
    return buildHttpResponse(200, { item });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save maintenance incident.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
