import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import {
  HISTORIC_ACCOUNT_ID,
  HistoricEditError,
  actualSortKey,
  eventSortKey,
  isIsoDate,
  isMonthId,
  legacyEditAllowed,
  normalizeEditedMetrics,
  stripReviewMetrics,
} from '../shared/finance-historic';
import {
  deleteHistoricEvent,
  emptyActualItem,
  getHistoricItem,
  putHistoricEvent,
  writeCurrentActual,
} from '../shared/finance-historic-store';
import {
  clearMetricCorrections,
  clearMetricReviewFields,
  parseMetricReviewMap,
  type MetricCorrection,
} from '../shared/historic-metric-review';
import { docClient } from '../shared/visit-task-utils';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  body?: string;
};

type Payload = {
  propertyId?: string;
  eventAction?: string;
  action?: string;
  eventId?: string;
  date?: string;
  title?: string;
  note?: string | null;
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const handler = async (event: HttpEvent) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }
  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) return denied;
  }

  const tableName = process.env.HISTORIC_TABLE;
  const propertiesTable = process.env.PROPERTIES_TABLE;
  if (!tableName || !propertiesTable) {
    return buildHttpResponse(500, {
      message: 'Historic tables are not configured.',
    });
  }

  const payload = parseBody<Payload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }
  const propertyId = asString(payload.propertyId);
  const action = asString(payload.eventAction || payload.action).toLowerCase();
  const date = asString(payload.date);
  const title = asString(payload.title);
  const note = asString(payload.note);
  const eventId = asString(payload.eventId);
  if (!propertyId) {
    return buildHttpResponse(400, { message: 'propertyId is required.' });
  }
  if (action !== 'create' && action !== 'update' && action !== 'delete') {
    return buildHttpResponse(400, {
      message: 'action must be create, update, or delete.',
    });
  }
  if (!isIsoDate(date)) {
    return buildHttpResponse(400, { message: 'date must be YYYY-MM-DD.' });
  }
  if (action !== 'delete' && !title) {
    return buildHttpResponse(400, { message: 'title is required.' });
  }
  if ((action === 'update' || action === 'delete') && !eventId) {
    return buildHttpResponse(400, { message: 'eventId is required.' });
  }

  try {
    const property = await docClient.send(
      new GetCommand({
        TableName: propertiesTable,
        Key: { id: propertyId },
      }),
    );
    if (!property.Item) {
      return buildHttpResponse(404, { message: 'Property was not found.' });
    }
    const id =
      action === 'create'
        ? `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
        : eventId;
    if (action === 'delete') {
      await deleteHistoricEvent(tableName, propertyId, date, id);
      return buildHttpResponse(200, { eventId: id, deleted: true });
    }
    await putHistoricEvent(tableName, {
      propertyId,
      sk: eventSortKey(date, id),
      accountId: HISTORIC_ACCOUNT_ID,
      eventId: id,
      date,
      title,
      note: note || null,
      updatedAt: nowIso(),
    });
    return buildHttpResponse(200, {
      eventId: id,
      date,
      title,
      note: note || null,
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save the historic event.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

const asMetricMap = (value: unknown) => {
  const metrics: Record<string, string | null> = {};
  if (!value || typeof value !== 'object') return metrics;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    metrics[key] = typeof entry === 'string' ? entry : null;
  }
  return metrics;
};

const asFlags = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

export const editHistoricValues = async (event: HttpEvent) => {
  const tableName = process.env.HISTORIC_TABLE;
  const propertiesTable = process.env.PROPERTIES_TABLE;
  if (!tableName || !propertiesTable) {
    return buildHttpResponse(500, {
      message: 'Historic tables are not configured.',
    });
  }
  const payload = parseBody<{
    propertyId?: string;
    period?: string;
    metrics?: Record<string, unknown>;
  }>(event.body);
  const propertyId = asString(payload?.propertyId);
  const period = asString(payload?.period);
  if (!propertyId || !isMonthId(period)) {
    return buildHttpResponse(400, {
      message: 'propertyId and period (YYYY-MM) are required.',
    });
  }
  if (!payload?.metrics || typeof payload.metrics !== 'object') {
    return buildHttpResponse(400, { message: 'metrics are required.' });
  }

  try {
    const property = await docClient.send(
      new GetCommand({
        TableName: propertiesTable,
        Key: { id: propertyId },
      }),
    );
    if (!property.Item) {
      return buildHttpResponse(404, { message: 'Property was not found.' });
    }
    const existing = await getHistoricItem(
      tableName,
      propertyId,
      actualSortKey(period),
    );
    const dataOrigin = asString(existing?.dataOrigin);
    if (!existing || !legacyEditAllowed(period, dataOrigin)) {
      return buildHttpResponse(409, {
        message: 'Only imported months before August 2026 can be edited.',
      });
    }
    const edited = normalizeEditedMetrics(payload.metrics);
    const metrics = stripReviewMetrics({
      ...asMetricMap(existing.metrics),
      ...edited,
    });
    const editedFields = Object.keys(edited);
    const metricReview = clearMetricReviewFields(
      parseMetricReviewMap(existing.metricReview),
      editedFields,
    );
    const metricCorrections = clearMetricCorrections(
      existing.metricCorrections && typeof existing.metricCorrections === 'object'
        ? (existing.metricCorrections as Record<string, MetricCorrection>)
        : {},
      editedFields,
    );
    const provenance =
      existing.provenance && typeof existing.provenance === 'object'
        ? { ...(existing.provenance as Record<string, unknown>) }
        : {};
    provenance.manualEditAt = nowIso();
    await writeCurrentActual(
      tableName,
      emptyActualItem({
        propertyId,
        period,
        dataOrigin: 'legacy_excel',
        metrics,
        qualityFlags: asFlags(existing.qualityFlags),
        provenance,
        propertyKey: asString(existing.propertyKey) || undefined,
        nickname: asString(existing.nickname) || asString(property.Item.nickname),
        sourceSha256: asString(existing.sourceSha256) || undefined,
        metricReview,
        metricCorrections,
        updatedAt: nowIso(),
      }),
    );
    return buildHttpResponse(200, { propertyId, period, metrics, metricReview });
  } catch (error) {
    if (error instanceof HistoricEditError) {
      return buildHttpResponse(400, { message: error.message });
    }
    return buildHttpResponse(500, {
      message: 'Failed to save the historic values.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
