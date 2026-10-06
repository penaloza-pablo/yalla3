import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RODAS_LISTING_ID,
  applyGuestyLockCodeToBooking,
  extractGuestyGuestAccessCode,
  isRodasProperty,
} from './guesty-lock-access';

const guestCodePayload = {
  codes: [
    {
      code: '9999',
      purpose: 'GUEST_BACKUP',
      status: 'ACTIVE',
    },
    {
      code: '1389',
      purpose: 'GUEST',
      status: 'ACTIVE',
    },
  ],
  locks: [{ id: 'lock-1', name: 'Rodas', provider: 'ttlock' }],
};

test('detects Rodas by listing id or nickname', () => {
  assert.equal(isRodasProperty(RODAS_LISTING_ID, 'Other'), true);
  assert.equal(isRodasProperty('other', 'Rodas'), true);
  assert.equal(isRodasProperty('other', 'rodas'), true);
  assert.equal(isRodasProperty('other', 'Esperanza 9'), false);
});

test('extracts the Guesty Locks Manager GUEST code and ignores backup', () => {
  assert.equal(extractGuestyGuestAccessCode(guestCodePayload), '1389');
  assert.equal(
    extractGuestyGuestAccessCode({ data: guestCodePayload }),
    '1389',
  );
  assert.equal(
    extractGuestyGuestAccessCode({
      codes: [{ code: '1111', purpose: 'GUEST_BACKUP' }],
    }),
    '',
  );
});

test('copies the guest code into Access only for Rodas', async () => {
  const calls: string[] = [];
  const fetchCode = async (reservationId: string) => {
    calls.push(reservationId);
    return '1389';
  };
  const filled = await applyGuestyLockCodeToBooking(
    {
      ReservationID: '6a9752a45539ae37e25d41f7',
      ListingID: RODAS_LISTING_ID,
      ListingNickname: 'Rodas',
      Access: '',
    },
    fetchCode,
  );
  assert.equal(filled.Access, '1389');
  assert.deepEqual(calls, ['6a9752a45539ae37e25d41f7']);

  const skipped = await applyGuestyLockCodeToBooking(
    {
      ReservationID: 'other-res',
      ListingID: 'other-listing',
      ListingNickname: 'Verdejo',
      Access: '',
    },
    fetchCode,
  );
  assert.equal(skipped.Access, '');
  assert.deepEqual(calls, ['6a9752a45539ae37e25d41f7']);
});
