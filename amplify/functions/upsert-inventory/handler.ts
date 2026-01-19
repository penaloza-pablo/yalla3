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
    (result.Items ?? []).forEach((entry) => {
      const id = typeof entry.id === 'string' ? entry.id : '';
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

const buildReorderAlert = (item: {
  name: string;
  category?: string;
  quantity: number;
  location: string;
  createdBy: string;
}) => {
  const normalizedCategory = item.category?.trim().toLowerCase() ?? '';
  if (normalizedCategory === 'keys') {
    return {
      name: 'Missing key set',
      description: item.name,
    };
  }
  if (normalizedCategory === 'cleaning' || normalizedCategory === 'welcome kit') {
    return {
      name: `Reorder ${item.name}`,
      description: `${item.quantity} remains on ${item.location}`,
    };
  }
  return null;
};

const hasDuplicateReorderAlert = async (
  tableName: string,
  alertName: string,
) => {
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  do {
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'id',
        FilterExpression: '#status = :status AND #origin = :origin AND #name = :name',
        ExpressionAttributeNames: {
          '#status': 'Status',
          '#origin': 'Origin',
          '#name': 'Name ',
        },
        ExpressionAttributeValues: {
          ':status': 'Pending',
          ':origin': 'Inventory',
          ':name': alertName,
        },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );

    if ((result.Items ?? []).length > 0) {
      return true;
    }

    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  return false;
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
  createdBy?: string;
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
  const createdBy = payload.createdBy?.trim() || 'system';

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

    const alertsTable = process.env.ALERTS_TABLE;
    if (alertsTable && item.Status === 'Reorder') {
      const alertTemplate = buildReorderAlert({
        name: item['Item name'],
        category: item.category,
        quantity: item.Quantity,
        location: item.Location || 'Unknown location',
        createdBy,
      });

      if (alertTemplate) {
        const isDuplicate = await hasDuplicateReorderAlert(
          alertsTable,
          alertTemplate.name,
        );
        if (isDuplicate) {
          const response = { item };
          return isHttp ? buildHttpResponse(200, response) : response;
        }
        const alertId = await getNextAlertId(alertsTable);
        await client.send(
          new PutCommand({
            TableName: alertsTable,
            Item: {
              id: alertId,
              'Name ': alertTemplate.name,
              Description: alertTemplate.description,
              Date: formatAlertDate(),
              Status: 'Pending',
              Origin: 'Inventory',
              'Create by': createdBy,
            },
          }),
        );
      }
    }

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
