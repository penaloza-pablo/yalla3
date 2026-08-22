import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as XLSX from 'xlsx';
import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import { getActorEmail, rejectIfUnauthenticated } from '../shared/cognito-auth';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  parseBody,
} from '../shared/dynamo-http';
import { resolveLocationKey, SPOT_CHECK_PK } from '../shared/spot-check';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3Client = new S3Client({});

type SpotCheckItemPayload = {
  id?: string;
  quantity?: number;
};

type SpotCheckPayload = {
  location?: string;
  categories?: string[];
  items?: SpotCheckItemPayload[];
};

type InventorySnapshot = {
  id: string;
  name: string;
  category: string;
  location: string;
  previousQuantity: number;
  quantity: number;
  previousStatus: string;
  status: string;
  changed: boolean;
};

const formatDateForStorage = () => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${now.getFullYear()}`;
};

const formatDateStamp = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
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

const toCellValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return JSON.stringify(value);
};

const buildXlsxBuffer = (rows: InventorySnapshot[]) => {
  const columns = [
    { key: 'id', label: 'id' },
    { key: 'name', label: 'Item name' },
    { key: 'category', label: 'category' },
    { key: 'location', label: 'Location' },
    { key: 'previousQuantity', label: 'previousQuantity' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'previousStatus', label: 'previousStatus' },
    { key: 'status', label: 'Status' },
    { key: 'changed', label: 'changed' },
  ] as const;

  const data = rows.map((item) => {
    const row: Record<string, string | number> = {};
    columns.forEach((column) => {
      row[column.label] = toCellValue(item[column.key]);
    });
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(data, {
    header: columns.map((column) => column.label),
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Spot check');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

const runInBatches = async <T>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<void>,
) => {
  for (let index = 0; index < items.length; index += size) {
    const batch = items.slice(index, index + size);
    await Promise.all(batch.map((item) => worker(item)));
  }
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
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

  const inventoryTable = process.env.INVENTORY_TABLE;
  const tableName = process.env.TABLE_NAME;
  const bucketName = process.env.BUCKET_NAME;
  const prefix = process.env.BUCKET_PREFIX ?? 'inventory/';

  if (!inventoryTable || !tableName || !bucketName) {
    return buildHttpResponse(500, {
      message: 'Spot check tables or bucket are not configured.',
    });
  }

  const payload = parseBody<SpotCheckPayload>(event.body);
  const location = payload?.location?.trim() ?? '';
  const categories = Array.isArray(payload?.categories)
    ? payload.categories.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const incomingItems = Array.isArray(payload?.items) ? payload.items : [];

  if (!location) {
    return buildHttpResponse(400, { message: 'Location is required.' });
  }
  if (categories.length === 0) {
    return buildHttpResponse(400, { message: 'At least one category is required.' });
  }
  if (incomingItems.length === 0) {
    return buildHttpResponse(400, { message: 'At least one confirmed item is required.' });
  }
  if (incomingItems.length > 300) {
    return buildHttpResponse(400, { message: 'Too many items in this spot check.' });
  }

  const uniqueItems = new Map<string, number>();
  for (const entry of incomingItems) {
    const id = entry.id?.trim();
    const quantity = Number(entry.quantity);
    if (!id || !Number.isFinite(quantity) || quantity < 0) {
      return buildHttpResponse(400, {
        message: 'Each item needs a valid id and quantity.',
      });
    }
    uniqueItems.set(id, Math.trunc(quantity));
  }

  try {
    const snapshots: InventorySnapshot[] = [];
    for (const [itemId, quantity] of uniqueItems.entries()) {
      const result = await client.send(
        new GetCommand({
          TableName: inventoryTable,
          Key: { id: itemId },
        }),
      );
      const inventoryItem = result.Item;
      if (!inventoryItem) {
        return buildHttpResponse(400, {
          message: `Inventory item ${itemId} was not found.`,
        });
      }
      const itemLocation =
        typeof inventoryItem.Location === 'string' ? inventoryItem.Location : '';
      const itemCategory =
        typeof inventoryItem.category === 'string' ? inventoryItem.category : '';
      if (itemLocation !== location || !categories.includes(itemCategory)) {
        return buildHttpResponse(400, {
          message: `Inventory item ${itemId} does not match the selected location and categories.`,
        });
      }

      const previousQuantity = Number(inventoryItem.Quantity ?? 0) || 0;
      const rebuyQty = Number(inventoryItem.rebuyQty ?? 0) || 0;
      const previousStatus =
        typeof inventoryItem.Status === 'string' ? inventoryItem.Status : '';
      const nextStatus =
        previousStatus === 'Waiting Delivery'
          ? 'Waiting Delivery'
          : computeInventoryStatus(quantity, rebuyQty);

      snapshots.push({
        id: itemId,
        name:
          typeof inventoryItem['Item name'] === 'string'
            ? inventoryItem['Item name']
            : itemId,
        category: itemCategory,
        location: itemLocation,
        previousQuantity,
        quantity,
        previousStatus,
        status: nextStatus,
        changed: previousQuantity !== quantity,
      });
    }

    const timestamp = formatDateStamp(new Date());
    const locationKey = resolveLocationKey(location);
    const fileName = `inventory-spot-check-${locationKey.toLowerCase()}-${timestamp}.xlsx`;
    const s3Key = `${prefix}${fileName}`;
    const body = buildXlsxBuffer(snapshots);

    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: body,
        ContentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );

    const lastUpdated = formatDateForStorage();
    await runInBatches(snapshots, 8, async (snapshot) => {
      await client.send(
        new UpdateCommand({
          TableName: inventoryTable,
          Key: { id: snapshot.id },
          UpdateExpression:
            'SET #quantity = :quantity, #status = :status, #lastUpdated = :lastUpdated',
          ConditionExpression: 'attribute_exists(id)',
          ExpressionAttributeNames: {
            '#quantity': 'Quantity',
            '#status': 'Status',
            '#lastUpdated': 'Last updated',
          },
          ExpressionAttributeValues: {
            ':quantity': snapshot.quantity,
            ':status': snapshot.status,
            ':lastUpdated': lastUpdated,
          },
        }),
      );
    });

    const createdAt = new Date().toISOString();
    const id = `SPOT-${crypto.randomUUID()}`;
    const changedCount = snapshots.filter((item) => item.changed).length;
    const userEmail = await getActorEmail(event);
    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          pk: SPOT_CHECK_PK,
          sk: `${createdAt}#${id}`,
          id,
          location,
          locationKey,
          categories,
          userEmail,
          itemCount: snapshots.length,
          changedCount,
          createdAt,
          s3Key,
          items: snapshots.map((item) => ({
            id: item.id,
            name: item.name,
            previousQuantity: item.previousQuantity,
            quantity: item.quantity,
            changed: item.changed,
          })),
        },
      }),
    );

    await recordActivityLog(event, {
      feature: LOG_FEATURES.INVENTORY,
      action: 'spot_check',
      entityId: id,
      entityName: location,
      userEmail,
      summary: `completed a spot check at ${quoted(location)} (${snapshots.length} items checked, ${changedCount} quantities updated)`,
    });

    return buildHttpResponse(200, {
      item: {
        id,
        location,
        locationKey,
        createdAt,
        itemCount: snapshots.length,
        changedCount,
        s3Key,
      },
    });
  } catch (error) {
    console.error('CompleteSpotCheck failed', error);
    return buildHttpResponse(500, {
      message: 'Failed to complete the spot check.',
    });
  }
};
