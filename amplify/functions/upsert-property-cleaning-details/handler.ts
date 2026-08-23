import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import { normalizeCleaningTypes } from '../shared/cleaning-plan';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { docClient, putItem } from '../shared/visit-task-utils';

type CleaningTypePayload = {
  id?: string;
  name?: string;
  price?: number;
  durationHours?: number;
  isDefault?: boolean;
};

type Payload = {
  action?: 'upsert' | 'delete';
  propertyId?: string;
  nickname?: string;
  cleaningTypes?: CleaningTypePayload[];
};

const propertyLabel = (item: Record<string, unknown>, fallbackId: string) => {
  if (typeof item.nickname === 'string' && item.nickname.trim()) {
    return item.nickname;
  }
  if (typeof item.Nickname === 'string' && item.Nickname.trim()) {
    return item.Nickname;
  }
  if (typeof item.listingNickname === 'string' && item.listingNickname.trim()) {
    return item.listingNickname;
  }
  if (typeof item.title === 'string' && item.title.trim()) {
    return item.title;
  }
  return fallbackId;
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
  const propertiesTable = process.env.PROPERTIES_TABLE;
  if (!tableName) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const payload = parseBody<Payload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }

  const propertyId = payload.propertyId?.trim();
  if (!propertyId) {
    return buildHttpResponse(400, { message: 'propertyId is required.' });
  }

  const action = payload.action?.trim().toLowerCase() === 'delete' ? 'delete' : 'upsert';

  try {
    const existingResult = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { id: propertyId },
      }),
    );
    const existing = existingResult.Item as Record<string, unknown> | undefined;

    if (action === 'delete') {
      if (!existing) {
        return buildHttpResponse(404, { message: 'Property cleaning details not found.' });
      }
      await docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { id: propertyId },
        }),
      );
      const name = propertyLabel(existing, propertyId);
      await recordActivityLog(event, {
        feature: LOG_FEATURES.CLEANING_SETTINGS,
        action: 'delete',
        entityId: propertyId,
        entityName: name,
        summary: `removed property cleaning details for ${quoted(name)}`,
      });
      return buildHttpResponse(200, { deleted: true, id: propertyId });
    }

    let nickname = payload.nickname?.trim() ?? '';
    if (!nickname && propertiesTable) {
      const propertyResult = await docClient.send(
        new GetCommand({
          TableName: propertiesTable,
          Key: { id: propertyId },
        }),
      );
      const property = propertyResult.Item as Record<string, unknown> | undefined;
      if (property) {
        nickname = propertyLabel(property, propertyId);
      }
    }
    if (!nickname && typeof existing?.nickname === 'string') {
      nickname = existing.nickname;
    }
    if (!nickname) {
      nickname = propertyId;
    }

    const timestamp = nowIso();
    const cleaningTypes = normalizeCleaningTypes(
      payload.cleaningTypes ?? existing?.cleaningTypes ?? [],
    );
    const item: Record<string, unknown> = {
      id: propertyId,
      propertyId,
      nickname,
      cleaningTypes,
      createdAt:
        (typeof existing?.createdAt === 'string' ? existing.createdAt : undefined) ??
        timestamp,
      updatedAt: timestamp,
    };

    await putItem(tableName, item);
    await recordActivityLog(event, {
      feature: LOG_FEATURES.CLEANING_SETTINGS,
      action: existing ? 'update' : 'create',
      entityId: propertyId,
      entityName: nickname,
      summary: existing
        ? `updated property cleaning details for ${quoted(nickname)}`
        : `added property cleaning details for ${quoted(nickname)}`,
    });
    return buildHttpResponse(200, { item });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save property cleaning details.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
