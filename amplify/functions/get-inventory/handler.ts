import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

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

type InventoryQueryArgs = {
  limit?: number;
  status?: string;
  location?: string;
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

const buildScanFilters = (args: InventoryQueryArgs) => {
  const filters: string[] = [];
  const expressionValues: Record<string, unknown> = {};
  const expressionNames: Record<string, string> = {};

  if (args.status) {
    filters.push('#status = :status');
    expressionNames['#status'] = 'Status';
    expressionValues[':status'] = args.status;
  }

  if (args.location) {
    filters.push('#location = :location');
    expressionNames['#location'] = 'Location';
    expressionValues[':location'] = args.location;
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
  arguments?: InventoryQueryArgs;
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
        location: event.queryStringParameters?.location,
      }
    : {
        limit: event.arguments?.limit,
        status: event.arguments?.status,
        location: event.arguments?.location,
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
    const payload = {
        items: result.Items ?? [],
        count: result.Count ?? 0,
        scannedCount: result.ScannedCount ?? 0,
        lastEvaluatedKey: result.LastEvaluatedKey ?? null,
    };

    return isHttp ? buildHttpResponse(200, payload) : payload;
  } catch (error) {
    console.error('GetInventory failed', {
      tableName,
      error,
    });
    const message = 'Failed to read inventory from DynamoDB.';
    if (isHttp) {
      return buildHttpResponse(500, {
        message,
        details: error instanceof Error ? error.message : String(error),
      });
    }
    throw new Error(message);
  }
};
