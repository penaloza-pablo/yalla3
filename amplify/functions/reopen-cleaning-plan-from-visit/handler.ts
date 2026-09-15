import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { reopenCleaningPlansForVisitChange } from '../shared/cleaning-plan-visit-change';

type VisitChangePayload = {
  visitId?: string;
  title?: string;
  listingLabel?: string;
  guestName?: string;
  confirmationCode?: string;
  reservationId?: string;
  previousDate?: string;
  nextDate?: string;
  previousStatus?: string;
  nextStatus?: string;
  isCreate?: boolean;
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
} & VisitChangePayload) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) return denied;
  }

  const payload =
    parseBody<VisitChangePayload>(event.body) ??
    ({
      visitId: event.visitId,
      title: event.title,
      listingLabel: event.listingLabel,
      guestName: event.guestName,
      confirmationCode: event.confirmationCode,
      reservationId: event.reservationId,
      previousDate: event.previousDate,
      nextDate: event.nextDate,
      previousStatus: event.previousStatus,
      nextStatus: event.nextStatus,
      isCreate: event.isCreate,
    } satisfies VisitChangePayload);

  const visitId = payload.visitId?.trim() ?? '';
  if (!visitId) {
    return buildHttpResponse(400, { message: 'visitId is required.' });
  }

  try {
    const result = await reopenCleaningPlansForVisitChange({
      visitId,
      title: payload.title,
      listingLabel: payload.listingLabel,
      guestName: payload.guestName,
      confirmationCode: payload.confirmationCode,
      reservationId: payload.reservationId,
      previousDate: payload.previousDate,
      nextDate: payload.nextDate,
      previousStatus: payload.previousStatus,
      nextStatus: payload.nextStatus,
      isCreate: payload.isCreate === true,
    });
    return buildHttpResponse(200, result);
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to reopen cleaning plan from visit change.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
