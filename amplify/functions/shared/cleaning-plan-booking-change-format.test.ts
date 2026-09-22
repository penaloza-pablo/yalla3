import assert from 'node:assert/strict';
import test from 'node:test';
import {
  candidateCleaningPlanDatesForBookingChange,
  describeVisitBookingContextChanges,
  formatCleaningPlanDateDdMm,
  plannerFieldsAffectCleaningContext,
} from './cleaning-plan-booking-change-format';

test('formats plan dates as dd/mm', () => {
  assert.equal(formatCleaningPlanDateDdMm('2026-09-18'), '18/09');
  assert.equal(formatCleaningPlanDateDdMm('2026-09-17'), '17/09');
});

test('Maria Martel case includes the closed plan date even without a previous reservation', () => {
  const dates = candidateCleaningPlanDatesForBookingChange({
    currentCheckIn: '2026-09-17',
    lookbackDays: 1,
    today: '2026-09-16',
  });
  assert.deepEqual(dates, ['2026-09-16', '2026-09-17']);
});

test('check-in move covers the previous and new cleaning days', () => {
  const dates = candidateCleaningPlanDatesForBookingChange({
    currentCheckIn: '2026-09-17',
    previousCheckIn: '2026-09-18',
    lookbackDays: 1,
    today: '2026-09-16',
  });
  assert.ok(dates.includes('2026-09-17'));
  assert.ok(dates.includes('2026-09-18'));
});

test('describes Baranda check-in rewrite the way ops expects', () => {
  const lines = describeVisitBookingContextChanges(
    'Clean Baranda',
    {
      confirmationCode: 'OLD',
      checkInDate: '2026-09-18',
      checkOutDate: '2026-09-21',
      guestCount: 4,
      giftCardLabel: 'Sin tarjeta',
      hasBookingGap: true,
      sofaBedYes: false,
    },
    {
      confirmationCode: 'MARIA',
      checkInDate: '2026-09-17',
      checkOutDate: '2026-09-20',
      guestCount: 4,
      giftCardLabel: 'Sin tarjeta',
      hasBookingGap: false,
      sofaBedYes: false,
    },
  );
  assert.ok(
    lines.includes('Clean Baranda: antes check-in 18/09 y ahora 17/09'),
  );
  assert.ok(lines.includes('Clean Baranda: con hueco → sin hueco'));
});

test('same-day booking identity without date change still reports the new reservation', () => {
  const lines = describeVisitBookingContextChanges(
    'Clean Baranda',
    {
      confirmationCode: 'OLD',
      checkInDate: '2026-09-17',
      checkOutDate: '2026-09-19',
      guestCount: 2,
      giftCardLabel: 'Sin tarjeta',
      hasBookingGap: false,
      sofaBedYes: false,
    },
    {
      confirmationCode: 'MARIA',
      checkInDate: '2026-09-17',
      checkOutDate: '2026-09-19',
      guestCount: 2,
      giftCardLabel: 'Sin tarjeta',
      hasBookingGap: false,
      sofaBedYes: false,
    },
  );
  assert.deepEqual(lines, ['Clean Baranda: reserva OLD → MARIA']);
});

test('ignores identical booking context', () => {
  const snapshot = {
    confirmationCode: 'ABC',
    checkInDate: '2026-09-17',
    checkOutDate: '2026-09-20',
    guestCount: 4,
    giftCardLabel: 'Sin tarjeta',
    hasBookingGap: false,
    sofaBedYes: false,
  };
  assert.deepEqual(
    describeVisitBookingContextChanges('Clean Baranda', snapshot, snapshot),
    [],
  );
});

test('does not reopen yesterday when the webhook is for today check-in', () => {
  const dates = candidateCleaningPlanDatesForBookingChange({
    currentCheckIn: '2026-09-22',
    previousCheckIn: '2026-09-22',
    lookbackDays: 4,
    today: '2026-09-22',
  });
  assert.deepEqual(dates, ['2026-09-22']);
});

test('P2-211 noise webhook does not look like a check-in move', () => {
  const previous = {
    checkInDate: '2026-09-22',
    checkOutDate: '2026-09-25',
    guestCount: 2,
    giftCard: '',
    linen: '',
    confirmationCode: 'HMTQFYXHZ9',
    listingId: '693c3ad20c4f0500133cd017',
    listingNickname: '211',
    status: 'confirmed',
  };
  assert.equal(plannerFieldsAffectCleaningContext(previous, previous), false);
  assert.equal(
    plannerFieldsAffectCleaningContext(previous, {
      ...previous,
      checkInDate: '2026-09-21',
    }),
    true,
  );
});
