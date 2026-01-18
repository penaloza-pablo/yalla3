import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

type UpdatePayload = {
  id?: string;
  status?: 'Pending' | 'Snoozed' | 'Done';
  snoozeUntil?: string;
};

const parseBody = (body?: string) => {
  if (!body) {
    return null;
  }
  try {
    return JSON.parse(body) as UpdatePayload;
  } catch {
    return null;
  }
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  body?: string;
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

  const payload = parseBody(event.body);
  if (!payload?.id || !payload.status) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'id and status are required.' }),
    };
  }

  const snoozeUntil =
    payload.status === 'Snoozed' ? payload.snoozeUntil : undefined;

  if (payload.status === 'Snoozed') {
    if (!snoozeUntil) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'snoozeUntil is required.' }),
      };
    }
    const parsed = Date.parse(snoozeUntil);
    if (Number.isNaN(parsed)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'snoozeUntil must be a valid ISO date.' }),
      };
    }
    if (parsed <= Date.now()) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ message: 'snoozeUntil must be in the future.' }),
      };
    }
  }

  const updateExpression =
    payload.status === 'Snoozed'
      ? 'SET #status = :status, SnoozeUntil = :snoozeUntil'
      : 'SET #status = :status REMOVE SnoozeUntil';

  const expressionValues =
    payload.status === 'Snoozed'
      ? { ':status': payload.status, ':snoozeUntil': snoozeUntil }
      : { ':status': payload.status };

  try {
    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: payload.id },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: {
          '#status': 'Status',
        },
        ExpressionAttributeValues: expressionValues,
      }),
    );

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: payload.id,
        status: payload.status,
        snoozeUntil,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Failed to update alert status.',
      }),
    };
  }
};
