import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyLiveReservationToBooking,
  bookingHasPayout,
  includePayoutInReportMonth,
  mapReportBooking,
  PAYOUT_REPORT_MONTH_OVERRIDES,
  payoutOverrideReservationIdsForMonth,
  refreshPayoutBookingSnapshot,
  shouldRefreshPayoutSnapshot,
} from './property-reports';

const TODAY = '2026-09-23';
const NOW = Date.parse('2026-09-23T16:30:00.000Z');

const payoutCase = (input: {
  status: string;
  hostPayout: number;
  hostServiceFee?: number;
  fareCleaning?: number;
  totalPaid?: number;
  payments: Array<Record<string, unknown>>;
  checkOut: string;
  checkIn?: string;
  canceledAt?: string;
  updatedAt?: string;
  itemStatus?: string;
}) => {
  const reservation = {
    status: input.status,
    confirmationCode: 'TEST',
    _id: 'res-1',
    canceledAt: input.canceledAt,
    checkInDateLocalized: input.checkIn ?? '2026-09-23',
    checkOutDateLocalized: input.checkOut,
    guest: { fullName: 'Test Guest' },
    money: {
      hostPayout: input.hostPayout,
      hostServiceFee: input.hostServiceFee ?? 0,
      fareCleaning: input.fareCleaning ?? 0,
      totalPaid: input.totalPaid ?? 0,
      currency: 'EUR',
      payments: input.payments,
    },
  };
  const item = {
    ReservationID: 'res-1',
    Status: input.itemStatus ?? input.status,
    GuestName: 'Test Guest',
    CheckInDate: input.checkIn ?? '2026-09-23',
    CheckOutDate: input.checkOut,
    CanceledAt: input.canceledAt,
    UpdatedAt: input.updatedAt,
    ConfirmationCode: 'TEST',
    Currency: 'EUR',
  };
  return { reservation, item };
};

const humaira = payoutCase({
  status: 'confirmed',
  hostPayout: 540.8,
  hostServiceFee: 99.2,
  fareCleaning: 115,
  totalPaid: 0,
  payments: [{ status: 'PENDING', amount: 540.8, payoutId: null }],
  checkIn: '2026-08-06',
  checkOut: '2026-08-11',
  updatedAt: '2026-07-01T02:14:53.535Z',
});

const camilo = payoutCase({
  status: 'canceled',
  hostPayout: 245.89,
  hostServiceFee: 45.11,
  fareCleaning: 48,
  totalPaid: 0,
  payments: [{ status: 'CANCELLED', amount: 390.39, payoutId: null }],
  checkIn: '2026-09-23',
  checkOut: '2026-09-26',
  canceledAt: '2026-09-22T23:02:30.600Z',
  updatedAt: '2026-09-22T23:03:14.960Z',
});

test('Humaira: quoted pending payout after checkout is excluded', () => {
  assert.equal(
    bookingHasPayout(humaira.reservation, humaira.item, TODAY),
    false,
  );
});

test('Camilo: canceled with retained hostPayout is included', () => {
  assert.equal(bookingHasPayout(camilo.reservation, camilo.item, TODAY), true);
  const mapped = mapReportBooking(camilo.item, camilo.reservation);
  assert.equal(mapped.hostPayout, 245.89);
  assert.equal(mapped.hostServiceFee, 45.11);
  assert.equal(mapped.fareCleaning, 48);
});

test('full cancel with hostPayout 0 stays out of the report', () => {
  const tanya = payoutCase({
    status: 'canceled',
    hostPayout: 0,
    payments: [{ status: 'CANCELLED', amount: 476.58 }],
    checkOut: '2026-08-31',
    canceledAt: '2026-06-07T17:43:59.480Z',
  });
  assert.equal(bookingHasPayout(tanya.reservation, tanya.item, TODAY), false);
});

test('collected stay with SUCCEEDED payment is included after checkout', () => {
  const anders = payoutCase({
    status: 'confirmed',
    hostPayout: 469.82,
    hostServiceFee: 86.18,
    totalPaid: 469.82,
    payments: [
      {
        status: 'SUCCEEDED',
        amount: 469.82,
        payoutId: 'M-UBKOW7ZKD2Q2MLHK3KLPDVFYBBKXV4E7',
      },
    ],
    checkIn: '2026-08-05',
    checkOut: '2026-08-09',
    updatedAt: '2026-08-23T07:16:40.543Z',
  });
  assert.equal(bookingHasPayout(anders.reservation, anders.item, TODAY), true);
  assert.equal(
    shouldRefreshPayoutSnapshot(anders.reservation, anders.item, NOW),
    false,
  );
});

test('upcoming confirmed quote is included before checkout', () => {
  const upcoming = payoutCase({
    status: 'confirmed',
    hostPayout: 300,
    payments: [{ status: 'PENDING', amount: 300 }],
    checkIn: '2026-09-28',
    checkOut: '2026-10-02',
  });
  assert.equal(
    bookingHasPayout(upcoming.reservation, upcoming.item, TODAY),
    true,
  );
});

test('inquiry never enters the payout table', () => {
  const inquiry = payoutCase({
    status: 'inquiry',
    hostPayout: 640,
    payments: [{ status: 'PENDING', amount: 640 }],
    checkOut: '2026-10-02',
  });
  assert.equal(
    bookingHasPayout(inquiry.reservation, inquiry.item, TODAY),
    false,
  );
});

test('canceled retention stays included after checkout dates pass', () => {
  const afterStay = payoutCase({
    status: 'canceled',
    hostPayout: 245.89,
    payments: [{ status: 'CANCELLED', amount: 390.39 }],
    checkIn: '2026-09-01',
    checkOut: '2026-09-04',
    canceledAt: '2026-09-01T08:00:00.000Z',
  });
  assert.equal(
    bookingHasPayout(afterStay.reservation, afterStay.item, TODAY),
    true,
  );
});

