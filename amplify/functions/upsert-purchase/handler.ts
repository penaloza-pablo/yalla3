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
  direct?: boolean;
  Direct?: boolean;
  propertyId?: string;
  cost?: number;
  Cost?: number;
  billable?: boolean;
  Billable?: boolean;
  markup?: boolean;
  markupApplied?: boolean;
  note?: string;
  Note?: string;
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
  ['Property id']?: string;
  ['Property ID']?: string;
  ['Markup applied']?: boolean;
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

const INVENTORY_WAITING_DELIVERY = 'Waiting Delivery';
const PURCHASE_CONFIRMED = 'Confirmed';
const PURCHASE_WAITING_INVOICE = 'Waiting invoice';

const normalizePurchaseStatus = (value?: string) => value?.trim() ?? '';

const isReceivedPurchaseStatus = (value?: string) => {
  const status = normalizePurchaseStatus(value);
  return status === PURCHASE_CONFIRMED || status === PURCHASE_WAITING_INVOICE;
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

const hasOpenPurchasesForItem = async (params: {
  purchasesTable: string;
  itemId: string;
  excludePurchaseId?: string;
}) => {
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(
      new ScanCommand({
        TableName: params.purchasesTable,
        FilterExpression:
          '#itemId = :itemId AND #status <> :confirmed AND #status <> :waitingInvoice AND (attribute_not_exists(#direct) OR #direct = :notDirect)',
        ExpressionAttributeNames: {
          '#itemId': 'Item id',
          '#status': 'Status',
          '#direct': 'Direct',
        },
        ExpressionAttributeValues: {
          ':itemId': params.itemId,
          ':confirmed': PURCHASE_CONFIRMED,
          ':waitingInvoice': PURCHASE_WAITING_INVOICE,
          ':notDirect': false,
        },
        ProjectionExpression: 'id',
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    const hasOther = (result.Items ?? []).some((entry) => {
      const id = typeof entry.id === 'string' ? entry.id : '';
      if (!id) {
        return false;
      }
      if (params.excludePurchaseId && id === params.excludePurchaseId) {
        return false;
      }
      return true;
    });
    if (hasOther) {
      return true;
    }
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);
  return false;
};

const markInventoryWaitingDelivery = async (params: {
  inventoryTable: string;
  itemId: string;
}) => {
  await client.send(
    new UpdateCommand({
      TableName: params.inventoryTable,
      Key: { id: params.itemId },
      UpdateExpression: 'SET #status = :status, #lastUpdated = :lastUpdated',
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeNames: {
        '#status': 'Status',
        '#lastUpdated': 'Last updated',
      },
      ExpressionAttributeValues: {
        ':status': INVENTORY_WAITING_DELIVERY,
        ':lastUpdated': formatDateForStorage(),
      },
    }),
  );
};

const parseDirect = (payload: PurchasePayload, existing?: Record<string, unknown>) => {
  if (typeof payload.Direct === 'boolean') {
    return payload.Direct;
  }
  if (typeof payload.direct === 'boolean') {
    return payload.direct;
  }
  return existing?.Direct === true;
};

const parseBillable = (payload: PurchasePayload) => {
  if (typeof payload.billable === 'boolean') {
    return payload.billable;
  }
  if (typeof payload.Billable === 'boolean') {
    return payload.Billable;
  }
  return true;
};

const parseMarkupApplied = (payload: PurchasePayload) => {
  if (typeof payload.markupApplied === 'boolean') {
    return payload.markupApplied;
  }
  if (typeof payload.markup === 'boolean') {
    return payload.markup;
  }
  if (typeof payload['Markup applied'] === 'boolean') {
    return payload['Markup applied'];
  }
  return false;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const computeDirectPurchasePricing = (
  costInclIva: number,
  markupApplied: boolean,
) => {
  const safeCost = Number.isFinite(costInclIva) ? Math.max(0, costInclIva) : 0;
  const markup = markupApplied ? roundMoney(safeCost * 0.12) : 0;
  const ivaMarkup = roundMoney(markup * 0.21);
  const totalPrice = roundMoney(safeCost + markup + ivaMarkup);
  const priceExclIva = roundMoney(totalPrice / 1.21);
  const iva = roundMoney(priceExclIva * 0.21);
  return { markup, ivaMarkup, priceExclIva, iva, totalPrice };
};

const computePurchaseStatus = (deliveryDateValue: string, currentStatus?: string) => {
  const status = normalizePurchaseStatus(currentStatus);
  if (status.toLowerCase() === PURCHASE_CONFIRMED.toLowerCase()) {
    return PURCHASE_CONFIRMED;
  }
  if (status.toLowerCase() === PURCHASE_WAITING_INVOICE.toLowerCase()) {
    return PURCHASE_WAITING_INVOICE;
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
  purchasesTable: string;
  purchaseId: string;
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
  const hasOtherOpenPurchases = await hasOpenPurchasesForItem({
    purchasesTable: params.purchasesTable,
    itemId: params.itemId,
    excludePurchaseId: params.purchaseId,
  });
  const nextStatus = hasOtherOpenPurchases
    ? INVENTORY_WAITING_DELIVERY
    : computeInventoryStatus(nextQuantity, rebuyQty);
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

  const id = payload.id?.trim() || (await getNextPurchaseId(tableName));
  let existingItem: Record<string, unknown> | undefined;
  let previousStatus = '';
  if (payload.id?.trim()) {
    const existingPurchase = await client.send(
      new GetCommand({
        TableName: tableName,
        Key: { id },
      }),
    );
    existingItem = existingPurchase.Item as Record<string, unknown> | undefined;
    previousStatus =
      typeof existingItem?.Status === 'string' ? existingItem.Status : '';
  }

  const isDirect = parseDirect(payload, existingItem);
  const itemId = payload.itemId ?? payload['Item id'] ?? payload['Item ID'];
  const itemName = payload.itemName ?? payload['Item name'];
  const location = payload.location ?? payload.Location;
  const vendor = payload.vendor ?? payload.Vendor;
  const units = payload.units ?? payload.Units;
  const totalPrice = payload.totalPrice ?? payload['Total price'];
  const deliveryDate = payload.deliveryDate ?? payload['Delivery date'];
  const purchaseDate = payload.purchaseDate ?? payload['Purchase date'];
  const status = payload.status ?? payload.Status;
  const propertyId =
    payload.propertyId ?? payload['Property id'] ?? payload['Property ID'];
  const cost = payload.cost ?? payload.Cost;
  const note = payload.note ?? payload.Note;

  const fail = (message: string) => {
    if (isHttp) {
      return buildHttpResponse(400, { message });
    }
    throw new Error(message);
  };

  if (!isDirect && (!itemId || !String(itemId).trim())) {
    return fail('Item id is required.');
  }
  if (!itemName || !String(itemName).trim()) {
    return fail('Item name is required.');
  }
  if (!location || !String(location).trim()) {
    return fail('Location is required.');
  }
  if (!vendor || !String(vendor).trim()) {
    return fail('Vendor is required.');
  }
  if (units === undefined || units === null || Number.isNaN(Number(units))) {
    return fail('Units are required.');
  }
  if (isDirect && (!propertyId || !String(propertyId).trim())) {
    return fail('Property id is required.');
  }
  if (
    isDirect &&
    (cost === undefined || cost === null || Number.isNaN(Number(cost)))
  ) {
    return fail('Cost is required.');
  }
  if (
    !isDirect &&
    (totalPrice === undefined ||
      totalPrice === null ||
      Number.isNaN(Number(totalPrice)))
  ) {
    return fail('Total price is required.');
  }
  if (!deliveryDate || !String(deliveryDate).trim()) {
    return fail('Delivery date is required.');
  }

  const deliveryDateValue = formatDateForStorage(String(deliveryDate));
  const statusValue = computePurchaseStatus(deliveryDateValue, status);
  const markupApplied = isDirect
    ? parseMarkupApplied(payload)
    : Boolean(existingItem?.['Markup applied']);
  const billable = isDirect ? parseBillable(payload) : Boolean(existingItem?.Billable);
  const costValue = Number(cost) || 0;
  const pricing = computeDirectPurchasePricing(costValue, markupApplied);
  const totalPriceValue = isDirect ? pricing.totalPrice : Number(totalPrice) || 0;

  const item: Record<string, unknown> = {
    ...(existingItem ?? {}),
    id,
    Direct: isDirect,
    'Item id': isDirect ? '' : String(itemId).trim(),
    'Item name': String(itemName).trim(),
    Location: String(location).trim(),
    Vendor: String(vendor).trim(),
    Units: Number(units) || 0,
    'Total price': totalPriceValue,
    'Delivery date': deliveryDateValue,
    'Purchase date': formatDateForStorage(purchaseDate),
    Status: statusValue,
  };

  if (isDirect) {
    item['Property id'] = String(propertyId).trim();
    item.Cost = costValue;
    item.Billable = billable;
    item['Markup applied'] = markupApplied;
    item.Markup = pricing.markup;
    item['IVA Markup'] = pricing.ivaMarkup;
    item['Price excl. IVA'] = pricing.priceExclIva;
    item.IVA = pricing.iva;
    item.Note = typeof note === 'string' ? note.trim() : '';
  }

  try {
    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    const inventoryTable = process.env.INVENTORY_TABLE;
    const becameReceived =
      isReceivedPurchaseStatus(statusValue) &&
      !isReceivedPurchaseStatus(previousStatus);
    if (!isDirect) {
      if (becameReceived) {
        if (!inventoryTable) {
          throw new Error('INVENTORY_TABLE is not configured.');
        }
        await updateInventoryOnConfirm({
          inventoryTable,
          purchasesTable: tableName,
          purchaseId: id,
          itemId: String(itemId).trim(),
          units: Number(units) || 0,
          totalPrice: totalPriceValue,
        });
      } else if (!isReceivedPurchaseStatus(statusValue)) {
        if (!inventoryTable) {
          throw new Error('INVENTORY_TABLE is not configured.');
        }
        await markInventoryWaitingDelivery({
          inventoryTable,
          itemId: String(itemId).trim(),
        });
      }
    }

    const isUpdate = Boolean(payload.id?.trim());
    const purchaseName = String(itemName).trim();
    const becameConfirmed =
      statusValue === PURCHASE_CONFIRMED && previousStatus !== PURCHASE_CONFIRMED;
    await recordActivityLog(event, {
      feature: LOG_FEATURES.PURCHASES,
      action: becameConfirmed
        ? 'confirm'
        : becameReceived
          ? 'receive'
          : isUpdate
            ? 'update'
            : 'create',
      entityId: id,
      entityName: purchaseName,
      summary: becameConfirmed
        ? `confirmed invoice for ${quoted(purchaseName)}`
        : becameReceived
          ? `received ${quoted(purchaseName)} (${Number(units) || 0} units), waiting invoice`
          : isUpdate
            ? `updated purchase of ${quoted(purchaseName)}`
            : isDirect
              ? `created a direct purchase of ${quoted(purchaseName)}`
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
