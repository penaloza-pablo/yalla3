import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { rejectIfUnauthenticated } from '../shared/cognito-auth';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

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
  active?: boolean;
  type?: string;
  roomType?: string;
  accommodates?: number;
  bedrooms?: number;
  bathrooms?: number;
  city?: string;
  neighborhood?: string;
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

  const propertyFields = {
    id,
    title: payload.title?.trim() ?? '',
    nickname: payload.nickname?.trim() ?? '',
    active: Boolean(payload.active),
    type: payload.type?.trim() ?? '',
    roomType: payload.roomType?.trim() ?? '',
    accommodates: Number(payload.accommodates) || 0,
    bedrooms: Number(payload.bedrooms) || 0,
    bathrooms: Number(payload.bathrooms) || 0,
    city: payload.city?.trim() ?? '',
    neighborhood: payload.neighborhood?.trim() ?? '',
  };

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
    const item = {
      ...previous,
      ...propertyFields,
      ListingID:
        typeof previous.ListingID === 'string' && previous.ListingID.length > 0
          ? previous.ListingID
          : id,
      ListingNickname:
        propertyFields.nickname ||
        (typeof previous.ListingNickname === 'string'
          ? previous.ListingNickname
          : ''),
    };

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );
    const response = { item };
    return isHttp ? buildHttpResponse(200, response) : response;
  } catch (error) {
    const message = 'Failed to save property.';
    if (isHttp) {
      return buildHttpResponse(500, { message });
    }
    throw new Error(message);
  }
};
