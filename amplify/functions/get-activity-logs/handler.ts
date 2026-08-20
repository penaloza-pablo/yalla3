import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { rejectIfUnauthenticated } from '../shared/cognito-auth';
import { ACTIVITY_LOG_PK } from '../shared/activity-log';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
} from '../shared/dynamo-http';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const parseLimit = (value?: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 200;
  }
  return Math.min(Math.trunc(parsed), 500);
};

const parseExclusiveStartKey = (value?: string) => {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed;
  } catch {
    return undefined;
  }
};

type LogsQueryArgs = {
  limit?: number;
  feature?: string;
  userEmail?: string;
  exclusiveStartKey?: string;
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

  const args: LogsQueryArgs = {
    limit: parseLimit(event.queryStringParameters?.limit),
    feature: event.queryStringParameters?.feature?.trim(),
    userEmail: event.queryStringParameters?.userEmail?.trim(),
    exclusiveStartKey: event.queryStringParameters?.exclusiveStartKey,
  };

  const exclusiveStartKey = parseExclusiveStartKey(args.exclusiveStartKey);
  const feature = args.feature;
  const userEmail = args.userEmail;

  try {
    const useFeatureIndex = Boolean(feature);
    const useUserIndex = !useFeatureIndex && Boolean(userEmail);

    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        ...(useFeatureIndex
          ? {
              IndexName: 'feature-sk-index',
              KeyConditionExpression: '#feature = :feature',
              ExpressionAttributeNames: { '#feature': 'feature' },
              ExpressionAttributeValues: { ':feature': feature },
            }
          : useUserIndex
            ? {
                IndexName: 'userEmail-sk-index',
                KeyConditionExpression: '#userEmail = :userEmail',
                ExpressionAttributeNames: { '#userEmail': 'userEmail' },
                ExpressionAttributeValues: { ':userEmail': userEmail },
              }
            : {
                KeyConditionExpression: '#pk = :pk',
                ExpressionAttributeNames: { '#pk': 'pk' },
                ExpressionAttributeValues: { ':pk': ACTIVITY_LOG_PK },
              }),
        ScanIndexForward: false,
        Limit: args.limit,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const items = (result.Items ?? []).map((item) => ({
      id: typeof item.id === 'string' ? item.id : '',
      userEmail: typeof item.userEmail === 'string' ? item.userEmail : 'system',
      feature: typeof item.feature === 'string' ? item.feature : '',
      summary: typeof item.summary === 'string' ? item.summary : '',
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : '',
      action: typeof item.action === 'string' ? item.action : undefined,
      entityId: typeof item.entityId === 'string' ? item.entityId : undefined,
      entityName:
        typeof item.entityName === 'string' ? item.entityName : undefined,
    }));

    return buildHttpResponse(200, {
      items,
      count: items.length,
      lastEvaluatedKey: result.LastEvaluatedKey ?? null,
    });
  } catch (error) {
    console.error('GetActivityLogs failed', { tableName, error });
    return buildHttpResponse(500, {
      message: 'Failed to read activity logs from DynamoDB.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
