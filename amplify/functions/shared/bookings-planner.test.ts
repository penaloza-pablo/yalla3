import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alertsForPlannerBooking,
  ACCESS_FIELD_ID,
  computePlannerFields,
  defaultPlannerSettings,
  describePlannerBookingChanges,
  DO_NOT_EARLY_CHECK_IN,
  EARLY_CHECK_IN_ON,
  formatGiftCardValue,
  getReservationGuestCount,
  GIFT_CARD_OFF,
  guestyReservationMatchesPlannerPatch,
  isBookingsPlanDoubleOrTwoSinglesAsk,
  isBookingsPlanSofaCamaUnknownAsk,
  isBookingsPlanWithAlerts,
  isDoNotEarlyCheckIn,
  isEarlyCheckInEnabled,
  isGiftCardFrozen,
  isAlwaysSofaBedNa,
  LINEN_VALUES,
  plannerFieldsChanged,
  plannerStateChanged,
  plannerWarningsChanged,
  resolveEarlyCheckInMode,
  shouldWritePlannerToGuesty,
  sofaCamaUnknownWarningsFor,
  SOFA_CAMA_UNKNOWN_WARNING_TEXT_ES,
  VERDEJO_LISTING_ID,
} from './bookings-planner';

const enabledSettings = {
  ...defaultPlannerSettings(),
  plannerEnabled: true,
};

const baseItem = {
  ReservationID: 'res-1',
  ListingID: 'listing-open',
  Status: 'confirmed',
  CheckInDate: '2026-09-16',
  CheckOutDate: '2026-09-20',
  Guests: 1,
  Nights: 4,
  GiftCard: '1 - 20/09',
  GiftCardOn: true,
  Linen: LINEN_VALUES.NO,
  EarlyCheckIn: '',
  EarlyCheckInOn: false,
  Access: '1234',
};

test('guest count sums adults, children and infants', () => {
  assert.equal(
    getReservationGuestCount({
      numberOfAdults: 2,
      numberOfChildren: 1,
      numberOfInfants: 1,
    }),
    4,
  );
  assert.equal(
    getReservationGuestCount({
      numberOfGuests: {
        numberOfAdults: 1,
        numberOfChildren: 2,
        numberOfInfants: 0,
      },
    }),
    3,
  );
  assert.equal(getReservationGuestCount({ guestsCount: 5 }), 5);
  assert.equal(
    getReservationGuestCount({
      guestsCount: 1,
      numberOfAdults: 2,
    }),
    2,
  );
});

test('gift card freeze starts at 08:00 Madrid on check-in day', () => {
  assert.equal(isGiftCardFrozen('2026-09-15', '2026-09-15', '07:59'), false);
  assert.equal(isGiftCardFrozen('2026-09-15', '2026-09-15', '08:00'), true);
  assert.equal(isGiftCardFrozen('2026-09-16', '2026-09-15', '23:00'), false);
  assert.equal(isGiftCardFrozen('2026-09-14', '2026-09-15', '00:00'), true);
});

test('recalculates gift card and sofa when guests change before freeze', () => {
  const patch = computePlannerFields({
    item: { ...baseItem, Guests: 3 },
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '10:00',
  });
  assert.equal(patch.giftCard, formatGiftCardValue(3, '2026-09-20'));
  assert.equal(patch.linen, LINEN_VALUES.YES);
});

test('keeps sofa yes when guest count later drops', () => {
  const patch = computePlannerFields({
    item: { ...baseItem, Guests: 1, Linen: LINEN_VALUES.YES },
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '10:00',
  });
  assert.equal(patch.linen, LINEN_VALUES.YES);
});

test('does not force sofa for two guests', () => {
  const patch = computePlannerFields({
    item: { ...baseItem, Guests: 2, Linen: LINEN_VALUES.NO },
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '10:00',
  });
  assert.equal(patch.linen, LINEN_VALUES.NO);
});

test('freezes gift card and sofa from 08:00 on check-in day', () => {
  const patch = computePlannerFields({
    item: {
      ...baseItem,
      CheckInDate: '2026-09-15',
      Guests: 3,
      GiftCard: '1 - 20/09',
      Linen: LINEN_VALUES.NO,
    },
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '08:00',
  });
  assert.equal(patch.giftCard, '1 - 20/09');
  assert.equal(patch.linen, LINEN_VALUES.NO);
});

