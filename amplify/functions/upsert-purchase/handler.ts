import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import { rejectIfUnauthenticated } from '../shared/cognito-auth';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,authorization',
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

  const trimmed = value.trim();

  // Already stored as DD/MM/YYYY — keep as-is to avoid MM/DD reinterpretation.
  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${day}/${month}/${year}`;
  }

  // HTML date inputs use YYYY-MM-DD; parse components to avoid timezone shifts.
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
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
  const inventoryResult = await client.send(
    new GetCommand({
      TableName: params.inventoryTable,
      Key: { id: params.itemId },
    }),
  );
  const inventoryItem = inventoryResult.Item;
  if (!inventoryItem) {
    throw new Error('Inventory item not found.');
  }

  const currentQuantity = Number(inventoryItem.Quantity ?? 0) || 0;
  const nextQuantity = currentQuantity + params.units;
  const rebuyQty = Number(inventoryItem.rebuyQty ?? 0) || 0;
  const nextStatus = computeInventoryStatus(nextQuantity, rebuyQty);
  const unitPriceValue =
    params.units > 0 ? params.totalPrice / params.units : 0;

  await client.send(
    new UpdateCommand({
      TableName: params.inventoryTable,
      Key: { id: params.itemId },
      UpdateExpression:
        'SET #quantity = :quantity, #status = :status, #unitPrice = :unitPrice, #lastUpdated = :lastUpdated',
      ConditionExpression:
        'attribute_exists(id) AND (attribute_not_exists(#quantity) OR #quantity = :currentQuantity)',
      ExpressionAttributeNames: {
        '#quantity': 'Quantity',
        '#status': 'Status',
        '#unitPrice': 'unitPrice',
        '#lastUpdated': 'Last updated',
      },
      ExpressionAttributeValues: {
        ':quantity': nextQuantity,
        ':status': nextStatus,
        ':unitPrice': unitPriceValue,
        ':lastUpdated': formatDateForStorage(),
        ':currentQuantity': currentQuantity,
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
  headers?: Record<string, string | string[] | undefined>;
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
    let previousStatus = '';
    if (payload.id?.trim()) {
      const existingPurchase = await client.send(
        new GetCommand({
          TableName: tableName,
          Key: { id },
        }),
      );
      previousStatus =
        typeof existingPurchase.Item?.Status === 'string'
          ? existingPurchase.Item.Status
          : '';
    }

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    const shouldUpdateInventory =
      statusValue === 'Confirmed' && previousStatus !== 'Confirmed';
    if (shouldUpdateInventory) {
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

    const isUpdate = Boolean(payload.id?.trim());
    const purchaseName = String(itemName).trim();
    await recordActivityLog(event, {
      feature: LOG_FEATURES.PURCHASES,
      action: statusValue === 'Confirmed' ? 'confirm' : isUpdate ? 'update' : 'create',
      entityId: id,
      entityName: purchaseName,
      summary:
        statusValue === 'Confirmed'
          ? `confirmed delivery of ${quoted(purchaseName)} (${Number(units) || 0} units)`
          : isUpdate
            ? `updated purchase of ${quoted(purchaseName)}`
            : `created a purchase of ${Number(units) || 0} units of ${quoted(purchaseName)}`,
    });

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
