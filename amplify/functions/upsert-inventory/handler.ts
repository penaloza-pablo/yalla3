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

const computeInventoryStatus = (quantity: number, rebuyQty: number) => {
  if (quantity <= rebuyQty) {
    return 'Reorder';
  }
  const okThreshold = Math.floor(rebuyQty * 1.25);
  if (quantity >= okThreshold) {
    return 'OK';
  }
  return 'Low Stock';
};

type InventoryPayload = {
  id?: string;
  name?: string;
  category?: string;
  location?: string;
  status?: string;
  quantity?: number;
  updated?: string;
  rebuyQty?: number;
  unitPrice?: number;
  tolerance?: number;
  consumptionRulesJson?: string;
  consumptionRules?: Record<string, unknown>;
  ['Item name']?: string;
  Category?: string;
  Location?: string;
  Status?: string;
  Quantity?: number;
  ['Last updated']?: string;
  Tolerance?: number;
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

const parseConsumptionRules = (payload: InventoryPayload) => {
  if (payload.consumptionRules) {
    return payload.consumptionRules;
  }

  if (payload.consumptionRulesJson) {
    try {
      const parsed = JSON.parse(payload.consumptionRulesJson) as Record<
        string,
        unknown
      >;
      return parsed;
    } catch {
      return undefined;
    }
  }

  return undefined;
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  body?: string;
  arguments?: InventoryPayload;
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
  if (!payload?.id) {
    const message = 'Item id is required.';
    if (isHttp) {
      return buildHttpResponse(400, { message });
    }
    throw new Error(message);
  }

  const name = payload.name ?? payload['Item name'];
  const category = payload.category ?? payload.Category;
  const location = payload.location ?? payload.Location;
  const status = payload.status ?? payload.Status;
  const quantity = payload.quantity ?? payload.Quantity;
  const updated = payload.updated ?? payload['Last updated'];
  const tolerance = payload.tolerance ?? payload.Tolerance;
  const trimmedCategory = category?.trim();
  const quantityValue = Number(quantity) || 0;
  const rebuyQtyValue = Number(payload.rebuyQty) || 0;
  const statusValue = status?.trim() || computeInventoryStatus(quantityValue, rebuyQtyValue);

  const item = {
    id: String(payload.id).trim(),
    'Item name': name?.trim() ?? '',
    category: trimmedCategory || undefined,
    Location: location?.trim() ?? '',
    Status: statusValue,
    Quantity: quantityValue,
    'Last updated': formatDateForStorage(updated),
    rebuyQty: rebuyQtyValue,
    unitPrice: Number(payload.unitPrice) || 0,
    Tolerance: Number(tolerance) || 0,
    consumptionRules: parseConsumptionRules(payload),
  };

  if (!item['Item name']) {
    const message = 'Item name is required.';
    if (isHttp) {
      return buildHttpResponse(400, { message });
    }
    throw new Error(message);
  }

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
    const message = 'Failed to save inventory item.';
    if (isHttp) {
      return buildHttpResponse(500, { message });
    }
    throw new Error(message);
  }
};
