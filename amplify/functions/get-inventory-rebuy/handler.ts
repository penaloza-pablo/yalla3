import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

type InventoryRebuyArgs = {
  limit?: number;
  buffer?: number;
  status?: string;
  location?: string;
};

const parseLimit = (value?: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 200;
  }
  return Math.min(Math.trunc(parsed), 500);
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

const buildScanFilters = (args: InventoryRebuyArgs) => {
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
  arguments?: InventoryRebuyArgs;
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
        buffer: event.queryStringParameters?.buffer
          ? Number(event.queryStringParameters.buffer)
          : undefined,
        status: event.queryStringParameters?.status,
        location: event.queryStringParameters?.location,
      }
    : {
        limit: event.arguments?.limit,
        buffer: event.arguments?.buffer,
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
    const items = (result.Items ?? []).map((item) => {
      const quantity = Number(item.Quantity) || 0;
      const rebuyQty = Number(item.rebuyQty) || 0;
      const tolerance = Number(item.Tolerance) || 0;
      const buffer =
        typeof args.buffer === 'number' && Number.isFinite(args.buffer)
          ? args.buffer
          : tolerance;
      const rebuyThreshold = rebuyQty + buffer;
      const rebuyGap = quantity - rebuyQty;

      return {
        id: item.id,
        name: item['Item name'] ?? '',
        category: item.category ?? '',
        location: item.Location ?? '',
        status: item.Status ?? '',
        quantity,
        rebuyQty,
        tolerance,
        rebuyThreshold,
        rebuyGap,
        updated: item['Last updated'] ?? '',
      };
    });

    const nearRebuy = items.filter((item) => item.quantity <= item.rebuyThreshold);

    const payload = {
      items: nearRebuy,
      count: nearRebuy.length,
    };

    return isHttp ? buildHttpResponse(200, payload) : payload;
  } catch (error) {
    const message = 'Failed to read inventory rebuy data.';
    if (isHttp) {
      return buildHttpResponse(500, { message });
    }
    throw new Error(message);
  }
};
