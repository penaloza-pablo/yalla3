import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import {
  applyPlannerToReservation,
  getPlannerSettings,
} from '../shared/bookings-planner-apply';
import { LINEN_OPTIONS } from '../shared/bookings-planner';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';

type FieldsPayload = {
  reservationId?: string;
  linen?: string;
  giftCardOn?: boolean;
  earlyCheckInOn?: boolean;
  access?: string;
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

  const settingsTable = process.env.TABLE_NAME;
  const bookingsTable = process.env.BOOKINGS_TABLE || 'yalla-bookings';
  if (!settingsTable) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const payload = parseBody<FieldsPayload>(event.body);
  const reservationId = payload?.reservationId?.trim();
  if (!reservationId) {
    return buildHttpResponse(400, { message: 'reservationId is required.' });
  }

  if (
    payload.linen !== undefined &&
    !LINEN_OPTIONS.includes(payload.linen as (typeof LINEN_OPTIONS)[number])
  ) {
    return buildHttpResponse(400, { message: 'Invalid linen value.' });
  }

  try {
    const settings = await getPlannerSettings(settingsTable);
    const result = await applyPlannerToReservation({
      bookingsTable,
      settings,
      reservationId,
      overrides: {
        ...(payload.linen !== undefined ? { linen: payload.linen } : {}),
        ...(payload.giftCardOn !== undefined
          ? { giftCardOn: payload.giftCardOn === true }
          : {}),
        ...(payload.earlyCheckInOn !== undefined
          ? { earlyCheckInOn: payload.earlyCheckInOn === true }
          : {}),
        ...(payload.access !== undefined ? { access: payload.access } : {}),
      },
      syncGuesty: true,
    });

    if (!result.ok) {
      return buildHttpResponse(404, { message: 'Booking not found.' });
    }

    await recordActivityLog(event, {
      feature: LOG_FEATURES.BOOKINGS_PLAN,
      action: 'update',
      entityId: reservationId,
      summary: `updated planner fields for ${quoted(reservationId)}`,
    });

    return buildHttpResponse(200, {
      item: {
        ReservationID: reservationId,
        ...result.patch,
      },
      syncedToGuesty: result.syncedToGuesty,
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to update booking planner fields.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
