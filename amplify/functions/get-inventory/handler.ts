import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { rejectIfUnauthenticated } from '../shared/cognito-auth';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

type InventoryQueryArgs = {
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

  const args = isHttp
    ? {
        status: event.queryStringParameters?.status,
        location: event.queryStringParameters?.location,
      }
    : {
        status: event.arguments?.status,
        location: event.arguments?.location,
    };

  const filters = buildScanFilters(args);

  try {
    const items: Record<string, unknown>[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;
    let scannedCount = 0;

    do {
      const command = new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastEvaluatedKey,
        ...filters,
      });

      const result = await client.send(command);
      const resultItems = result.Items ?? [];
      items.push(...resultItems);
      scannedCount += result.ScannedCount ?? 0;
      lastEvaluatedKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (lastEvaluatedKey);

    const payload = {
      items,
      count: items.length,
      scannedCount,
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
