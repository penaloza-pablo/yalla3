import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import {
  applyTrackerFlagPatch,
  readTrackerFlags,
  shouldIncludeBooking,
} from '../shared/check-in-tracker';
import { getActorEmail } from '../shared/cognito-auth';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { docClient } from '../shared/visit-task-utils';

type Payload = {
  reservationId?: string;
  accessGranted?: boolean;
  guestEntered?: boolean;
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

  const bookingsTable = process.env.BOOKINGS_TABLE || 'yalla-bookings';
  const payload = parseBody<Payload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }
  const reservationId = payload.reservationId?.trim();
  if (!reservationId) {
    return buildHttpResponse(400, { message: 'reservationId is required.' });
  }
  if (
    payload.accessGranted !== undefined &&
    typeof payload.accessGranted !== 'boolean'
  ) {
    return buildHttpResponse(400, { message: 'accessGranted must be boolean.' });
  }
  if (
    payload.guestEntered !== undefined &&
    typeof payload.guestEntered !== 'boolean'
  ) {
    return buildHttpResponse(400, { message: 'guestEntered must be boolean.' });
  }

  try {
    const loaded = await docClient.send(
      new GetCommand({
        TableName: bookingsTable,
        Key: { ReservationID: reservationId },
      }),
    );
    const item = loaded.Item as Record<string, unknown> | undefined;
    if (!item) {
      return buildHttpResponse(404, { message: 'Booking not found.' });
    }
    if (!shouldIncludeBooking(item)) {
      return buildHttpResponse(400, {
        message: 'Only confirmed bookings can be tracked.',
      });
    }

    const patched = applyTrackerFlagPatch(readTrackerFlags(item), {
      accessGranted: payload.accessGranted,
      guestEntered: payload.guestEntered,
    });
    if (!patched.ok) {
      const message =
        patched.error === 'guest_entered_requires_access'
          ? 'Guest entered requires access granted.'
          : 'accessGranted or guestEntered is required.';
      return buildHttpResponse(400, { message });
    }

    const actor = await getActorEmail(event);
    const updatedAt = nowIso();
    const previous = readTrackerFlags(item);
    const accessGrantedAt =
      patched.flags.accessGranted === true
        ? previous.accessGranted
          ? (typeof item.CheckInAccessGrantedAt === 'string'
              ? item.CheckInAccessGrantedAt
              : updatedAt)
          : updatedAt
        : '';
    const accessGrantedBy =
      patched.flags.accessGranted === true
        ? previous.accessGranted
          ? (typeof item.CheckInAccessGrantedBy === 'string'
              ? item.CheckInAccessGrantedBy
              : actor)
          : actor
        : '';
    const guestEnteredAt =
      patched.flags.guestEntered === true
        ? previous.guestEntered
          ? (typeof item.CheckInGuestEnteredAt === 'string'
              ? item.CheckInGuestEnteredAt
              : updatedAt)
          : updatedAt
        : '';
    const guestEnteredBy =
      patched.flags.guestEntered === true
        ? previous.guestEntered
          ? (typeof item.CheckInGuestEnteredBy === 'string'
              ? item.CheckInGuestEnteredBy
              : actor)
          : actor
        : '';

    await docClient.send(
      new UpdateCommand({
        TableName: bookingsTable,
        Key: { ReservationID: reservationId },
        UpdateExpression: `
          SET CheckInAccessGranted = :accessGranted,
              CheckInAccessGrantedAt = :accessGrantedAt,
              CheckInAccessGrantedBy = :accessGrantedBy,
              CheckInGuestEntered = :guestEntered,
              CheckInGuestEnteredAt = :guestEnteredAt,
              CheckInGuestEnteredBy = :guestEnteredBy,
              UpdatedAt = :updatedAt
        `,
        ExpressionAttributeValues: {
          ':accessGranted': patched.flags.accessGranted,
          ':accessGrantedAt': accessGrantedAt,
          ':accessGrantedBy': accessGrantedBy,
          ':guestEntered': patched.flags.guestEntered,
          ':guestEnteredAt': guestEnteredAt,
          ':guestEnteredBy': guestEnteredBy,
          ':updatedAt': updatedAt,
        },
      }),
    );

    await recordActivityLog(event, {
      feature: LOG_FEATURES.CHECK_IN_TRACKER,
      action: 'update',
      entityId: reservationId,
      summary: `updated check-in tracker for ${quoted(reservationId)}`,
    });

    return buildHttpResponse(200, {
      item: {
        ReservationID: reservationId,
        CheckInAccessGranted: patched.flags.accessGranted,
        CheckInAccessGrantedAt: accessGrantedAt,
        CheckInAccessGrantedBy: accessGrantedBy,
        CheckInGuestEntered: patched.flags.guestEntered,
        CheckInGuestEnteredAt: guestEnteredAt,
        CheckInGuestEnteredBy: guestEnteredBy,
        accessGranted: patched.flags.accessGranted,
        guestEntered: patched.flags.guestEntered,
      },
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to update check-in tracker.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
