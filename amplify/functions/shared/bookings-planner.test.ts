import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computePlannerFields,
  defaultPlannerSettings,
  describePlannerBookingChanges,
  formatGiftCardValue,
  getReservationGuestCount,
  GIFT_CARD_OFF,
  isGiftCardFrozen,
  LINEN_VALUES,
  plannerFieldsChanged,
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
