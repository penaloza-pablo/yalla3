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
  body?: string;
  arguments?: UpdatePayload;
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

  const payload = isHttp ? parseBody(event.body) : event.arguments;
  if (!payload?.id || !payload.status) {
    const message = 'id and status are required.';
    if (isHttp) {
      return buildHttpResponse(400, { message });
    }
    throw new Error(message);
  }

  const snoozeUntil =
    payload.status === 'Snoozed' ? payload.snoozeUntil : undefined;

  if (payload.status === 'Snoozed') {
    if (!snoozeUntil) {
      const message = 'snoozeUntil is required.';
      if (isHttp) {
        return buildHttpResponse(400, { message });
      }
      throw new Error(message);
    }
    const parsed = Date.parse(snoozeUntil);
    if (Number.isNaN(parsed)) {
      const message = 'snoozeUntil must be a valid ISO date.';
      if (isHttp) {
        return buildHttpResponse(400, { message });
      }
      throw new Error(message);
    }
    if (parsed <= Date.now()) {
      const message = 'snoozeUntil must be in the future.';
      if (isHttp) {
        return buildHttpResponse(400, { message });
      }
      throw new Error(message);
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

    const response = {
        id: payload.id,
        status: payload.status,
        snoozeUntil,
    };
    return isHttp ? buildHttpResponse(200, response) : response;
  } catch (error) {
    const message = 'Failed to update alert status.';
    if (isHttp) {
      return buildHttpResponse(500, { message });
    }
    throw new Error(message);
  }
};
