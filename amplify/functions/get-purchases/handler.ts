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
  queryStringParameters?: Record<string, string | undefined>;
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

  const limit = parseLimit(event.queryStringParameters?.limit);

  try {
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        Limit: limit,
      }),
    );
    const payload = {
      items: result.Items ?? [],
      count: result.Count ?? 0,
      scannedCount: result.ScannedCount ?? 0,
      lastEvaluatedKey: result.LastEvaluatedKey ?? null,
    };
    return isHttp ? buildHttpResponse(200, payload) : payload;
  } catch (error) {
    console.error('GetPurchases failed', {
      tableName,
      error,
    });
    const message = 'Failed to read purchases from DynamoDB.';
    if (isHttp) {
      return buildHttpResponse(500, {
        message,
        details: error instanceof Error ? error.message : String(error),
      });
    }
    throw new Error(message);
  }
};
