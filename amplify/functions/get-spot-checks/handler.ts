import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { rejectIfUnauthenticated } from '../shared/cognito-auth';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
} from '../shared/dynamo-http';
import { SPOT_CHECK_PK } from '../shared/spot-check';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const parseLimit = (value?: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 200;
  }
  return Math.min(Math.trunc(parsed), 500);
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
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
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const limit = parseLimit(event.queryStringParameters?.limit);
  const locationKey = event.queryStringParameters?.locationKey?.trim();

  try {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        ...(locationKey
          ? {
              IndexName: 'locationKey-sk-index',
              KeyConditionExpression: '#locationKey = :locationKey',
              ExpressionAttributeNames: { '#locationKey': 'locationKey' },
              ExpressionAttributeValues: { ':locationKey': locationKey },
            }
          : {
              KeyConditionExpression: '#pk = :pk',
              ExpressionAttributeNames: { '#pk': 'pk' },
              ExpressionAttributeValues: { ':pk': SPOT_CHECK_PK },
            }),
        ScanIndexForward: false,
        Limit: limit,
      }),
    );

    const items = (result.Items ?? []).map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      userEmail: typeof item.userEmail === 'string' ? item.userEmail : 'system',
      location: typeof item.location === 'string' ? item.location : '',
      locationKey:
        typeof item.locationKey === 'string' ? item.locationKey : '',
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
      itemCount: Number(item.itemCount) || 0,
      changedCount: Number(item.changedCount) || 0,
      categories: Array.isArray(item.categories)
        ? item.categories.map((value) => String(value).trim()).filter(Boolean)
        : [],
      s3Key: typeof item.s3Key === 'string' ? item.s3Key : '',
    }));

    return buildHttpResponse(200, {
      items,
      count: items.length,
    });
  } catch (error) {
    console.error('GetSpotChecks failed', { tableName, error });
    return buildHttpResponse(500, {
      message: 'Failed to read spot checks from DynamoDB.',
    });
  }
};
