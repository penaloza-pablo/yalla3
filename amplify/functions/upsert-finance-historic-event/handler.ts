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
  eventSortKey,
  isIsoDate,
} from '../shared/finance-historic';
import {
  deleteHistoricEvent,
  putHistoricEvent,
} from '../shared/finance-historic-store';
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
