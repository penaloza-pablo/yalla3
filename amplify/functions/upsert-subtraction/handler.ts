import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
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

const STATUS_PENDING_BILLING = 'Pending Billing';
const STATUS_BILLED = 'Billed';
const STATUS_NOT_BILLABLE = 'Not Billable';
const STATUS_REVERSED = 'Reversed';

type SubtractionPayload = {
  id?: string;
  itemId?: string;
  itemName?: string;
  inventoryLocation?: string;
  propertyId?: string;
  location?: string;
  units?: number;
  cost?: number;
  billable?: boolean;
  note?: string;
  date?: string;
  status?: string;
  action?: string;
  ['Item id']?: string;
  ['Item ID']?: string;
  ['Item name']?: string;
  ['Inventory location']?: string;
  ['Property id']?: string;
  ['Property ID']?: string;
  Location?: string;
  Units?: number;
  Cost?: number;
  Billable?: boolean;
  Note?: string;
  Date?: string;
  Status?: string;
  Action?: string;
};

type SubtractionItem = {
  id: string;
  'Item id': string;
  'Item name': string;
  'Inventory location': string;
  'Property id': string;
  Location: string;
  Units: number;
  Cost: number;
  Billable: boolean;
  Note: string;
  Date: string;
  Status: string;
};

const parseBody = (body?: string) => {
  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body) as SubtractionPayload;
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

  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashMatch) {
    const [, day, month, year] = slashMatch;
    return `${day}/${month}/${year}`;
  }

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

const getNextSubtractionId = async (tableName: string) => {
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
      const match = id.match(/^SUBTR-(\d+)$/i);
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
  return `SUBTR-${nextValue}`;
};

const getSubtractionById = async (tableName: string, id: string) => {
  const result = await client.send(
    new GetCommand({
      TableName: tableName,
      Key: { id },
    }),
  );
  return (result.Item as SubtractionItem | undefined) ?? null;
};

