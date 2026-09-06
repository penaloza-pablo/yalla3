import {
  applyPlannerToReservation,
  applyPlannerWindow,
  getPlannerSettings,
} from '../shared/bookings-planner-apply';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';

type ApplyPayload = {
  reservationId?: string;
  syncGuesty?: boolean;
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
} & ApplyPayload) => {
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

  const payload =
    parseBody<ApplyPayload>(event.body) ??
    ({
      reservationId: event.reservationId,
      syncGuesty: event.syncGuesty,
    } satisfies ApplyPayload);

  try {
    const settings = await getPlannerSettings(settingsTable);
    if (payload.reservationId?.trim()) {
      const result = await applyPlannerToReservation({
        bookingsTable,
        settings,
        reservationId: payload.reservationId.trim(),
        syncGuesty: payload.syncGuesty !== false,
      });
      return buildHttpResponse(result.ok ? 200 : 404, result);
    }

    const applied = await applyPlannerWindow({
      bookingsTable,
      settings,
      syncGuesty: payload.syncGuesty !== false,
    });
    return buildHttpResponse(200, applied);
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to apply bookings planner.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