test('updates gift card before 08:00 on check-in day', () => {
  const patch = computePlannerFields({
    item: {
      ...baseItem,
      CheckInDate: '2026-09-15',
      Guests: 2,
      GiftCard: '1 - 20/09',
    },
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '07:30',
  });
  assert.equal(patch.giftCard, formatGiftCardValue(2, '2026-09-20'));
});

test('two-night stays stay without gift card', () => {
  const patch = computePlannerFields({
    item: {
      ...baseItem,
      Nights: 2,
      CheckOutDate: '2026-09-17',
      Guests: 2,
      GiftCard: GIFT_CARD_OFF,
    },
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '10:00',
  });
  assert.equal(patch.giftCard, GIFT_CARD_OFF);
});

test('plannerFieldsChanged ignores check-in time noise', () => {
  const patch = computePlannerFields({
    item: baseItem,
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '10:00',
  });
  assert.equal(plannerFieldsChanged(baseItem, patch), false);
});

test('describePlannerBookingChanges lists guest and card diffs', () => {
  const after = { ...baseItem, Guests: 2 };
  const patch = computePlannerFields({
    item: after,
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '10:00',
  });
  const lines = describePlannerBookingChanges(baseItem, after, patch);
  assert.ok(lines.some((line) => line.includes('Huéspedes: 1 -> 2')));
  assert.ok(lines.some((line) => line.includes('Tarjeta:')));
});

test('P2 rooms and listed apartments always use sofa n/a', () => {
  assert.equal(isAlwaysSofaBedNa('693c58109994960014f586d7', '203'), true);
  assert.equal(isAlwaysSofaBedNa('', 'Baranda'), true);
  assert.equal(isAlwaysSofaBedNa('', 'San Marcos C'), true);
  const patch = computePlannerFields({
    item: {
      ...baseItem,
      ListingID: '693c58109994960014f586d7',
      ListingNickname: '203',
      Guests: 1,
      Linen: LINEN_VALUES.NO,
    },
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '10:00',
  });
  assert.equal(patch.linen, LINEN_VALUES.NA);
});

test('does not slack planner initialization of empty gift and sofa', () => {
  const before = {
    ...baseItem,
    ListingID: '693c58109994960014f586d7',
    ListingNickname: '203',
    GiftCard: '',
    Linen: '',
    Nights: 2,
    CheckOutDate: '2026-09-18',
  };
  const patch = computePlannerFields({
    item: before,
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '10:00',
  });
  const lines = describePlannerBookingChanges(before, before, patch);
  assert.equal(
    lines.some((line) => line.startsWith('Tarjeta:') || line.startsWith('Sofá:')),
    false,
  );
});

test('does not warn about access when the code is already set', () => {
  const patch = computePlannerFields({
    item: {
      ...baseItem,
      Access: 'https://link.akiles.app/code',
      PlannerWarnings: ['gift_card_access_missing'],
      PlannerWarningCount: 1,
    },
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '10:00',
  });
  assert.equal(patch.warnings.includes('gift_card_access_missing'), false);
  assert.equal(
    plannerWarningsChanged(
      {
        ...baseItem,
        Access: 'https://link.akiles.app/code',
        PlannerWarnings: ['gift_card_access_missing'],
      },
      patch,
    ),
    true,
  );
});

test('persists dismissed 1-guest warning until guest count changes', () => {
  const item = {
    ...baseItem,
    Guests: 1,
    PlannerWarnings: ['single_guest'],
    PlannerDismissedWarnings: [],
  };
  const dismissed = computePlannerFields({
    item,
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '10:00',
    overrides: { dismissWarning: 'single_guest' },
  });
  assert.equal(dismissed.warnings.includes('single_guest'), false);
  assert.deepEqual(dismissed.dismissedWarnings, ['single_guest']);
  assert.equal(plannerFieldsChanged(item, dismissed), false);
  assert.equal(plannerStateChanged(item, dismissed), true);

  const stillOneGuest = computePlannerFields({
    item: {
      ...item,
      PlannerDismissedWarnings: ['single_guest'],
      PlannerWarnings: [],
    },
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '10:00',
  });
  assert.equal(stillOneGuest.warnings.includes('single_guest'), false);

  const laterMoreGuests = computePlannerFields({
    item: {
      ...item,
      Guests: 2,
      PlannerDismissedWarnings: ['single_guest'],
    },
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '10:00',
  });
  assert.equal(laterMoreGuests.dismissedWarnings.includes('single_guest'), false);

  const backToOneGuest = computePlannerFields({
    item: {
      ...item,
      Guests: 1,
      PlannerDismissedWarnings: laterMoreGuests.dismissedWarnings,
    },
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '10:00',
  });
  assert.equal(backToOneGuest.warnings.includes('single_guest'), true);
});

