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

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
}) => {
  if (event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
    };
  }

  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'TABLE_NAME is not configured.' }),
    };
  }

  const limit = parseLimit(event.queryStringParameters?.limit);

  try {
    const command = new ScanCommand({
      TableName: tableName,
      Limit: limit,
    });

    const result = await client.send(command);

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        items: result.Items ?? [],
        count: result.Count ?? 0,
        scannedCount: result.ScannedCount ?? 0,
        lastEvaluatedKey: result.LastEvaluatedKey ?? null,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Failed to read inventory from DynamoDB.',
      }),
    };
  }
};
