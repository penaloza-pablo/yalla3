import { DeleteCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import {
  docClient,
  getNextSequentialId,
  putItem,
} from '../shared/visit-task-utils';
import { resolveYallaPropertyLabelFromRecord } from '../shared/property-identity';

const IVA_MULTIPLIER = 1.21;

type MovementPayload = {
  id?: string;
  propertyId?: string;
  propertyName?: string;
  description?: string;
  amount?: number | string;
  appliesIva?: boolean;
  totalAmount?: number | string;
  kind?: string;
  date?: string;
  status?: string;
  action?: string;
};

const MOVEMENT_STATUSES = ['Pending Billing', 'Billed', 'Not Billable'] as const;

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const normalizeKind = (value: string) => {
  const kind = value.trim().toLowerCase();
  if (kind === 'income' || kind === 'outcome') {
    return kind;
  }
  return '';
};

const normalizeStatus = (value: string) => {
  const status = value.trim();
  return MOVEMENT_STATUSES.includes(status as (typeof MOVEMENT_STATUSES)[number])
    ? status
    : '';
};

const resolvePropertyName = async (propertyId: string, fallback: string) => {
  if (fallback) {
    return fallback;
  }
  const tableName = process.env.PROPERTIES_TABLE;
  if (!tableName || !propertyId) {
    return propertyId;
  }
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { id: propertyId },
    }),
  );
  const property = result.Item as Record<string, unknown> | undefined;
  return resolveYallaPropertyLabelFromRecord(property, propertyId);
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
}) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) return denied;
  }

  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const payload = parseBody<MovementPayload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }

  const action = asString(payload.action).toLowerCase();
  const isDelete = action === 'delete';
  const isUpdate = Boolean(asString(payload.id));
  let existing: Record<string, unknown> | undefined;

  if (isUpdate || isDelete) {
    const found = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { id: asString(payload.id) },
      }),
    );
    if (!found.Item) {
      return buildHttpResponse(404, { message: 'Movement not found.' });
    }
    existing = found.Item as Record<string, unknown>;
  }

  try {
    if (isDelete && existing) {
      await docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { id: asString(existing.id) },
        }),
      );
      await recordActivityLog(event, {
        feature: LOG_FEATURES.MOVEMENTS,
        action: 'delete',
        entityId: asString(existing.id),
        entityName:
          asString(existing.propertyName) || asString(existing.propertyId),
        summary: `deleted movement ${quoted(asString(existing.id))}`,
      });
      return buildHttpResponse(200, { deleted: true, id: existing.id });
    }

    const propertyId =
      asString(payload.propertyId) || asString(existing?.propertyId);
    const description =
      asString(payload.description) || asString(existing?.description);
    const date = asString(payload.date) || asString(existing?.date);
    const amount = asNumber(payload.amount) ?? asNumber(existing?.amount);
    const kind =
      normalizeKind(asString(payload.kind) || asString(existing?.kind));
    const status =
      normalizeStatus(asString(payload.status) || asString(existing?.status)) ||
      'Pending Billing';
    const appliesIva =
      typeof payload.appliesIva === 'boolean'
        ? payload.appliesIva
        : Boolean(existing?.appliesIva);

    if (!propertyId) {
      return buildHttpResponse(400, { message: 'propertyId is required.' });
    }
    if (!description) {
      return buildHttpResponse(400, { message: 'description is required.' });
    }
    if (!date || !isDateOnly(date)) {
      return buildHttpResponse(400, { message: 'date is required.' });
    }
    if (amount === null || amount < 0) {
      return buildHttpResponse(400, { message: 'amount must be 0 or greater.' });
    }
    if (!kind) {
      return buildHttpResponse(400, {
        message: 'kind must be income or outcome.',
      });
    }

    const propertyName = await resolvePropertyName(
      propertyId,
      asString(payload.propertyName) || asString(existing?.propertyName),
    );
    const payloadTotal = asNumber(payload.totalAmount);
    const totalAmount = appliesIva
      ? payloadTotal !== null && payloadTotal >= 0
        ? roundMoney(payloadTotal)
        : roundMoney(amount * IVA_MULTIPLIER)
      : roundMoney(amount);
    const timestamp = nowIso();
    const item = {
      id: asString(existing?.id) || (await getNextSequentialId(tableName, 'MOV')),
      propertyId,
      propertyName,
      description,
      amount: roundMoney(amount),
      appliesIva,
      totalAmount,
      kind,
      status,
      date,
      createdAt: asString(existing?.createdAt) || timestamp,
      updatedAt: timestamp,
    };

    await putItem(tableName, item);
    await recordActivityLog(event, {
      feature: LOG_FEATURES.MOVEMENTS,
      action: isUpdate ? 'update' : 'create',
      entityId: item.id,
      entityName: item.propertyName || item.propertyId,
      summary: `${isUpdate ? 'updated' : 'created'} movement ${quoted(item.id)}`,
    });
    return buildHttpResponse(200, { item });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save the finance movement.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