test('syncs Guesty when Dynamo already has the calculation', () => {
  const patch = computePlannerFields({
    item: baseItem,
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '10:00',
  });
  assert.equal(plannerFieldsChanged(baseItem, patch), false);
  assert.equal(
    shouldWritePlannerToGuesty({
      syncGuesty: true,
      notesFrozen: false,
      status: 'confirmed',
      plannerEnabled: true,
      inWindow: true,
      hasOverrides: false,
      fieldsChanged: false,
      remoteMatches: false,
    }),
    true,
  );
  assert.equal(
    shouldWritePlannerToGuesty({
      syncGuesty: true,
      notesFrozen: false,
      status: 'confirmed',
      plannerEnabled: true,
      inWindow: true,
      hasOverrides: false,
      fieldsChanged: false,
      remoteMatches: true,
    }),
    false,
  );
  assert.equal(
    shouldWritePlannerToGuesty({
      syncGuesty: true,
      notesFrozen: true,
      status: 'confirmed',
      plannerEnabled: true,
      inWindow: true,
      hasOverrides: false,
      fieldsChanged: true,
      remoteMatches: false,
    }),
    false,
  );
  assert.equal(
    guestyReservationMatchesPlannerPatch(
      {
        specialRequests: patch.giftCard,
        notes: { cleaning: patch.linen, other: patch.earlyCheckIn },
        customFields: [{ fieldId: ACCESS_FIELD_ID, value: patch.access }],
      },
      patch,
    ),
    true,
  );
  assert.equal(
    guestyReservationMatchesPlannerPatch(
      { notes: null, specialRequests: null },
      patch,
    ),
    false,
  );
});

test('do not early check-in is distinct from early check-in', () => {
  assert.equal(isEarlyCheckInEnabled('Early check-in'), true);
  assert.equal(isEarlyCheckInEnabled(DO_NOT_EARLY_CHECK_IN), false);
  assert.equal(isDoNotEarlyCheckIn(DO_NOT_EARLY_CHECK_IN), true);
  assert.equal(isDoNotEarlyCheckIn('Early check-in'), false);
  assert.equal(resolveEarlyCheckInMode(DO_NOT_EARLY_CHECK_IN, true), 'do_not');
  assert.equal(resolveEarlyCheckInMode(EARLY_CHECK_IN_ON, false), 'early');
  assert.equal(resolveEarlyCheckInMode('', false), 'none');
});

test('planner keeps do not early check-in unless agenda turns early on', () => {
  const kept = computePlannerFields({
    item: {
      ...baseItem,
      EarlyCheckIn: DO_NOT_EARLY_CHECK_IN,
      EarlyCheckInOn: false,
    },
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '10:00',
  });
  assert.equal(kept.earlyCheckIn, DO_NOT_EARLY_CHECK_IN);
  assert.equal(kept.earlyCheckInOn, false);

  const fromMode = computePlannerFields({
    item: baseItem,
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '10:00',
    overrides: { earlyCheckInMode: 'do_not' },
  });
  assert.equal(fromMode.earlyCheckIn, DO_NOT_EARLY_CHECK_IN);
  assert.equal(fromMode.earlyCheckInOn, false);

  const fromAgenda = computePlannerFields({
    item: {
      ...baseItem,
      EarlyCheckIn: DO_NOT_EARLY_CHECK_IN,
      EarlyCheckInOn: false,
    },
    settings: enabledSettings,
    today: '2026-09-15',
    nowTime: '10:00',
    overrides: { earlyCheckInOn: true },
  });
  assert.equal(fromAgenda.earlyCheckIn, EARLY_CHECK_IN_ON);
  assert.equal(fromAgenda.earlyCheckInOn, true);
});

