import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST,PUT,OPTIONS',
};

type AlertPayload = {
  id?: string;
  name?: string;
  description?: string;
  date?: string;
  status?: 'Pending' | 'Snoozed' | 'Done';
  origin?: string;
  createdBy?: string;
  snoozeUntil?: string;
};

const parseBody = (body?: string) => {
  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body) as AlertPayload;
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

const formatAlertDate = (value?: string) => {
  const now = new Date();
  const format = (date: Date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year}, ${hours}:${minutes}`;
  };

  if (!value) {
    return format(now);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return format(parsed);
};

const validateSnoozeUntil = (status?: AlertPayload['status'], value?: string) => {
  if (status !== 'Snoozed') {
    return;
  }
  if (!value) {
    throw new Error('snoozeUntil is required.');
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error('snoozeUntil must be a valid ISO date.');
  }
  if (parsed <= Date.now()) {
    throw new Error('snoozeUntil must be in the future.');
  }
};

const getNextAlertId = async (tableName: string) => {
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  let maxValue = 0;

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'id',
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    (result.Items ?? []).forEach((item) => {
      const id = typeof item.id === 'string' ? item.id : '';
      const match = id.match(/^ALM-(\d+)$/i);
      if (!match) {
        return;
      }
      const value = Number(match[1]);
      if (Number.isFinite(value)) {
        maxValue = Math.max(maxValue, value);
      }
    });
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  const nextValue = String(maxValue + 1).padStart(3, '0');
  return `ALM-${nextValue}`;
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  body?: string;
  arguments?: AlertPayload;
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
  if (!payload?.name) {
    const message = 'name is required.';
    if (isHttp) {
      return buildHttpResponse(400, { message });
    }
    throw new Error(message);
  }

  try {
    validateSnoozeUntil(payload.status, payload.snoozeUntil);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid snoozeUntil.';
    if (isHttp) {
      return buildHttpResponse(400, { message });
    }
    throw error;
  }

  const id = payload.id ? String(payload.id).trim() : await getNextAlertId(tableName);
  const item = {
    id,
    'Name ': payload.name.trim(),
    Description: payload.description?.trim() ?? '',
    Date: formatAlertDate(payload.date),
    Status: payload.status ?? 'Pending',
    Origin: payload.origin?.trim() ?? '',
    'Create by': payload.createdBy?.trim() ?? 'system',
    SnoozeUntil: payload.snoozeUntil,
  };

  try {
    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    const response = { item };
    return isHttp ? buildHttpResponse(200, response) : response;
  } catch (error) {
    const message = 'Failed to save alert.';
    if (isHttp) {
      return buildHttpResponse(500, { message });
    }
    throw new Error(message);
  }
};
