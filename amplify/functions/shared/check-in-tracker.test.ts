import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyTrackerFlagPatch,
  CHECK_IN_TRACKER_MAX_RANGE_DAYS,
  isBlockingVisitForCheckIn,
  mapCheckInTrackerRow,
  resolveCheckInTrackerStatus,
  resolveTrackerDateWindow,
  shouldIncludeBooking,
} from './check-in-tracker';

const booking = {
  ReservationID: 'res-1',
  ListingID: 'listing-a',
  GuestName: 'Ada',
  ListingNickname: 'Arenal 12',
  Status: 'confirmed',
  CheckInDate: '2026-09-16',
  CheckOutDate: '2026-09-20',
};

const visit = (overrides: Record<string, unknown> = {}) => ({
  id: 'visit-1',
  propertyId: 'listing-a',
  visitTypeId: 'visit_type_cleaning',
  scheduledDate: '2026-09-16',
  status: 'SCHEDULED',
  title: 'Regular',
  ...overrides,
});

test('open same-day cleaning blocks until the visit is closed', () => {
  assert.equal(
    isBlockingVisitForCheckIn(visit(), '2026-09-16', 'listing-a'),
    true,
  );
  assert.equal(
    isBlockingVisitForCheckIn(
      visit({ status: 'COMPLETED' }),
      '2026-09-16',
      'listing-a',
    ),
    false,
  );
});

test('open cleaning from the previous day still blocks when there is no same-day turnover', () => {
  assert.equal(
    isBlockingVisitForCheckIn(
      visit({ scheduledDate: '2026-09-15' }),
      '2026-09-16',
      'listing-a',
    ),
    true,
  );
  assert.equal(
    resolveCheckInTrackerStatus(
      { accessGranted: false, guestEntered: false },
      true,
    ),
    'jobs_pending',
  );
});

test('closed previous-day cleaning leaves the property ready', () => {
  const row = mapCheckInTrackerRow(booking, [
    visit({ scheduledDate: '2026-09-15', status: 'COMPLETED' }),
  ]);
  assert.equal(row.status, 'property_ready');
  assert.equal(row.openVisits.length, 0);
});

test('future visits and other properties do not block', () => {
  assert.equal(
    isBlockingVisitForCheckIn(
      visit({ scheduledDate: '2026-09-17' }),
      '2026-09-16',
      'listing-a',
    ),
    false,
  );
  assert.equal(
    isBlockingVisitForCheckIn(
      visit({ scheduledDate: '2026-09-14' }),
      '2026-09-16',
      'listing-a',
    ),
    false,
  );
  assert.equal(
    isBlockingVisitForCheckIn(
      visit({ propertyId: 'listing-b' }),
      '2026-09-16',
      'listing-a',
    ),
    false,
  );
});

test('open maintenance on check-in day blocks; cancelled visits do not', () => {
  assert.equal(
    isBlockingVisitForCheckIn(
      visit({ visitTypeId: 'visit_type_maintenance', teamId: 'team_maintenance' }),
      '2026-09-16',
      'listing-a',
    ),
    true,
  );
  assert.equal(
    isBlockingVisitForCheckIn(
      visit({ status: 'CANCELLED' }),
      '2026-09-16',
      'listing-a',
    ),
    false,
  );
});

test('manual flags advance only after jobs are clear', () => {
  assert.equal(
    resolveCheckInTrackerStatus(
      { accessGranted: true, guestEntered: true },
      true,
    ),
    'jobs_pending',
  );
  assert.equal(
    resolveCheckInTrackerStatus(
      { accessGranted: true, guestEntered: false },
      false,
    ),
    'access_granted',
  );
  assert.equal(
    resolveCheckInTrackerStatus(
      { accessGranted: true, guestEntered: true },
      false,
    ),
    'guest_entered',
  );
});

test('guest entered requires access; clearing access also clears entered', () => {
  const rejected = applyTrackerFlagPatch(
    { accessGranted: false, guestEntered: false },
    { guestEntered: true },
  );
  assert.equal(rejected.ok, false);

  const both = applyTrackerFlagPatch(
    { accessGranted: false, guestEntered: false },
    { accessGranted: true, guestEntered: true },
  );
  assert.equal(both.ok, true);
  if (both.ok) {
    assert.equal(both.flags.accessGranted, true);
    assert.equal(both.flags.guestEntered, true);
  }

  const undo = applyTrackerFlagPatch(
    { accessGranted: true, guestEntered: true },
    { accessGranted: false },
  );
  assert.equal(undo.ok, true);
  if (undo.ok) {
    assert.equal(undo.flags.accessGranted, false);
    assert.equal(undo.flags.guestEntered, false);
  }
});

test('only confirmed bookings are tracked', () => {
  assert.equal(shouldIncludeBooking(booking), true);
  assert.equal(shouldIncludeBooking({ ...booking, Status: 'inquiry' }), false);
  assert.equal(shouldIncludeBooking({ ...booking, Status: 'cancelled' }), false);
});

test('tracker date window accepts a single day or a bounded range', () => {
  assert.deepEqual(
    resolveTrackerDateWindow({ today: '2026-09-16' }),
    { ok: true, from: '2026-09-16', to: '2026-09-16' },
  );
  assert.deepEqual(
    resolveTrackerDateWindow({ date: '2026-09-20', today: '2026-09-16' }),
    { ok: true, from: '2026-09-20', to: '2026-09-20' },
  );
  assert.deepEqual(
    resolveTrackerDateWindow({
      from: '2026-09-16',
      to: '2026-09-22',
      today: '2026-09-16',
    }),
    { ok: true, from: '2026-09-16', to: '2026-09-22' },
  );
  const tooWide = resolveTrackerDateWindow({
    from: '2026-09-01',
    to: '2026-09-30',
    today: '2026-09-16',
  });
  assert.equal(tooWide.ok, false);
  const inverted = resolveTrackerDateWindow({
    from: '2026-09-22',
    to: '2026-09-16',
    today: '2026-09-16',
  });
  assert.deepEqual(inverted, {
    ok: true,
    from: '2026-09-16',
    to: '2026-09-22',
  });
  assert.equal(CHECK_IN_TRACKER_MAX_RANGE_DAYS, 14);
});