test('Booking Plan sofa-cama unknown warnings cover sofa bed ask and Verdejo double-or-two-singles', () => {
  const verdejo = {
    ReservationID: 'res-verdejo',
    ListingID: VERDEJO_LISTING_ID,
    Status: 'confirmed',
    Linen: '',
    Access: '1234',
  };
  const sofaBed = {
    ReservationID: 'res-sofa',
    ListingID: 'listing-open',
    Status: 'confirmed',
    Linen: '',
  };

  assert.equal(isBookingsPlanSofaCamaUnknownAsk(verdejo), true);
  assert.equal(isBookingsPlanDoubleOrTwoSinglesAsk(verdejo), true);
  assert.deepEqual(sofaCamaUnknownWarningsFor(verdejo), [
    'double_or_two_singles_ask',
  ]);
  assert.equal(
    SOFA_CAMA_UNKNOWN_WARNING_TEXT_ES.double_or_two_singles_ask,
    'Pregunta al huésped si quiere cama doble o dos individuales.',
  );

  assert.equal(isBookingsPlanSofaCamaUnknownAsk(sofaBed), true);
  assert.equal(isBookingsPlanDoubleOrTwoSinglesAsk(sofaBed), false);
  assert.deepEqual(sofaCamaUnknownWarningsFor(sofaBed), ['linen_ask_guest']);
  assert.equal(
    SOFA_CAMA_UNKNOWN_WARNING_TEXT_ES.linen_ask_guest,
    'Consulta al huésped lo del sofá cama.',
  );

  assert.equal(
    isBookingsPlanSofaCamaUnknownAsk({
      ...verdejo,
      Linen: LINEN_VALUES.DOUBLE,
    }),
    false,
  );
  assert.equal(
    isBookingsPlanSofaCamaUnknownAsk({
      ...sofaBed,
      Linen: LINEN_VALUES.NO,
    }),
    false,
  );
  assert.equal(
    isBookingsPlanSofaCamaUnknownAsk({
      ...verdejo,
      Status: 'inquiry',
    }),
    false,
  );
});

test('Booking Plan upcoming alerts split sofa, access and single-guest warnings', () => {
  const mixed = {
    ReservationID: 'res-mixed',
    ListingID: 'listing-open',
    Status: 'confirmed',
    Linen: '',
    Access: '',
    Guests: 1,
    PlannerWarnings: ['gift_card_access_missing', 'single_guest'],
  };
  assert.equal(isBookingsPlanWithAlerts(mixed), true);
  assert.deepEqual(alertsForPlannerBooking(mixed), [
    {
      type: 'ACCESS_LINK',
      code: 'access_link_missing',
      value: '',
      warning: 'Configura el código o enlace de Access',
    },
    {
      type: 'SINGLE_GUEST_VERIFICATION',
      code: 'single_guest',
      value: 'PENDING',
      warning: 'Valida con el huésped esta reserva de 1 guest.',
    },
    {
      type: 'SOFA_BED',
      code: 'linen_ask_guest',
      value: '?',
      warning: 'Consulta al huésped lo del sofá cama.',
    },
  ]);

  const accessFilled = alertsForPlannerBooking({
    ...mixed,
    Access: 'https://access.example/code',
    Linen: LINEN_VALUES.NO,
    PlannerWarnings: ['gift_card_access_missing', 'single_guest'],
  });
  assert.deepEqual(accessFilled, [
    {
      type: 'SINGLE_GUEST_VERIFICATION',
      code: 'single_guest',
      value: 'PENDING',
      warning: 'Valida con el huésped esta reserva de 1 guest.',
    },
  ]);

  assert.equal(
    isBookingsPlanWithAlerts({ ...mixed, Status: 'inquiry' }),
    false,
  );
  assert.deepEqual(
    alertsForPlannerBooking({
      ReservationID: 'res-verdejo',
      ListingID: VERDEJO_LISTING_ID,
      Status: 'confirmed',
      Linen: '',
      Access: '1234',
    }),
    [
      {
        type: 'SOFA_BED',
        code: 'double_or_two_singles_ask',
        value: '?',
        warning:
          'Pregunta al huésped si quiere cama doble o dos individuales.',
      },
    ],
  );
});

