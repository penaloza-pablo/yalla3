import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import {
  BookingConversationError,
  listConversationPosts,
  sendConversationMessage,
} from '../shared/booking-conversation';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | string[] | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  body?: string;
};

type SendPayload = {
  reservationId?: string;
  body?: string;
  moduleType?: string;
  deliver?: boolean;
};

const asFlag = (value?: string) => {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const fail = (error: unknown) => {
  if (error instanceof BookingConversationError) {
    return buildHttpResponse(error.statusCode, {
      message: error.message,
      code: error.code,
    });
  }
  return buildHttpResponse(500, {
    message: 'Failed to talk to the Guesty conversation.',
    details: error instanceof Error ? error.message : String(error),
  });
};

export const handler = async (event: HttpEvent) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }
  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) {
      return denied;
    }
  }

  const bookingsTable = process.env.BOOKINGS_TABLE || 'yalla-bookings';
  const method = event.requestContext?.http?.method?.toUpperCase() || 'GET';

  try {
    if (method === 'GET') {
      const reservationId = event.queryStringParameters?.reservationId?.trim();
      if (!reservationId) {
        return buildHttpResponse(400, { message: 'reservationId is required.' });
      }
      const thread = await listConversationPosts({
        bookingsTable,
        reservationId,
        cursorAfter: event.queryStringParameters?.cursorAfter?.trim(),
        includeLogs: asFlag(event.queryStringParameters?.includeLogs),
      });
      return buildHttpResponse(200, thread);
    }

    if (method === 'POST') {
      const payload = parseBody<SendPayload>(event.body);
      const reservationId = payload?.reservationId?.trim();
      const body = payload?.body?.trim();
      if (!reservationId || !body) {
        return buildHttpResponse(400, {
          message: 'reservationId and body are required.',
        });
      }
      const result = await sendConversationMessage({
        bookingsTable,
        reservationId,
        body,
        moduleType: payload?.moduleType,
        deliver: payload?.deliver,
      });
      await recordActivityLog(event, {
        feature: LOG_FEATURES.BOOKINGS,
        action: result.delivered ? 'conversation-send' : 'conversation-note',
        entityId: reservationId,
        summary: result.delivered
          ? `Sent Guesty message on ${quoted(reservationId)}`
          : `Added Guesty note on ${quoted(reservationId)}`,
      });
      return buildHttpResponse(200, result);
    }

    return buildHttpResponse(405, { message: 'Method not allowed.' });
  } catch (error) {
    return fail(error);
  }
};
