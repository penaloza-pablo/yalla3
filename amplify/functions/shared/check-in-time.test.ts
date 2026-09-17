import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkInTimeFromBooking,
  DEFAULT_CHECK_IN_TIME,
  isCheckInTimeDue,
  normalizePlannedArrival,
  plannedArrivalFromGuestyReservation,
} from './check-in-time';
import { shouldAutoGrantAccess } from './grant-check-in-access';
import {
  doNotEarlyCheckInReadyMessage,
  earlyCheckInAccessEnabledMessage,
} from './slack-early-check-in';

test('planned arrival normalizes Guesty times and defaults to 15:00', () => {
  assert.equal(normalizePlannedArrival('9:00'), '09:00');
  assert.equal(normalizePlannedArrival('16:30:00'), '16:30');
  assert.equal(normalizePlannedArrival('25:00'), '');
  assert.equal(checkInTimeFromBooking({}), DEFAULT_CHECK_IN_TIME);
  assert.equal(checkInTimeFromBooking({ PlannedArrival: '14:00' }), '14:00');
  assert.equal(
    plannedArrivalFromGuestyReservation({ plannedArrival: '11:00' }),
    '11:00',
  );
});

test('access is due at or after the stored check-in time', () => {
  assert.equal(isCheckInTimeDue('14:59', '15:00'), false);
  assert.equal(isCheckInTimeDue('15:00', '15:00'), true);
  assert.equal(isCheckInTimeDue('15:01', '14:00'), true);
});

test('auto grant waits for the check-in hour and completed jobs', () => {
  const booking = {
    ReservationID: 'res-1',
    ListingID: 'listing-a',
    Status: 'confirmed',
    CheckInDate: '2026-09-16',
    PlannedArrival: '15:00',
  };
  const openVisit = {
    id: 'visit-1',
    propertyId: 'listing-a',
    visitTypeId: 'visit_type_cleaning',
    scheduledDate: '2026-09-16',
    status: 'SCHEDULED',
  };
  assert.equal(
    shouldAutoGrantAccess({
      booking,
      visits: [],
      today: '2026-09-16',
      nowTime: '14:59',
    }),
    false,
  );
  assert.equal(
    shouldAutoGrantAccess({
      booking,
      visits: [openVisit],
      today: '2026-09-16',
      nowTime: '15:00',
    }),
    false,
  );
  assert.equal(
    shouldAutoGrantAccess({
      booking: { ...booking, PlannedArrival: '13:00' },
      visits: [],
      today: '2026-09-16',
      nowTime: '13:00',
    }),
    true,
  );
  assert.equal(
    shouldAutoGrantAccess({
      booking: { ...booking, CheckInAccessGranted: true },
      visits: [],
      today: '2026-09-16',
      nowTime: '16:00',
    }),
    false,
  );
});

test('early access Slack copy names the guest without repeating the property ready text', () => {
  assert.equal(
    earlyCheckInAccessEnabledMessage('Filippo Paloschi'),
    'Acceso de early check-in habilitado. Guest: Filippo Paloschi',
  );
});

test('do not early check-in Slack copy bolds DO NOT', () => {
  assert.equal(
    doNotEarlyCheckInReadyMessage('San Marcos C', 'Caio Ferreira'),
    'San Marcos C lista pero indicada con *DO NOT* Early check-in. Guest: Caio Ferreira',
  );
});
