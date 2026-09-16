import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import {
  AKILES_ACTOR,
  buildAkilesGuestEnteredUpdate,
  canMarkAkilesCheckIn,
  decodeHttpBody,
  eventOccurredAt,
  fetchAkilesMember,
  getHeader,
  isAkilesSignatureValid,
  isGadgetActionUse,
  loadAkilesSecrets,
  memberIdFromEvent,
  parseAkilesEvent,
  resolveReservationFromAkilesEvent,
} from '../shared/akiles-check-in';
import { buildHttpResponse, corsHeaders, isHttpRequest } from '../shared/dynamo-http';
import { docClient } from '../shared/visit-task-utils';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
};

export const handler = async (event: HttpEvent) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }
  if (isHttp && event.requestContext?.http?.method !== 'POST') {
    return buildHttpResponse(405, { message: 'Method not allowed. Use POST.' });
  }

  const rawBody = decodeHttpBody(event);
  if (!rawBody) {
    return buildHttpResponse(400, { message: 'Body is required.' });
  }

  try {
    const secrets = await loadAkilesSecrets();
    if (!secrets.webhookSecret) {
      return buildHttpResponse(500, { message: 'Akiles webhook secret is not configured.' });
    }
    const signature = getHeader(event.headers, 'x-akiles-sig-sha256');
    if (!isAkilesSignatureValid(rawBody, signature, secrets.webhookSecret)) {
      return buildHttpResponse(400, { message: 'bad sig' });
    }

    const akilesEvent = parseAkilesEvent(rawBody);
    if (!akilesEvent) {
      return buildHttpResponse(400, { message: 'Invalid JSON event.' });
    }
    if (!isGadgetActionUse(akilesEvent)) {
      return buildHttpResponse(200, { ok: true, ignored: true, reason: 'not_gadget_action_use' });
    }

    let resolved = resolveReservationFromAkilesEvent(akilesEvent);
    if (!resolved.ok) {
      const memberId = resolved.memberId || memberIdFromEvent(akilesEvent);
      if (memberId && secrets.accessToken) {
        const member = await fetchAkilesMember(memberId, secrets);
        resolved = resolveReservationFromAkilesEvent(akilesEvent, member);
        if (!resolved.ok) {
          console.warn('Akiles member did not map to a Yalla booking', {
            reason: resolved.reason,
            memberId: resolved.memberId,
            metadataKeys: Object.keys(
              (member.metadata && typeof member.metadata === 'object'
                ? member.metadata
                : {}) as Record<string, unknown>,
            ),
          });
          return buildHttpResponse(200, {
            ok: true,
            ignored: true,
            reason: resolved.reason,
          });
        }
      } else {
        console.warn('Akiles event did not map to a Yalla booking', {
          reason: resolved.reason,
          memberId,
        });
        return buildHttpResponse(200, {
          ok: true,
          ignored: true,
          reason: resolved.reason,
        });
      }
    }

    const bookingsTable = process.env.BOOKINGS_TABLE || 'yalla-bookings';
    const loaded = await docClient.send(
      new GetCommand({
        TableName: bookingsTable,
        Key: { ReservationID: resolved.reservationId },
      }),
    );
    const item = loaded.Item as Record<string, unknown> | undefined;
    if (!item) {
      return buildHttpResponse(200, { ok: true, ignored: true, reason: 'booking_not_found' });
    }
    const allowed = canMarkAkilesCheckIn(item);
    if (!allowed.ok) {
      return buildHttpResponse(200, { ok: true, ignored: true, reason: allowed.reason });
    }

    const eventId = String(akilesEvent.id ?? '').trim();
    const occurredAt = eventOccurredAt(akilesEvent);
    const update = buildAkilesGuestEnteredUpdate({
      item,
      memberId: resolved.memberId,
      eventId,
      occurredAt,
    });
    if (update.alreadyEntered) {
      return buildHttpResponse(200, {
        ok: true,
        ignored: true,
        reason: 'already_entered',
        reservationId: resolved.reservationId,
      });
    }
    if (!update.values) {
      return buildHttpResponse(200, { ok: true, ignored: true, reason: 'cannot_patch' });
    }

    await docClient.send(
      new UpdateCommand({
        TableName: bookingsTable,
        Key: { ReservationID: resolved.reservationId },
        UpdateExpression: `
          SET CheckInAccessGranted = :accessGranted,
              CheckInAccessGrantedAt = :accessGrantedAt,
              CheckInAccessGrantedBy = :accessGrantedBy,
              CheckInGuestEntered = :guestEntered,
              CheckInGuestEnteredAt = :guestEnteredAt,
              CheckInGuestEnteredBy = :guestEnteredBy,
              AkilesMemberId = :akilesMemberId,
              AkilesCheckedInAt = :akilesCheckedInAt,
              AkilesCheckedInEventId = :akilesCheckedInEventId,
              UpdatedAt = :updatedAt
        `,
        ExpressionAttributeValues: {
          ':accessGranted': update.values.accessGranted,
          ':accessGrantedAt': update.values.accessGrantedAt,
          ':accessGrantedBy': update.values.accessGrantedBy,
          ':guestEntered': update.values.guestEntered,
          ':guestEnteredAt': update.values.guestEnteredAt,
          ':guestEnteredBy': update.values.guestEnteredBy,
          ':akilesMemberId': update.values.akilesMemberId,
          ':akilesCheckedInAt': update.values.akilesCheckedInAt,
          ':akilesCheckedInEventId': update.values.akilesCheckedInEventId,
          ':updatedAt': update.values.updatedAt,
        },
      }),
    );

    await recordActivityLog(event, {
      feature: LOG_FEATURES.CHECK_IN_TRACKER,
      action: 'update',
      entityId: resolved.reservationId,
      userEmail: AKILES_ACTOR,
      summary: `akiles marked guest entered for ${quoted(resolved.reservationId)}`,
    });

    return buildHttpResponse(200, {
      ok: true,
      reservationId: resolved.reservationId,
      memberId: resolved.memberId,
      guestEntered: true,
    });
  } catch (error) {
    console.error('Failed to process Akiles event', error);
    return buildHttpResponse(500, {
      message: 'Failed to process Akiles event.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
