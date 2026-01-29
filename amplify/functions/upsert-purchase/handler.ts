import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST,PUT,OPTIONS',
};

type PurchasePayload = {
  id?: string;
  itemId?: string;
  itemName?: string;
  location?: string;
  vendor?: string;
  units?: number;
  totalPrice?: number;
  deliveryDate?: string;
  purchaseDate?: string;
  status?: string;
  ['Item id']?: string;
  ['Item ID']?: string;
  ['Item name']?: string;
  Location?: string;
  Vendor?: string;
  Units?: number;
  ['Total price']?: number;
  ['Delivery date']?: string;
  ['Purchase date']?: string;
  Status?: string;
};

const parseBody = (body?: string) => {
  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body) as PurchasePayload;
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

const parseDateOnly = (value?: string) => {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const computePurchaseStatus = (deliveryDateValue: string, currentStatus?: string) => {
  if (currentStatus?.trim().toLowerCase() === 'confirmed') {
    return 'Confirmed';
  }
  const deliveryDate = parseDateOnly(deliveryDateValue);
  if (!deliveryDate) {
    return 'To be confirmed';
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (deliveryDate.getTime() > today.getTime()) {
    return 'Waiting Delivery';
  }
  return 'To be confirmed';
};

const updateInventoryOnConfirm = async (params: {
  inventoryTable: string;
  itemId: string;
  units: number;
  totalPrice: number;
}) => {
  const unitPriceValue =
    params.units > 0 ? params.totalPrice / params.units : 0;
  await client.send(
    new UpdateCommand({
      TableName: params.inventoryTable,
      Key: { id: params.itemId },
      UpdateExpression:
        'SET #quantity = if_not_exists(#quantity, :zero) + :units, #unitPrice = :unitPrice, #lastUpdated = :lastUpdated',
      ExpressionAttributeNames: {
        '#quantity': 'Quantity',
        '#unitPrice': 'unitPrice',
        '#lastUpdated': 'Last updated',
      },
      ExpressionAttributeValues: {
        ':zero': 0,
        ':units': params.units,
        ':unitPrice': unitPriceValue,
        ':lastUpdated': formatDateForStorage(),
      },
    }),
  );
};

const getNextPurchaseId = async (tableName: string) => {
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
    (result.Items ?? []).forEach((entry) => {
      const id = typeof entry.id === 'string' ? entry.id : '';
      const match = id.match(/^PURCH-(\d+)$/i);
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
  return `PURCH-${nextValue}`;
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  body?: string;
  arguments?: PurchasePayload;
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
  if (!payload) {
    const message = 'Payload is required.';
    if (isHttp) {
      return buildHttpResponse(400, { message });
    }
    throw new Error(message);
  }

  const itemId = payload.itemId ?? payload['Item id'] ?? payload['Item ID'];
  const itemName = payload.itemName ?? payload['Item name'];
  const location = payload.location ?? payload.Location;
  const vendor = payload.vendor ?? payload.Vendor;
  const units = payload.units ?? payload.Units;
  const totalPrice = payload.totalPrice ?? payload['Total price'];
  const deliveryDate = payload.deliveryDate ?? payload['Delivery date'];
  const purchaseDate = payload.purchaseDate ?? payload['Purchase date'];
  const status = payload.status ?? payload.Status;

  if (!itemId || !String(itemId).trim()) {
    const message = 'Item id is required.';
    if (isHttp) {
      return buildHttpResponse(400, { message });
    }
    throw new Error(message);
  }
  if (!itemName || !String(itemName).trim()) {
    const message = 'Item name is required.';
    if (isHttp) {
      return buildHttpResponse(400, { message });
    }
    throw new Error(message);
  }
  if (!location || !String(location).trim()) {
    const message = 'Location is required.';
    if (isHttp) {
      return buildHttpResponse(400, { message });
    }
    throw new Error(message);
  }
  if (!vendor || !String(vendor).trim()) {
    const message = 'Vendor is required.';
    if (isHttp) {
      return buildHttpResponse(400, { message });
    }
    throw new Error(message);
  }
  if (units === undefined || units === null || Number.isNaN(Number(units))) {
    const message = 'Units are required.';
    if (isHttp) {
      return buildHttpResponse(400, { message });
    }
    throw new Error(message);
  }
  if (
    totalPrice === undefined ||
    totalPrice === null ||
    Number.isNaN(Number(totalPrice))
  ) {
    const message = 'Total price is required.';
    if (isHttp) {
      return buildHttpResponse(400, { message });
    }
    throw new Error(message);
  }
  if (!deliveryDate || !String(deliveryDate).trim()) {
    const message = 'Delivery date is required.';
    if (isHttp) {
      return buildHttpResponse(400, { message });
    }
    throw new Error(message);
  }

  const id = payload.id?.trim() || (await getNextPurchaseId(tableName));
  const deliveryDateValue = formatDateForStorage(String(deliveryDate));
  const statusValue = computePurchaseStatus(deliveryDateValue, status);
  const item = {
    id,
    'Item id': String(itemId).trim(),
    'Item name': String(itemName).trim(),
    Location: String(location).trim(),
    Vendor: String(vendor).trim(),
    Units: Number(units) || 0,
    'Total price': Number(totalPrice) || 0,
    'Delivery date': deliveryDateValue,
    'Purchase date': formatDateForStorage(purchaseDate),
    Status: statusValue,
  };

  try {
    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    if (statusValue === 'Confirmed') {
      const inventoryTable = process.env.INVENTORY_TABLE;
      if (!inventoryTable) {
        throw new Error('INVENTORY_TABLE is not configured.');
      }
      await updateInventoryOnConfirm({
        inventoryTable,
        itemId: String(itemId).trim(),
        units: Number(units) || 0,
        totalPrice: Number(totalPrice) || 0,
      });
    }

    const response = { item };
    return isHttp ? buildHttpResponse(200, response) : response;
  } catch (error) {
    const message = 'Failed to save purchase.';
    if (isHttp) {
      return buildHttpResponse(500, { message });
    }
    throw new Error(message);
  }
};
