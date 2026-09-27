import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ESPERANZA_9_LISTING_ID,
  VIKEY_OPENING_LINK_FIELD_ID,
  applyVikeyOpeningLinkToBooking,
  extractVikeyOpeningLink,
  isEsperanza9Property,
  isVikeyOpeningLink,
  resolveEsperanza9Access,
} from './vikey-access';

const openingLink = 'https://guest.vikey.it/reservations/NTMI3LI6';
const checkinLink = 'https://guest.vikey.it/checkin/NTMI3LI6';
const hmhnPayload = {
  event: 'reservation.updated',
  reservation: {
    listingId: ESPERANZA_9_LISTING_ID,
    customFields: [
      { fieldId: '6ab9046a5f0554002a3d33e0', value: '4242308767' },
      {
        fieldId: '6ab9046b2520d20012cd746f',
        value: 'https://api.vikey.it/api/v3/checkin/toggle/NTMI3LI6/token-a',
      },
      {
        fieldId: '6ab9046a1941a7001247670a',
        value: 'https://api.vikey.it/api/v3/checkin/toggle/NTMI3LI6/token-b',
      },
      { fieldId: '6ab9046c1941a7001247673e', value: 'NTMI3LI6' },
      { fieldId: VIKEY_OPENING_LINK_FIELD_ID, value: openingLink },
      { fieldId: '6ab9046d5f0554002a3d33fc', value: checkinLink },
    ],
  },
};

test('detects Esperanza 9 by listing id or nickname', () => {
  assert.equal(isEsperanza9Property(ESPERANZA_9_LISTING_ID, 'Other'), true);
  assert.equal(isEsperanza9Property('other', 'Esperanza 9'), true);
  assert.equal(isEsperanza9Property('other', 'esperanza  9'), true);
  assert.equal(isEsperanza9Property('other', 'Verdejo'), false);
});

test('extracts vikey_opening_link from the Guesty webhook custom fields', () => {
  assert.equal(extractVikeyOpeningLink(hmhnPayload.reservation), openingLink);
  assert.equal(
    extractVikeyOpeningLink({
      customFields: [
        { key: 'vikey_checkin_link', value: checkinLink },
        { key: 'vikey_opening_link', value: ` ${openingLink} ` },
      ],
    }),
    openingLink,
  );
});

test('falls back to guest.vikey.it/reservations and ignores check-in/toggle URLs', () => {
  assert.equal(isVikeyOpeningLink(openingLink), true);
  assert.equal(isVikeyOpeningLink(checkinLink), false);
  assert.equal(
    extractVikeyOpeningLink({
      customFields: [
        { fieldId: 'other', value: checkinLink },
        {
          fieldId: 'legacy',
          value: ' https://guest.vikey.it/reservations/1ULL5IHL',
        },
      ],
    }),
    'https://guest.vikey.it/reservations/1ULL5IHL',
  );
});

test('copies the opening link into Access only for Esperanza 9', () => {
  assert.equal(
    resolveEsperanza9Access({
      listingId: ESPERANZA_9_LISTING_ID,
      listingNickname: 'Esperanza 9',
      access: '',
      reservation: hmhnPayload.reservation,
    }),
    openingLink,
  );
  assert.equal(
    resolveEsperanza9Access({
      listingId: 'other-listing',
      listingNickname: 'Verdejo',
      access: '',
      reservation: hmhnPayload.reservation,
    }),
    '',
  );
});

test('hydrates Access from RawPayload on Esperanza 9 bookings', () => {
  const next = applyVikeyOpeningLinkToBooking({
    ListingID: ESPERANZA_9_LISTING_ID,
    ListingNickname: 'Esperanza 9',
    Access: '',
    RawPayload: JSON.stringify(hmhnPayload),
  });
  assert.equal(next.Access, openingLink);
});
