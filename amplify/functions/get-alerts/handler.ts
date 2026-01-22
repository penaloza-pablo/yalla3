import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

const parseLimit = (value?: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 200;
  }
  return Math.min(Math.trunc(parsed), 500);
};

const shouldReleaseSnooze = (item: Record<string, unknown>, now: number) => {
  if (item.Status !== 'Snoozed') {
    return false;
  }
  const snoozeUntil = item.SnoozeUntil;
  if (!snoozeUntil || typeof snoozeUntil !== 'string') {
    return false;
  }
  const parsed = Date.parse(snoozeUntil);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return parsed <= now;
};

type AlertsQueryArgs = {
  limit?: number;
  status?: string;
  origin?: string;
  includeSnoozed?: boolean;
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

const buildScanFilters = (args: AlertsQueryArgs) => {
  const filters: string[] = [];
  const expressionValues: Record<string, unknown> = {};
  const expressionNames: Record<string, string> = {};

  if (args.status) {
    filters.push('#status = :status');
    expressionNames['#status'] = 'Status';
    expressionValues[':status'] = args.status;
  }

  if (args.origin) {
    filters.push('#origin = :origin');
    expressionNames['#origin'] = 'Origin';
    expressionValues[':origin'] = args.origin;
  }

  if (args.includeSnoozed === false) {
    filters.push('#status <> :snoozed');
    expressionNames['#status'] = 'Status';
    expressionValues[':snoozed'] = 'Snoozed';
  }

  return {
    FilterExpression: filters.length ? filters.join(' AND ') : undefined,
    ExpressionAttributeNames: filters.length ? expressionNames : undefined,
    ExpressionAttributeValues: filters.length ? expressionValues : undefined,
  };
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
  arguments?: AlertsQueryArgs;
}) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
    };
  }

  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    const message = 'TABLE_NAME is not configured.';
    if (isHttp) {
      return buildHttpResponse(500, { message });
    }
    throw new Error(message);
  }

  const args = isHttp
    ? {
        limit: parseLimit(event.queryStringParameters?.limit),
        status: event.queryStringParameters?.status,
        origin: event.queryStringParameters?.origin,
        includeSnoozed:
          event.queryStringParameters?.includeSnoozed === undefined
            ? undefined
            : event.queryStringParameters?.includeSnoozed === 'true',
      }
    : {
        limit: event.arguments?.limit,
        status: event.arguments?.status,
        origin: event.arguments?.origin,
        includeSnoozed: event.arguments?.includeSnoozed,
    };

  const limit = typeof args.limit === 'number' ? parseLimit(String(args.limit)) : undefined;
  const filters = buildScanFilters(args);

  try {
    const command = new ScanCommand({
      TableName: tableName,
      Limit: limit,
      ...filters,
    });

    const result = await client.send(command);
    const items = result.Items ?? [];
    const now = Date.now();

    await Promise.all(
      items
        .filter((item: Record<string, unknown>) => shouldReleaseSnooze(item, now))
        .map((item: Record<string, unknown>) =>
          client.send(
            new UpdateCommand({
              TableName: tableName,
              Key: { id: item.id },
              UpdateExpression: 'SET #status = :status REMOVE SnoozeUntil',
              ExpressionAttributeNames: {
                '#status': 'Status',
              },
              ExpressionAttributeValues: {
                ':status': 'Pending',
              },
            }),
          ),
        ),
    );

    const payload = {
        items,
        count: result.Count ?? 0,
        scannedCount: result.ScannedCount ?? 0,
        lastEvaluatedKey: result.LastEvaluatedKey ?? null,
    };

    return isHttp ? buildHttpResponse(200, payload) : payload;
  } catch (error) {
    const message = 'Failed to read alerts from DynamoDB.';
    if (isHttp) {
      return buildHttpResponse(500, { message });
    }
    throw new Error(message);
  }
};
