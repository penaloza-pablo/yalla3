import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import { rejectIfUnauthenticated } from '../shared/cognito-auth';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  resolveYallaPropertyLabel,
  yallaAliasForListingId,
  isP2BuildingId,
  isP2RoomListingId,
} from '../shared/property-identity';
import {
  asStringList,
  isReportGroupType,
  REPORT_GROUP_TYPE,
  resolveReportGroups,
} from '../shared/property-groups';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,authorization',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

type PropertyPayload = {
  id?: string;
  title?: string;
  nickname?: string;
  listingNickname?: string;
  active?: boolean;
  type?: string;
  roomType?: string;
  accommodates?: number;
  bedrooms?: number;
  bathrooms?: number;
  city?: string;
  neighborhood?: string;
  memberIds?: unknown;
  system?: boolean;
};

const parseBody = (body?: string) => {
  if (!body) {
    return null;
  }
  try {
    return JSON.parse(body) as PropertyPayload;
  } catch {
    return null;
  }
};

const isHttpRequest = (event: {
  requestContext?: { http?: { method?: string } };
}) => Boolean(event.requestContext?.http?.method);

const buildHttpResponse = (statusCode: number, payload: Record<string, unknown>) => ({
  statusCode,
  headers: {
    ...corsHeaders,
    'content-type': 'application/json',
  },
  body: JSON.stringify(payload),
});

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  body?: string;
  headers?: Record<string, string | string[] | undefined>;
  arguments?: PropertyPayload;
}) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
    };
  }

  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) return denied;
  }

  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    const message = 'TABLE_NAME is not configured.';
    if (isHttp) {
      return buildHttpResponse(500, { message });
    }
    throw new Error(message);
  }

  const payload = isHttp ? parseBody(event.body) : event.arguments;
  if (!payload) {
    const message = 'Payload is required.';
    if (isHttp) {
      return buildHttpResponse(400, { message });
    }
    throw new Error(message);
  }

  const id = payload.id?.trim();
  if (!id) {
    const message = 'Property id is required.';
    if (isHttp) {
      return buildHttpResponse(400, { message });
    }
    throw new Error(message);
  }

  const isGroup = isReportGroupType(payload.type);
  const memberIds = asStringList(payload.memberIds);
  const yallaNickname = isGroup
    ? payload.nickname?.trim() || payload.title?.trim() || id
    : yallaAliasForListingId(id) || payload.nickname?.trim() || '';
  const propertyFields = {
    id,
    title: payload.title?.trim() ?? '',
    nickname: yallaNickname,
    active: Boolean(payload.active),
    type: isGroup ? REPORT_GROUP_TYPE : payload.type?.trim() ?? '',
    roomType: payload.roomType?.trim() ?? '',
    accommodates: Number(payload.accommodates) || 0,
    bedrooms: Number(payload.bedrooms) || 0,
    bathrooms: Number(payload.bathrooms) || 0,
    city: payload.city?.trim() ?? '',
    neighborhood: payload.neighborhood?.trim() ?? '',
  };

  const fail = (status: number, message: string) => {
    if (isHttp) {
      return buildHttpResponse(status, { message });
    }
    throw new Error(message);
  };

  if (isGroup) {
    if (memberIds.length === 0) {
      return fail(400, 'A property group needs at least one property.');
    }
    if (memberIds.some((memberId) => isReportGroupType(memberId))) {
      return fail(400, 'A property group cannot contain another group.');
    }
    if (
      !isP2BuildingId(id) &&
      memberIds.some((memberId) => isP2RoomListingId(memberId) || isP2BuildingId(memberId))
    ) {
      return fail(400, 'P2 rooms can only belong to Planta 2.');
    }
  }

  try {
    // Merge with existing item so bookings/reviews metrics (GuestPaid*, Listing*)
    // are preserved when enriching a stub via Update from Guesty.
    const existing = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: { id },
      }),
    );
    const previous =
      existing.Item && typeof existing.Item === 'object'
        ? (existing.Item as Record<string, unknown>)
        : {};

    if (isGroup) {
      const items: Record<string, unknown>[] = [];
      let exclusiveStartKey: Record<string, unknown> | undefined;
      do {
        const scanned = await client.send(
          new ScanCommand({
            TableName: tableName,
            ExclusiveStartKey: exclusiveStartKey,
          }),
        );
        items.push(...((scanned.Items as Record<string, unknown>[]) ?? []));
        exclusiveStartKey = scanned.LastEvaluatedKey as
          | Record<string, unknown>
          | undefined;
      } while (exclusiveStartKey);
      const groups = resolveReportGroups(items);
      for (const memberId of memberIds) {
        if (memberId === id) {
          continue;
        }
        const owner = groups.find(
          (group) => group.id !== id && group.memberIds.includes(memberId),
        );
        if (owner) {
          return fail(
            400,
            `${memberId} already belongs to ${owner.name}.`,
          );
        }
      }
    }

    const item = {
      ...previous,
      ...propertyFields,
      ListingID:
        typeof previous.ListingID === 'string' && previous.ListingID.length > 0
          ? previous.ListingID
          : id,
      ListingNickname:
        payload.listingNickname?.trim() ||
        (typeof previous.ListingNickname === 'string'
          ? previous.ListingNickname
          : ''),
      ...(isGroup
        ? {
            memberIds: [...new Set([id, ...memberIds])],
            system: Boolean(payload.system),
          }
        : {}),
    };

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );
    const propertyLabel = resolveYallaPropertyLabel({
      id,
      nickname: propertyFields.nickname,
      listingNickname:
        typeof item.ListingNickname === 'string' ? item.ListingNickname : '',
      title: propertyFields.title,
    });
    await recordActivityLog(event, {
      feature: isGroup ? LOG_FEATURES.PROPERTY_GROUPS : LOG_FEATURES.PROPERTIES,
      action: existing.Item ? 'update' : 'create',
      entityId: id,
      entityName: propertyLabel,
      summary: existing.Item
        ? isGroup
          ? `updated property group ${quoted(propertyLabel)}`
          : `updated property ${quoted(propertyLabel)}`
        : isGroup
          ? `created property group ${quoted(propertyLabel)}`
          : `added property ${quoted(propertyLabel)}`,
    });
    const response = { item };
    return isHttp ? buildHttpResponse(200, response) : response;
  } catch (error) {
    console.error('Failed to save property', error);
    const message = 'Failed to save property.';
    const details = error instanceof Error ? error.message : String(error);
    if (isHttp) {
      return buildHttpResponse(500, { message, details });
    }
    throw new Error(`${message} ${details}`.trim());
  }
};
