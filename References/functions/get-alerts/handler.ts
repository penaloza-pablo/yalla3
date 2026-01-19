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
    const items = result.Items ?? [];
    const now = Date.now();

    await Promise.all(
      items
        .filter((item) => shouldReleaseSnooze(item, now))
        .map((item) =>
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

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        items,
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
        message: 'Failed to read alerts from DynamoDB.',
      }),
    };
  }
};
