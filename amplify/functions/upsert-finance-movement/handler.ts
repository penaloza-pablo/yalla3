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
  asNumber,
  asString,
  isDateOnly,
  isMovementScheduleRecord,
  normalizeCustomUnit,
  normalizeRecurrence,
  parseScheduleEnabled,
  parseScheduleEndDate,
} from '../shared/finance-services';
import { materializeCurrentMovementMonth } from '../shared/finance-movements-store';
import {
  parseCostDefaultAllocation,
  parseIncomeDefaultAllocation,
} from '../shared/property-report-allocations';
import {
  occurrencePriceWithIva,
  persistIvaFields,
  resolveIvaRateFromInput,
  roundMoney,
} from '../shared/iva';
import {
  docClient,
  getNextSequentialId,
  putItem,
} from '../shared/visit-task-utils';
import { resolveYallaPropertyLabelFromRecord } from '../shared/property-identity';

type MovementPayload = {
  id?: string;
  recordType?: string;
  scheduleId?: string;
  propertyId?: string;
  propertyName?: string;
  description?: string;
  amount?: number | string;
  ivaRate?: number | string;
  appliesIva?: boolean;
  totalAmount?: number | string;
  kind?: string;
  date?: string;
  startDate?: string;
  recurrence?: string;
  customInterval?: number | string;
  customUnit?: string;
  status?: string;
  enabled?: boolean | string;
  endDate?: string;
  defaultAllocation?: string;
  allocation?: string;
  action?: string;
};

const MOVEMENT_STATUSES = ['Pending Billing', 'Billed', 'Not Billable'] as const;

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

const parseDefaultAllocation = (kind: string, value: unknown) =>
  kind === 'income'
    ? parseIncomeDefaultAllocation(value)
    : parseCostDefaultAllocation(value);

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
          asString(existing.propertyName) ||
          asString(existing.description) ||
          asString(existing.propertyId),
        summary: `deleted ${
          isMovementScheduleRecord(existing)
            ? 'scheduled movement'
            : 'movement'
        } ${quoted(asString(existing.id))}`,
      });
      return buildHttpResponse(200, { deleted: true, id: existing.id });
    }

    const isScheduleWrite =
      asString(payload.recordType) === 'schedule' ||
      (existing ? isMovementScheduleRecord(existing) : false);

    const propertyId =
      asString(payload.propertyId) || asString(existing?.propertyId);
    const description =
      asString(payload.description) || asString(existing?.description);
    const amount = asNumber(payload.amount) ?? asNumber(existing?.amount);
    const kind =
      normalizeKind(asString(payload.kind) || asString(existing?.kind));
    const status =
      normalizeStatus(asString(payload.status) || asString(existing?.status)) ||
      'Pending Billing';
    const ivaRate = resolveIvaRateFromInput(payload, existing);
    const { appliesIva } = persistIvaFields(ivaRate);

    if (!propertyId) {
      return buildHttpResponse(400, { message: 'propertyId is required.' });
    }
    if (!description) {
      return buildHttpResponse(400, { message: 'description is required.' });
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
    const totalAmount =
      payloadTotal !== null && payloadTotal >= 0
        ? roundMoney(payloadTotal)
        : occurrencePriceWithIva(roundMoney(amount), ivaRate);
    const timestamp = nowIso();

    if (isScheduleWrite) {
      const recurrence = normalizeRecurrence(
        asString(payload.recurrence) || asString(existing?.recurrence),
      );
      const startDate =
        asString(payload.startDate) || asString(existing?.startDate);
      const customInterval = Math.max(
        1,
        Math.floor(
          asNumber(payload.customInterval) ??
            asNumber(existing?.customInterval) ??
            1,
        ),
      );
      const customUnit =
        normalizeCustomUnit(
          asString(payload.customUnit) || asString(existing?.customUnit),
        ) || 'months';
      if (!recurrence || recurrence === 'oneoff') {
        return buildHttpResponse(400, { message: 'recurrence is required.' });
      }
      if (recurrence === 'other' && customInterval < 1) {
        return buildHttpResponse(400, {
          message: 'customInterval is required for Other recurrence.',
        });
      }
      if (!startDate || !isDateOnly(startDate)) {
        return buildHttpResponse(400, { message: 'startDate is required.' });
      }
      const enabled = parseScheduleEnabled(
        payload.enabled !== undefined ? payload.enabled : existing?.enabled,
        true,
      );
      const endDate = parseScheduleEndDate(
        payload.endDate !== undefined ? payload.endDate : existing?.endDate,
      );
      if (endDate && endDate < startDate) {
        return buildHttpResponse(400, {
          message: 'endDate must be on or after startDate.',
        });
      }
      const defaultAllocation = parseDefaultAllocation(
        kind,
        payload.defaultAllocation !== undefined
          ? payload.defaultAllocation
          : payload.allocation !== undefined
            ? payload.allocation
            : existing?.defaultAllocation ?? existing?.allocation,
      );
      const item = {
        id:
          asString(existing?.id) ||
          (await getNextSequentialId(tableName, 'MVS')),
        recordType: 'schedule',
        propertyId,
        propertyName,
        description,
        amount: roundMoney(amount),
        ivaRate,
        appliesIva,
        totalAmount,
        kind,
        status,
        recurrence,
        startDate,
        customInterval: recurrence === 'other' ? customInterval : undefined,
        customUnit: recurrence === 'other' ? customUnit : undefined,
        enabled,
        ...(endDate ? { endDate } : {}),
        ...(defaultAllocation ? { defaultAllocation } : {}),
        createdAt: asString(existing?.createdAt) || timestamp,
        updatedAt: timestamp,
      };
      await putItem(tableName, item);
      await materializeCurrentMovementMonth(tableName, item.id);
      await recordActivityLog(event, {
        feature: LOG_FEATURES.MOVEMENTS,
        action: isUpdate ? 'update' : 'create',
        entityId: item.id,
        entityName: item.description || item.propertyName,
        summary: `${isUpdate ? 'updated' : 'created'} scheduled movement ${quoted(item.id)}`,
      });
      return buildHttpResponse(200, { item });
    }

    const date = asString(payload.date) || asString(existing?.date);
    if (!date || !isDateOnly(date)) {
      return buildHttpResponse(400, { message: 'date is required.' });
    }
    const existingAllocation = parseDefaultAllocation(
      kind,
      existing?.allocation,
    );
    const item = {
      id: asString(existing?.id) || (await getNextSequentialId(tableName, 'MOV')),
      recordType: 'item',
      scheduleId:
        asString(payload.scheduleId) ||
        asString(existing?.scheduleId) ||
        undefined,
      propertyId,
      propertyName,
      description,
      amount: roundMoney(amount),
      ivaRate,
      appliesIva,
      totalAmount,
      kind,
      status,
      date,
      ...(existingAllocation ? { allocation: existingAllocation } : {}),
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
