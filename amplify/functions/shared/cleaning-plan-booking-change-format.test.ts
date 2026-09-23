import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canReopenCleaningPlanForBookingChange,
  candidateCleaningPlanDatesForBookingChange,
  describeVisitBookingContextChanges,
  formatCleaningPlanBookingContextSlackText,
  formatCleaningPlanDateDdMm,
  plannerFieldsAffectCleaningContext,
  selectPlanVisitsForBookingContextChange,
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
  const block = describeVisitBookingContextChanges(
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
  assert.equal(block?.title, 'Clean Baranda');
  assert.ok(block?.facts.includes('Antes check-in 18/09, ahora 17/09'));
  assert.ok(block?.facts.includes('Antes con hueco, ahora sin hueco'));
});

test('same-day booking identity without date change still reports the new reservation', () => {
  const block = describeVisitBookingContextChanges(
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
  assert.deepEqual(block, {
    title: 'Clean Baranda',
    facts: ['Antes reserva OLD, ahora MARIA'],
  });
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
  assert.equal(
    describeVisitBookingContextChanges('Clean Baranda', snapshot, snapshot),
    null,
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
  assert.equal(
    plannerFieldsAffectCleaningContext(previous, {
      ...previous,
      guestCount: 3,
    }),
    true,
  );
});

test('today plan can reopen only before 10:00 Madrid', () => {
  assert.equal(
    canReopenCleaningPlanForBookingChange({
      plannedDate: '2026-09-22',
      today: '2026-09-22',
      nowTime: '09:59',
    }),
    true,
  );
  assert.equal(
    canReopenCleaningPlanForBookingChange({
      plannedDate: '2026-09-22',
      today: '2026-09-22',
      nowTime: '10:00',
    }),
    false,
  );
});

test('never reopens a past cleaning plan', () => {
  assert.equal(
    canReopenCleaningPlanForBookingChange({
      plannedDate: '2026-09-21',
      today: '2026-09-22',
      nowTime: '08:00',
    }),
    false,
  );
});

test('future cleaning plans can reopen after 10:00', () => {
  assert.equal(
    canReopenCleaningPlanForBookingChange({
      plannedDate: '2026-09-23',
      today: '2026-09-22',
      nowTime: '18:00',
    }),
    true,
  );
});

test('Esperanza 9 Slack diffs keep one visit per listing on the plan', () => {
  const selected = selectPlanVisitsForBookingContextChange(
    [
      {
        id: 'GST-6aaeedbf7ce34884c832a5b1',
        title: 'Clean Esperanza 9 + Recambio ambientador',
        propertyId: '6835cef04af0d8002845abdd',
      },
      {
        id: 'VISIT-RECONCILE-6a7d2fe332e6ffb928b1e835',
        title: 'Clean Esperanza 9',
        propertyId: '6835cef04af0d8002845abdd',
      },
    ],
    [
      {
        visitId: 'GST-6aaeedbf7ce34884c832a5b1',
        propertyId: '6835cef04af0d8002845abdd',
      },
    ],
  );
  assert.deepEqual(
    selected.map((visit) => visit.id),
    ['GST-6aaeedbf7ce34884c832a5b1'],
  );
});

test('formats the Esperanza 9 reopen Slack copy with a linked plan date', () => {
  const text = formatCleaningPlanBookingContextSlackText({
    dates: ['2026-09-23'],
    blocks: [
      {
        title: 'Clean Esperanza 9 + Recambio ambientador',
        facts: [
          'Antes check-in 23/09, ahora 26/09',
          'Antes tarjeta 1 - 26/09, ahora Sin tarjeta',
        ],
      },
    ],
    linkedDates: ['<https://app.example/?page=Cleaning%20Plan&planDate=2026-09-23|2026-09-23>'],
  });
  assert.equal(
    text,
    [
      'Se reabrió el plan de limpieza del 2026-09-23 por cambios en una reserva. Clean Esperanza 9 + Recambio ambientador:',
      '- Antes check-in 23/09, ahora 26/09',
      '- Antes tarjeta 1 - 26/09, ahora Sin tarjeta',
      '',
      'Revisar plan y volver a marcarlo como listo: <https://app.example/?page=Cleaning%20Plan&planDate=2026-09-23|2026-09-23>',
    ].join('\n'),
  );
});
