import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  buildAkilesGuestEnteredUpdate,
  canMarkAkilesCheckIn,
  CHECK_IN_TRACKER_PRESERVED_FIELDS,
  isAkilesSignatureValid,
  isExcludedAkilesProperty,
  isGadgetActionUse,
  memberIdFromEvent,
  parseAkilesEvent,
  matchBookingToAkilesMember,
  reservationIdFromMemberMetadata,
  resolveReservationFromAkilesEvent,
} from './akiles-check-in';

const reservationId = '6a6bfa1552645a1dded65f8f';
const memberId = 'mem_3merk33gt7ml3tde71f3';

const gadgetUseEvent = {
  id: 'evt_1',
  verb: 'use',
  occurred_at: '2026-09-16T10:01:00.000Z',
  created_at: '2026-09-16T10:02:00.000Z',
  subject: { member_id: memberId, member_magic_link_id: 'mml_1' },
  object: { type: 'gadget_action', gadget_id: 'gad_1', member_id: memberId },
};

test('HMAC signature matches the Akiles SHA-256 header', () => {
  const secret = 'f305d484fd10de285b00bb203659e863';
  const body = '{"id":"evt_1"}';
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  assert.equal(isAkilesSignatureValid(body, signature, secret), true);
  assert.equal(isAkilesSignatureValid(body, '00'.repeat(32), secret), false);
  assert.equal(isAkilesSignatureValid(body, signature, 'other'), false);
});

test('parses gadget_action use events and wrapped websocket payloads', () => {
  assert.equal(isGadgetActionUse(gadgetUseEvent), true);
  assert.equal(isGadgetActionUse({ verb: 'edit', object: { type: 'member' } }), false);
  const wrapped = parseAkilesEvent(JSON.stringify({ type: 'event', event: gadgetUseEvent }));
  assert.equal(memberIdFromEvent(wrapped ?? {}), memberId);
});

test('joins Guesty-synced members via metadata.sourceID', () => {
  const resolved = resolveReservationFromAkilesEvent(gadgetUseEvent, {
    id: memberId,
    metadata: { source: 'guesty', sourceID: reservationId },
  });
  assert.equal(resolved.ok, true);
  if (resolved.ok) {
    assert.equal(resolved.reservationId, reservationId);
    assert.equal(resolved.memberId, memberId);
  }
  assert.equal(
    reservationIdFromMemberMetadata({ reservationId }),
    reservationId,
  );
});

test('ignores staff members and members without reservation metadata', () => {
  const staff = resolveReservationFromAkilesEvent(gadgetUseEvent, {
    id: memberId,
    metadata: { source: 'manual' },
  });
  assert.equal(staff.ok, false);

  const empty = resolveReservationFromAkilesEvent(gadgetUseEvent, {
    id: memberId,
    metadata: {},
  });
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.reason, 'missing_reservation_metadata');
  }

  const missing = resolveReservationFromAkilesEvent(gadgetUseEvent);
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.equal(missing.reason, 'member_not_expanded');
  }
});

test('skips properties without Akiles locks', () => {
  assert.equal(isExcludedAkilesProperty('Baranda'), true);
  assert.equal(isExcludedAkilesProperty('Esperanza 9'), true);
  assert.equal(isExcludedAkilesProperty('Esperanza 14'), false);
  assert.equal(isExcludedAkilesProperty('Rodas'), true);
  assert.equal(
    canMarkAkilesCheckIn({
      Status: 'confirmed',
      ListingNickname: 'Almendro',
    }).ok,
    false,
  );
});

test('only confirmed bookings can be marked from Akiles', () => {
  assert.equal(
    canMarkAkilesCheckIn({ Status: 'confirmed', ListingNickname: 'San Marcos C' }).ok,
    true,
  );
  assert.equal(
    canMarkAkilesCheckIn({ Status: 'canceled', ListingNickname: 'San Marcos C' }).ok,
    false,
  );
});

test('first lock use sets access granted and guest entered; later events are idempotent', () => {
  const first = buildAkilesGuestEnteredUpdate({
    item: { Status: 'confirmed' },
    memberId,
    eventId: 'evt_1',
    occurredAt: '2026-09-16T10:01:00.000Z',
  });
  assert.equal(first.alreadyEntered, false);
  assert.ok(first.values);
  assert.equal(first.values?.accessGranted, true);
  assert.equal(first.values?.guestEntered, true);
  assert.equal(first.values?.guestEnteredBy, 'akiles');
  assert.equal(first.values?.guestEnteredAt, '2026-09-16T10:01:00.000Z');

  const again = buildAkilesGuestEnteredUpdate({
    item: {
      CheckInAccessGranted: true,
      CheckInGuestEntered: true,
      CheckInGuestEnteredAt: '2026-09-16T10:01:00.000Z',
    },
    memberId,
    eventId: 'evt_2',
    occurredAt: '2026-09-16T11:00:00.000Z',
  });
  assert.equal(again.alreadyEntered, true);
});

test('joins Guesty members by magic link Access or guest name on check-in day', () => {
  const bookings = [
    {
      ReservationID: 'other',
      GuestName: 'Someone Else',
      Access: 'https://link.akiles.app/ml_other_aaa',
    },
    {
      ReservationID: reservationId,
      GuestName: 'Ada Lovelace',
      Access: 'https://link.akiles.app/ml_43p4vhlnpyfd2gnn77th_db7bec0cda5abcedde7e60b3348dabe33108310c3479dae2',
    },
  ];
  assert.equal(
    matchBookingToAkilesMember({
      member: { id: memberId, name: 'Ada Lovelace' },
      bookings,
      accessLink: 'https://link.akiles.app/#ml_43p4vhlnpyfd2gnn77th_db7bec0cda5abcedde7e60b3348dabe33108310c3479dae2',
    }),
    reservationId,
  );
  assert.equal(
    matchBookingToAkilesMember({
      member: { id: memberId, name: 'Ada Lovelace' },
      bookings: [
        { ReservationID: reservationId, GuestName: 'Ada Lovelace', Access: '' },
      ],
    }),
    reservationId,
  );
});

test('preserved booking fields cover tracker flags and Akiles ids', () => {
  assert.ok(CHECK_IN_TRACKER_PRESERVED_FIELDS.includes('CheckInGuestEntered'));
  assert.ok(CHECK_IN_TRACKER_PRESERVED_FIELDS.includes('AkilesMemberId'));
});