const adjustInventoryQuantity = async (params: {
  inventoryTable: string;
  itemId: string;
  delta: number;
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
  const nextQuantity = currentQuantity + params.delta;
  if (nextQuantity < 0) {
    throw new Error('Insufficient inventory quantity.');
  }

  const rebuyQty = Number(inventoryItem.rebuyQty ?? 0) || 0;
  const nextStatus = computeInventoryStatus(nextQuantity, rebuyQty);

  await client.send(
    new UpdateCommand({
      TableName: params.inventoryTable,
      Key: { id: params.itemId },
      UpdateExpression:
        'SET #quantity = :quantity, #status = :status, #lastUpdated = :lastUpdated',
      ConditionExpression:
        'attribute_exists(id) AND (attribute_not_exists(#quantity) OR #quantity = :currentQuantity)',
      ExpressionAttributeNames: {
        '#quantity': 'Quantity',
        '#status': 'Status',
        '#lastUpdated': 'Last updated',
      },
      ExpressionAttributeValues: {
        ':quantity': nextQuantity,
        ':status': nextStatus,
        ':lastUpdated': formatDateForStorage(),
        ':currentQuantity': currentQuantity,
      },
    }),
  );

  return { quantity: nextQuantity, status: nextStatus };
};

const parseBillable = (payload: SubtractionPayload) => {
  if (typeof payload.billable === 'boolean') {
    return payload.billable;
  }
  if (typeof payload.Billable === 'boolean') {
    return payload.Billable;
  }
  return true;
};

const resolveCreateStatus = (billable: boolean) =>
  billable ? STATUS_PENDING_BILLING : STATUS_NOT_BILLABLE;

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  body?: string;
  arguments?: SubtractionPayload;
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

  const inventoryTable = process.env.INVENTORY_TABLE;
  if (!inventoryTable) {
    const message = 'INVENTORY_TABLE is not configured.';
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

  const action = (payload.action ?? payload.Action ?? '').trim().toLowerCase();
  const existingId = payload.id?.trim();

  try {
    if (action === 'mark_billed' || action === 'reverse') {
      if (!existingId) {
        const message = 'Subtraction id is required.';
        if (isHttp) {
          return buildHttpResponse(400, { message });
        }
        throw new Error(message);
      }

      const existing = await getSubtractionById(tableName, existingId);
      if (!existing) {
        const message = 'Subtraction not found.';
        if (isHttp) {
          return buildHttpResponse(404, { message });
        }
        throw new Error(message);
      }

      if (action === 'mark_billed') {
        if (existing.Status !== STATUS_PENDING_BILLING) {
          const message =
            'Only Pending Billing subtractions can be marked as billed.';
          if (isHttp) {
            return buildHttpResponse(400, { message });
          }
          throw new Error(message);
        }

        const item: SubtractionItem = {
          ...existing,
          Status: STATUS_BILLED,
        };
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: item,
          }),
        );
        const response = { item };
        return isHttp ? buildHttpResponse(200, response) : response;
      }

      if (existing.Status === STATUS_REVERSED) {
        const message = 'Subtraction is already reversed.';
        if (isHttp) {
          return buildHttpResponse(400, { message });
        }
        throw new Error(message);
      }

      await adjustInventoryQuantity({
        inventoryTable,
        itemId: existing['Item id'],
        delta: Number(existing.Units) || 0,
      });

      const item: SubtractionItem = {
        ...existing,
        Status: STATUS_REVERSED,
      };
      await client.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
        }),
      );
      const response = { item };
      return isHttp ? buildHttpResponse(200, response) : response;
    }

    const itemId = payload.itemId ?? payload['Item id'] ?? payload['Item ID'];
    const itemName = payload.itemName ?? payload['Item name'];
    const inventoryLocation =
      payload.inventoryLocation ?? payload['Inventory location'] ?? '';
    const propertyId =
      payload.propertyId ?? payload['Property id'] ?? payload['Property ID'];
    const location = payload.location ?? payload.Location;
    const units = payload.units ?? payload.Units;
    const cost = payload.cost ?? payload.Cost;
    const note = payload.note ?? payload.Note ?? '';
    const date = payload.date ?? payload.Date;
    const billable = parseBillable(payload);

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
    if (!propertyId || !String(propertyId).trim()) {
      const message = 'Property id is required.';
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
    if (
      units === undefined ||
      units === null ||
      Number.isNaN(Number(units)) ||
      Number(units) <= 0
    ) {
      const message = 'Units must be greater than zero.';
      if (isHttp) {
        return buildHttpResponse(400, { message });
      }
      throw new Error(message);
    }
    if (cost === undefined || cost === null || Number.isNaN(Number(cost))) {
      const message = 'Cost is required.';
      if (isHttp) {
        return buildHttpResponse(400, { message });
      }
      throw new Error(message);
    }

    const unitsValue = Number(units) || 0;
    const costValue = Number(cost) || 0;
    // Creates always allocate a new id. Status changes use action=mark_billed|reverse.
    if (existingId) {
      const message =
        'Updating an existing subtraction requires action mark_billed or reverse.';
      if (isHttp) {
        return buildHttpResponse(400, { message });
      }
      throw new Error(message);
    }
    const id = await getNextSubtractionId(tableName);
    const statusValue = resolveCreateStatus(billable);

    await adjustInventoryQuantity({
      inventoryTable,
      itemId: String(itemId).trim(),
      delta: -unitsValue,
    });

    const item: SubtractionItem = {
      id,
      'Item id': String(itemId).trim(),
      'Item name': String(itemName).trim(),
      'Inventory location': String(inventoryLocation).trim(),
      'Property id': String(propertyId).trim(),
      Location: String(location).trim(),
      Units: unitsValue,
      Cost: costValue,
      Billable: billable,
      Note: String(note).trim(),
      Date: formatDateForStorage(date ? String(date) : undefined),
      Status: statusValue,
    };

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
      }),
    );

    const response = { item };
    return isHttp ? buildHttpResponse(200, response) : response;
  } catch (error) {
    console.error('UpsertSubtraction failed', { error });
    const message =
      error instanceof Error ? error.message : 'Failed to save subtraction.';
    if (isHttp) {
      const statusCode =
        message.includes('not found') || message.includes('Insufficient')
          ? 400
          : 500;
      return buildHttpResponse(statusCode, { message });
    }
    throw new Error(message);
  }
};
