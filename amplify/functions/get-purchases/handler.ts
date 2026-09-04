import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { rejectIfUnauthenticated } from '../shared/cognito-auth';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

const NEWEST_LIST_MIN = 100;
const PURCHASE_CONFIRMED = 'Confirmed';
const PURCHASE_WAITING_INVOICE = 'Waiting invoice';
const PURCHASE_WAITING_DELIVERY = 'Waiting Delivery';
const PURCHASE_EXCLUDED = 'Excluded';
const ACTIVE_STATUSES = new Set([
  'To be confirmed',
  PURCHASE_WAITING_DELIVERY,
  PURCHASE_WAITING_INVOICE,
]);

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

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

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
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const itemStatus = (item: Record<string, unknown>) => asString(item.Status);

const isExcludedItem = (item: Record<string, unknown>) =>
  item.Excluded === true || itemStatus(item) === PURCHASE_EXCLUDED;

const isPendingItem = (item: Record<string, unknown>) => {
  if (isExcludedItem(item)) {
    return false;
  }
  const status = itemStatus(item);
  return (
    status === PURCHASE_WAITING_DELIVERY || status === PURCHASE_WAITING_INVOICE
  );
};

const isActiveItem = (item: Record<string, unknown>) =>
  !isExcludedItem(item) && ACTIVE_STATUSES.has(itemStatus(item));

const purchaseIdNumber = (id: string) => {
  const match = id.match(/(\d+)$/);
  return match ? Number(match[1]) : 0;
};

const purchaseSortTime = (item: Record<string, unknown>) => {
  const purchaseDate = parseDateOnly(asString(item['Purchase date']));
  if (purchaseDate) {
    return purchaseDate.getTime();
  }
  const deliveryDate = parseDateOnly(asString(item['Delivery date']));
  return deliveryDate?.getTime() ?? 0;
};

const selectPurchasesForList = (items: Record<string, unknown>[]) => {
  const ranked = items
    .map((item, index) => ({
      item,
      index,
      time: purchaseSortTime(item),
      idNumber: purchaseIdNumber(asString(item.id)),
    }))
    .sort((left, right) => {
      if (left.time !== right.time) {
        return right.time - left.time;
      }
      if (left.idNumber !== right.idNumber) {
        return right.idNumber - left.idNumber;
      }
      return left.index - right.index;
    });

  const selected = new Map<string, Record<string, unknown>>();
  for (const entry of ranked.slice(0, NEWEST_LIST_MIN)) {
    const id = asString(entry.item.id) || `row-${entry.index}`;
    selected.set(id, entry.item);
  }
  for (const item of items) {
    if (!isActiveItem(item)) {
      continue;
    }
    const id = asString(item.id);
    if (!id) {
      continue;
    }
    selected.set(id, item);
  }
  return Array.from(selected.values());
};

const buildSummary = (items: Record<string, unknown>[]) => {
  let pending = 0;
  let waitingDelivery = 0;
  let waitingInvoice = 0;
  let toBeConfirmed = 0;
  let confirmed = 0;
  let excluded = 0;

  for (const item of items) {
    if (isExcludedItem(item)) {
      excluded += 1;
      continue;
    }
    const status = itemStatus(item);
    if (status === PURCHASE_WAITING_DELIVERY) {
      waitingDelivery += 1;
      pending += 1;
    } else if (status === PURCHASE_WAITING_INVOICE) {
      waitingInvoice += 1;
      pending += 1;
    } else if (status === PURCHASE_CONFIRMED) {
      confirmed += 1;
    } else if (status === 'To be confirmed') {
      toBeConfirmed += 1;
    }
  }

  return {
    total: items.length,
    pending,
    waitingDelivery,
    waitingInvoice,
    toBeConfirmed,
    confirmed,
    excluded,
  };
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
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

  try {
    const items: Record<string, unknown>[] = [];
    let lastEvaluatedKey: Record<string, unknown> | undefined;
    let scannedCount = 0;

    do {
      const result = await client.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: lastEvaluatedKey,
        }),
      );
      items.push(...((result.Items as Record<string, unknown>[]) ?? []));
      scannedCount += result.ScannedCount ?? 0;
      lastEvaluatedKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (lastEvaluatedKey);

    const summary = buildSummary(items);
    const listedItems = selectPurchasesForList(items);
    const payload = {
      items: listedItems,
      count: listedItems.length,
      scannedCount,
      summary,
    };
    return isHttp ? buildHttpResponse(200, payload) : payload;
  } catch (error) {
    console.error('GetPurchases failed', {
      tableName,
      error,
    });
    const message = 'Failed to read purchases from DynamoDB.';
    if (isHttp) {
      return buildHttpResponse(500, {
        message,
        details: error instanceof Error ? error.message : String(error),
      });
    }
    throw new Error(message);
  }
};