test('live canceled payload wins over a stale confirmed Status', () => {
  const stale = payoutCase({
    status: 'canceled',
    itemStatus: 'confirmed',
    hostPayout: 120,
    payments: [{ status: 'CANCELLED', amount: 200 }],
    checkOut: '2026-09-26',
    canceledAt: '2026-09-22T23:02:30.600Z',
  });
  assert.equal(bookingHasPayout(stale.reservation, stale.item, TODAY), true);
});

test('Humaira-style snapshot is refreshed; settled and zero-cancel are not', () => {
  assert.equal(
    shouldRefreshPayoutSnapshot(humaira.reservation, humaira.item, NOW),
    true,
  );
  assert.equal(
    shouldRefreshPayoutSnapshot(camilo.reservation, camilo.item, NOW),
    true,
  );
  const freshCamilo = {
    ...camilo.item,
    UpdatedAt: '2026-09-23T15:00:00.000Z',
  };
  assert.equal(
    shouldRefreshPayoutSnapshot(camilo.reservation, freshCamilo, NOW),
    false,
  );
  const tanya = payoutCase({
    status: 'canceled',
    hostPayout: 0,
    payments: [{ status: 'CANCELLED', amount: 100 }],
    checkOut: '2026-08-31',
    updatedAt: '2026-08-31T18:00:33.352Z',
  });
  assert.equal(
    shouldRefreshPayoutSnapshot(tanya.reservation, tanya.item, NOW),
    false,
  );
});

test('Guesty refresh with hostPayout 0 drops a stale quoted booking', async () => {
  const live = {
    _id: 'res-1',
    status: 'canceled',
    canceledAt: '2026-08-01T00:00:00.000Z',
    checkOutDateLocalized: '2026-08-11',
    money: {
      hostPayout: 0,
      hostServiceFee: 0,
      fareCleaning: 0,
      totalPaid: 0,
      payments: [{ status: 'CANCELLED', amount: 540.8 }],
    },
  };
  const nextItem = applyLiveReservationToBooking(humaira.item, live);
  assert.equal(nextItem.Status, 'canceled');
  assert.equal(bookingHasPayout(live, nextItem, TODAY), false);

  const refreshed = await refreshPayoutBookingSnapshot({
    item: humaira.item,
    reservation: humaira.reservation,
    nowMs: NOW,
    fetchLive: async () => live,
  });
  assert.equal(refreshed.item.Status, 'canceled');
  assert.equal(
    bookingHasPayout(refreshed.reservation, refreshed.item, TODAY),
    false,
  );
});

test('Nayandra Mattos payout is reported in September, not August', () => {
  const reservationId = '6a95793daf6fe76b0ba9b676';
  assert.equal(PAYOUT_REPORT_MONTH_OVERRIDES[reservationId], '2026-09');
  assert.deepEqual(payoutOverrideReservationIdsForMonth('2026-09'), [
    reservationId,
  ]);
  assert.deepEqual(payoutOverrideReservationIdsForMonth('2026-08'), []);

  const nayandra = payoutCase({
    status: 'confirmed',
    hostPayout: 226.36,
    hostServiceFee: 41.52,
    fareCleaning: 115,
    totalPaid: 226.36,
    payments: [
      {
        status: 'SUCCEEDED',
        amount: 226.36,
        payoutId: 'M-3X7MIJHEWNLXHZKKDC42IMYNV2TFM7FS',
      },
    ],
    checkIn: '2026-08-31',
    checkOut: '2026-09-02',
  });
  nayandra.item.ReservationID = reservationId;
  nayandra.reservation._id = reservationId;
  nayandra.reservation.confirmationCode = 'HMPBP9BP9N';
  nayandra.item.GuestName = 'Nayandra Mattos';

  assert.equal(
    includePayoutInReportMonth(
      reservationId,
      nayandra.reservation,
      nayandra.item,
      '2026-08',
      TODAY,
    ),
    false,
  );
  assert.equal(
    includePayoutInReportMonth(
      reservationId,
      nayandra.reservation,
      nayandra.item,
      '2026-09',
      TODAY,
    ),
    true,
  );
  assert.equal(
    includePayoutInReportMonth(
      reservationId,
      nayandra.reservation,
      nayandra.item,
      '2026-10',
      TODAY,
    ),
    false,
  );

  const mapped = mapReportBooking(nayandra.item, nayandra.reservation);
  assert.equal(mapped.checkInDate, '2026-08-31');
  assert.equal(mapped.checkOutDate, '2026-09-02');
  assert.equal(mapped.hostPayout, 226.36);
  assert.equal(mapped.hostServiceFee, 41.52);
  assert.equal(mapped.fareCleaning, 115);
  assert.equal(
    shouldRefreshPayoutSnapshot(nayandra.reservation, nayandra.item, NOW),
    false,
  );
});

test('month override keeps the payout in September even if later validation would drop it', () => {
  const reservationId = '6a95793daf6fe76b0ba9b676';
  const stale = payoutCase({
    status: 'confirmed',
    hostPayout: 226.36,
    hostServiceFee: 41.52,
    fareCleaning: 115,
    payments: [{ status: 'PENDING', amount: 226.36 }],
    checkIn: '2026-08-31',
    checkOut: '2026-09-02',
  });
  stale.item.ReservationID = reservationId;
  assert.equal(
    bookingHasPayout(stale.reservation, stale.item, TODAY),
    false,
  );
  assert.equal(
    includePayoutInReportMonth(
      reservationId,
      stale.reservation,
      stale.item,
      '2026-09',
      TODAY,
    ),
    true,
  );
});
