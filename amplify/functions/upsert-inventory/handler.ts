import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST,PUT,OPTIONS',
};

const formatDateForStorage = (value?: string) => {
  if (!value) {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}/${now.getFullYear()}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${parsed.getFullYear()}`;
};

type InventoryPayload = {
  id?: string;
  ['Item name']?: string;
  Location?: string;
  Status?: string;
  Quantity?: number;
  ['Last updated']?: string;
  rebuyQty?: number;
  unitPrice?: number;
  Tolerance?: number;
  consumptionRules?: Record<string, unknown>;
};

const parseBody = (body?: string) => {
  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body) as InventoryPayload;
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
  if (!payload || !payload.id) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Item id is required.' }),
    };
  }

  const item = {
    id: String(payload.id).trim(),
    'Item name': payload['Item name']?.trim() ?? '',
    Location: payload.Location?.trim() ?? '',
    Status: payload.Status?.trim() ?? '',
    Quantity: Number(payload.Quantity) || 0,
    'Last updated': formatDateForStorage(payload['Last updated']),
    rebuyQty: Number(payload.rebuyQty) || 0,
    unitPrice: Number(payload.unitPrice) || 0,
    Tolerance: Number(payload.Tolerance) || 0,
    consumptionRules: payload.consumptionRules ?? undefined,
  };

  if (!item['Item name']) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ message: 'Item name is required.' }),
    };
  }

  try {
    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ item }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        message: 'Failed to save inventory item.',
      }),
    };
  }
};
