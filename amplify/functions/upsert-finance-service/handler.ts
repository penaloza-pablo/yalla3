import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import {
  asNumber,
  asString,
  isBillingItemRecord,
  isDateOnly,
  normalizeCustomUnit,
  normalizePriceMode,
  normalizeRecurrence,
  normalizeServiceType,
  occurrencePriceWithIva,
  persistIvaFields,
  resolveIvaRateFromInput,
  roundMoney,
} from '../shared/finance-services';
import {
  deleteFinanceRecord,
  materializeCurrentMonth,
} from '../shared/finance-services-store';
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

type ServicePayload = {
  id?: string;
  recordType?: string;
  scheduleId?: string;
  type?: string;
  propertyId?: string;
  propertyName?: string;
  title?: string;
  recurrence?: string;
  startDate?: string;
  customInterval?: number | string;
  customUnit?: string;
  priceMode?: string;
  price?: number | string;
  ivaRate?: number | string;
  appliesIva?: boolean;
  priceWithIva?: number | string;
  billingDate?: string;
  action?: string;
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

const moneyFields = (payload: ServicePayload, existing?: Record<string, unknown>) => {
  const ivaRate = resolveIvaRateFromInput(payload, existing);
  const price = roundMoney(
    Math.max(0, asNumber(payload.price) ?? asNumber(existing?.price) ?? 0),
  );
  const storedGross = asNumber(payload.priceWithIva);
  const priceWithIva =
    storedGross !== null
      ? roundMoney(Math.max(0, storedGross))
      : occurrencePriceWithIva(price, ivaRate);
  return { price, priceWithIva, ...persistIvaFields(ivaRate) };
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

  const payload = parseBody<ServicePayload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }

  const action = asString(payload.action).toLowerCase();
  const isDelete = action === 'delete';
  const isItemWrite =
    asString(payload.recordType) === 'item' || action === 'item';
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
      return buildHttpResponse(404, { message: 'Service not found.' });
    }
    existing = found.Item as Record<string, unknown>;
  }

  try {
    if (isDelete && existing) {
      await deleteFinanceRecord(tableName, asString(existing.id));
      await recordActivityLog(event, {
        feature: LOG_FEATURES.SERVICES,
        action: 'delete',
        entityId: asString(existing.id),
        entityName: asString(existing.title),
        summary: `deleted ${
          isBillingItemRecord(existing) ? 'billing item' : 'scheduled service'
        } ${quoted(asString(existing.id))}`,
      });
      return buildHttpResponse(200, { deleted: true, id: existing.id });
    }

    if (isItemWrite || (existing && isBillingItemRecord(existing))) {
      const type = normalizeServiceType(
        asString(payload.type) || asString(existing?.type),
      );
      const title = asString(payload.title) || asString(existing?.title);
      const billingDate =
        asString(payload.billingDate) || asString(existing?.billingDate);
      const propertyId =
        type === 'apartment'
          ? asString(payload.propertyId) || asString(existing?.propertyId)
          : '';
      if (!type) {
        return buildHttpResponse(400, {
          message: 'type must be apartment or ops.',
        });
      }
      if (!title) {
        return buildHttpResponse(400, { message: 'title is required.' });
      }
      if (!billingDate || !isDateOnly(billingDate)) {
        return buildHttpResponse(400, { message: 'billingDate is required.' });
      }
      if (type === 'apartment' && !propertyId) {
        return buildHttpResponse(400, {
          message: 'propertyId is required for apartment services.',
        });
      }
      const { price, ivaRate, priceWithIva, appliesIva } = moneyFields(
        payload,
        existing,
      );
      const timestamp = nowIso();
      const id =
        asString(existing?.id) || (await getNextSequentialId(tableName, 'SIT'));
      const propertyName = propertyId
        ? await resolvePropertyName(
            propertyId,
            asString(payload.propertyName) || asString(existing?.propertyName),
          )
        : '';
      const item = {
        id,
        recordType: 'item',
        scheduleId:
          asString(payload.scheduleId) ||
          asString(existing?.scheduleId) ||
          undefined,
        type,
        propertyId: propertyId || undefined,
        propertyName: propertyName || undefined,
        title,
        recurrence:
          normalizeRecurrence(
            asString(payload.recurrence) || asString(existing?.recurrence),
          ) || 'oneoff',
        billingDate,
        period: billingDate.slice(0, 7),
        price,
        ivaRate,
        appliesIva,
        priceWithIva,
        createdAt: asString(existing?.createdAt) || timestamp,
        updatedAt: timestamp,
      };
      await putItem(tableName, item);
      await recordActivityLog(event, {
        feature: LOG_FEATURES.SERVICES,
        action: isUpdate ? 'update' : 'create',
        entityId: item.id,
        entityName: item.title,
        summary: `${isUpdate ? 'updated' : 'created'} billing item ${quoted(item.id)}`,
      });
      return buildHttpResponse(200, { item });
    }

    const type = normalizeServiceType(
      asString(payload.type) || asString(existing?.type),
    );
    const title = asString(payload.title) || asString(existing?.title);
    const recurrence = normalizeRecurrence(
      asString(payload.recurrence) || asString(existing?.recurrence),
    );
    const startDate =
      asString(payload.startDate) || asString(existing?.startDate);
    const propertyId =
      type === 'apartment'
        ? asString(payload.propertyId) || asString(existing?.propertyId)
        : '';
    const priceMode =
      normalizePriceMode(
        asString(payload.priceMode) || asString(existing?.priceMode),
      ) || (asNumber(existing?.price) ? 'fixed' : 'variable');
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
    const ivaRate =
      priceMode === 'fixed' ? resolveIvaRateFromInput(payload, existing) : 0;
    const price =
      priceMode === 'fixed'
        ? roundMoney(
            Math.max(
              0,
              asNumber(payload.price) ?? asNumber(existing?.price) ?? 0,
            ),
          )
        : 0;
    const storedGross = asNumber(payload.priceWithIva);
    const priceWithIva =
      priceMode === 'fixed'
        ? storedGross !== null
          ? roundMoney(Math.max(0, storedGross))
          : occurrencePriceWithIva(price, ivaRate)
        : 0;
    const { appliesIva } = persistIvaFields(ivaRate);

    if (!type) {
      return buildHttpResponse(400, {
        message: 'type must be apartment or ops.',
      });
    }
    if (!title) {
      return buildHttpResponse(400, { message: 'title is required.' });
    }
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
    if (type === 'apartment' && !propertyId) {
      return buildHttpResponse(400, {
        message: 'propertyId is required for apartment services.',
      });
    }

    const timestamp = nowIso();
    const id =
      asString(existing?.id) || (await getNextSequentialId(tableName, 'SVC'));
    const propertyName = propertyId
      ? await resolvePropertyName(
          propertyId,
          asString(payload.propertyName) || asString(existing?.propertyName),
        )
      : '';

    const item = {
      id,
      recordType: 'schedule',
      type,
      propertyId: propertyId || undefined,
      propertyName: propertyName || undefined,
      title,
      recurrence,
      startDate,
      customInterval: recurrence === 'other' ? customInterval : undefined,
      customUnit: recurrence === 'other' ? customUnit : undefined,
      priceMode,
      price,
      ivaRate,
      appliesIva,
      priceWithIva,
      items: [],
      createdAt: asString(existing?.createdAt) || timestamp,
      updatedAt: timestamp,
    };

    await putItem(tableName, item);
    await materializeCurrentMonth(tableName, id);
    await recordActivityLog(event, {
      feature: LOG_FEATURES.SERVICES,
      action: isUpdate ? 'update' : 'create',
      entityId: item.id,
      entityName: item.title,
      summary: `${isUpdate ? 'updated' : 'created'} scheduled service ${quoted(item.id)}`,
    });
    return buildHttpResponse(200, { item });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save the finance service.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
