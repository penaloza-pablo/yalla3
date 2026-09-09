import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import {
  normalizeAmenitiesRules,
  type AmenityRule,
} from '../shared/amenities-kit';
import {
  CLEANING_SETTINGS_ID,
  normalizeCleaningTypes,
  normalizeGapFreeNights,
} from '../shared/cleaning-plan';
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
  action?:
    | 'upsert'
    | 'delete'
    | 'upsertSettings'
    | 'upsertAmenities'
    | 'duplicateAmenities';
  propertyId?: string;
  targetPropertyId?: string;
  nickname?: string;
  cleaningTypes?: CleaningTypePayload[];
  amenitiesRules?: unknown;
  gapFreeNights?: number;
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const amenitiesRulesFromPayload = (value: unknown): AmenityRule[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const rules = normalizeAmenitiesRules(value);
  if (rules.length !== value.length) {
    return null;
  }
  const ids = rules.map((rule) => rule.inventoryId);
  if (new Set(ids).size !== ids.length) {
    return null;
  }
  return rules;
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

  const action = payload.action?.trim().toLowerCase() ?? 'upsert';
  const propertyId = payload.propertyId?.trim();

  try {
    if (action === 'upsertsettings') {
      const gapFreeNights = normalizeGapFreeNights(payload.gapFreeNights);
      if (gapFreeNights === null) {
        return buildHttpResponse(400, {
          message: 'gapFreeNights must be an integer of 0 or more.',
        });
      }
      const existingResult = await docClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { id: CLEANING_SETTINGS_ID },
        }),
      );
      const existing = existingResult.Item as Record<string, unknown> | undefined;
      const timestamp = nowIso();
      const item: Record<string, unknown> = {
        id: CLEANING_SETTINGS_ID,
        propertyId: CLEANING_SETTINGS_ID,
        kind: 'settings',
        gapFreeNights,
        createdAt:
          (typeof existing?.createdAt === 'string' ? existing.createdAt : undefined) ??
          timestamp,
        updatedAt: timestamp,
      };
      await putItem(tableName, item);
      await recordActivityLog(event, {
        feature: LOG_FEATURES.CLEANING_SETTINGS,
        action: existing ? 'update' : 'create',
        entityId: CLEANING_SETTINGS_ID,
        entityName: 'GAP',
        summary: existing
          ? `updated cleaning GAP setting to ${gapFreeNights}`
          : `set cleaning GAP setting to ${gapFreeNights}`,
      });
      return buildHttpResponse(200, {
        settings: { gapFreeNights },
      });
    }

    if (!propertyId) {
      return buildHttpResponse(400, { message: 'propertyId is required.' });
    }
    if (propertyId === CLEANING_SETTINGS_ID) {
      return buildHttpResponse(400, {
        message: 'GLOBAL is reserved for cleaning settings.',
      });
    }

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
    const existingAmenitiesRules = normalizeAmenitiesRules(
      existing?.amenitiesRules,
    );
    const existingCleaningTypes = normalizeCleaningTypes(
      existing?.cleaningTypes ?? [],
    );

    if (action === 'upsertamenities') {
      const amenitiesRules = amenitiesRulesFromPayload(payload.amenitiesRules);
      if (!amenitiesRules) {
        return buildHttpResponse(400, {
          message: 'amenitiesRules is invalid.',
        });
      }
      const item: Record<string, unknown> = {
        id: propertyId,
        propertyId,
        nickname,
        cleaningTypes: existingCleaningTypes,
        amenitiesRules,
        createdAt:
          (typeof existing?.createdAt === 'string'
            ? existing.createdAt
            : undefined) ?? timestamp,
        updatedAt: timestamp,
      };
      await putItem(tableName, item);
      await recordActivityLog(event, {
        feature: LOG_FEATURES.CLEANING_SETTINGS,
        action: existing ? 'update' : 'create',
        entityId: propertyId,
        entityName: nickname,
        summary: existing
          ? `updated amenities consumption rules for ${quoted(nickname)}`
          : `added amenities consumption rules for ${quoted(nickname)}`,
      });
      return buildHttpResponse(200, { item });
    }

    if (action === 'duplicateamenities') {
      const targetPropertyId = payload.targetPropertyId?.trim();
      if (!targetPropertyId) {
        return buildHttpResponse(400, {
          message: 'targetPropertyId is required.',
        });
      }
      if (targetPropertyId === propertyId) {
        return buildHttpResponse(400, {
          message: 'Choose a different property to duplicate the rules.',
        });
      }
      if (targetPropertyId === CLEANING_SETTINGS_ID) {
        return buildHttpResponse(400, {
          message: 'GLOBAL is reserved for cleaning settings.',
        });
      }
      if (!existing) {
        return buildHttpResponse(404, {
          message: 'Property cleaning details not found.',
        });
      }
      if (existingAmenitiesRules.length === 0) {
        return buildHttpResponse(400, {
          message: 'There are no amenities rules to duplicate.',
        });
      }

      const targetResult = await docClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { id: targetPropertyId },
        }),
      );
      const target = targetResult.Item as Record<string, unknown> | undefined;
      let targetNickname = payload.nickname?.trim() ?? '';
      if (!targetNickname && propertiesTable) {
        const propertyResult = await docClient.send(
          new GetCommand({
            TableName: propertiesTable,
            Key: { id: targetPropertyId },
          }),
        );
        const property = propertyResult.Item as
          | Record<string, unknown>
          | undefined;
        if (property) {
          targetNickname = propertyLabel(property, targetPropertyId);
        }
      }
      if (!targetNickname && typeof target?.nickname === 'string') {
        targetNickname = target.nickname;
      }
      if (!targetNickname) {
        targetNickname = targetPropertyId;
      }

      const item: Record<string, unknown> = {
        id: targetPropertyId,
        propertyId: targetPropertyId,
        nickname: targetNickname,
        cleaningTypes: normalizeCleaningTypes(target?.cleaningTypes ?? []),
        amenitiesRules: existingAmenitiesRules,
        createdAt:
          (typeof target?.createdAt === 'string'
            ? target.createdAt
            : undefined) ?? timestamp,
        updatedAt: timestamp,
      };
      await putItem(tableName, item);
      await recordActivityLog(event, {
        feature: LOG_FEATURES.CLEANING_SETTINGS,
        action: target ? 'update' : 'create',
        entityId: targetPropertyId,
        entityName: targetNickname,
        summary: `duplicated amenities consumption rules from ${quoted(nickname)} to ${quoted(targetNickname)}`,
      });
      return buildHttpResponse(200, { item });
    }

    const cleaningTypes = normalizeCleaningTypes(
      payload.cleaningTypes ?? existing?.cleaningTypes ?? [],
    );
    const item: Record<string, unknown> = {
      id: propertyId,
      propertyId,
      nickname,
      cleaningTypes,
      amenitiesRules: existingAmenitiesRules,
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
