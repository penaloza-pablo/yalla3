import assert from 'node:assert/strict'
import test from 'node:test'
import { FORMULA_CATALOG_VARIABLES } from './property-report-formula'
import { defaultReportVisibility } from './property-report-settings'
import { includePayoutInReportMonth } from './property-reports'
import {
  CALENDAR_METRIC_IDS,
  applyCalendarMetrics,
  calendarMetricsForMonth,
  stayNights,
  type CalendarStayInput,
} from './calendar-occupancy'
import {
  computePropertyReportMetrics,
  type PropertyReportMetricInputs,
} from '../../../src/finance/property-report-metrics'

const UPDATED_AT = '2026-09-30T12:00:00.000Z'
const TODAY = '2026-09-30'

const stay = (overrides: Partial<CalendarStayInput> = {}): CalendarStayInput => ({
  reservationId: 'stay-1',
  unitId: 'almendro',
  status: 'confirmed',
  checkIn: '2026-08-25',
  checkOut: '2026-09-12',
  currency: 'EUR',
  hostPayout: 1800,
  hostServiceFee: 0,
  fareCleaning: 0,
  fareAccommodation: 1800,
  nightlyAccommodation: null,
  ...overrides,
})

const month = (
  period: string,
  stays: CalendarStayInput[],
  today = TODAY,
) =>
  calendarMetricsForMonth({
    propertyId: 'almendro',
    period,
    stays,
    today,
    updatedAt: UPDATED_AT,
  })

const reportInputs = (
  overrides: Partial<PropertyReportMetricInputs>,
): PropertyReportMetricInputs => ({
  paidByGuest: 0,
  channelFee: 0,
  otherIncomesNet: 0,
  payoutCleaningNet: 0,
  payoutCleaningGross: 0,
  cleaningFee: 0,
  cleaningPayoutVat: 0,
  accommodationGross: 0,
  accommodationPayoutVat: 0,
  accommodationNet: 0,
  cleaningNet: 0,
  cleaningKit: 0,
  cleaningIva: 0,
  maintenanceNet: 0,
  maintenanceIva: 0,
  servicesNet: 0,
  servicesIva: 0,
  otherExpensesNet: 0,
  otherExpensesIva: 0,
  otherIncomesIva: 0,
  bookingCount: 0,
  nights: 0,
  fiveStarReviewCount: 0,
  underFiveStarReviewCount: 0,
  rescuedUnderFiveStarReviewPercent: 0,
  allocatedLines: [],
  ...overrides,
})

test('las cuatro variables del informe no cambian y el payout sigue en el mes de check-in', () => {
  const metrics = computePropertyReportMetrics(
    reportInputs({
      paidByGuest: 1800,
      bookingCount: 1,
      nights: 18,
    }),
  )
  assert.equal(metrics.bookingCount, 1)
  assert.equal(metrics.paidByGuest, 1800)
  assert.equal(metrics.nights, 18)
  assert.equal(metrics.averageRatePerNight, 100)
  for (const id of CALENDAR_METRIC_IDS) {
    assert.equal(id in metrics, false)
  }
  const zeroNights = computePropertyReportMetrics(
    reportInputs({ paidByGuest: 50, nights: 0, bookingCount: 1 }),
  )
  assert.equal(zeroNights.averageRatePerNight, 0)
  assert.equal(zeroNights.nights, 0)
  assert.equal(zeroNights.paidByGuest, 50)

  const reservation = {
    status: 'confirmed',
    checkInDateLocalized: '2026-08-25',
    checkOutDateLocalized: '2026-09-12',
    money: {
      hostPayout: 1800,
      hostServiceFee: 0,
      currency: 'EUR',
      payments: [{ status: 'SUCCEEDED' }],
    },
  }
  const item = {
    Status: 'confirmed',
    CheckInDate: '2026-08-25',
    CheckOutDate: '2026-09-12',
    ReservationID: 'ordinary-stay',
  }
  assert.equal(
    includePayoutInReportMonth(
      'ordinary-stay',
      reservation,
      item,
      '2026-08',
      TODAY,
    ),
    true,
  )
  assert.equal(
    includePayoutInReportMonth(
      'ordinary-stay',
      reservation,
      item,
      '2026-09',
      TODAY,
    ),
    true,
  )
  assert.equal(
    includePayoutInReportMonth(
      '6a95793daf6fe76b0ba9b676',
      reservation,
      item,
      '2026-08',
      TODAY,
    ),
    false,
  )
  assert.equal(
    includePayoutInReportMonth(
      '6a95793daf6fe76b0ba9b676',
      reservation,
      item,
      '2026-09',
      TODAY,
    ),
    true,
  )

  const visibility = defaultReportVisibility()
  const selected = [
    ...visibility.property.metrics,
    ...visibility.management.metrics,
    ...visibility.owner.metrics,
  ] as string[]
  const formulaIds = FORMULA_CATALOG_VARIABLES as readonly string[]
  for (const id of CALENDAR_METRIC_IDS) {
    assert.equal(selected.includes(id), false)
    assert.equal(formulaIds.includes(id), false)
  }
})

test('del 25 de agosto al 12 de septiembre reparte 7 y 11 noches y 700 y 1100 euros', () => {
  assert.equal(stayNights('2026-08-25', '2026-09-12').length, 18)
  const august = month('2026-08', [stay()])
  const september = month('2026-09', [stay()])
  assert.equal(august.metrics.calendarOccupiedNights, '7')
  assert.equal(september.metrics.calendarOccupiedNights, '11')
  assert.equal(august.metrics.calendarPaidByGuest, '700.00')
  assert.equal(september.metrics.calendarPaidByGuest, '1100.00')
  assert.equal(august.metrics.calendarAveragePaidPerNight, '100.00')
  assert.equal(september.metrics.calendarAveragePaidPerNight, '100.00')
  assert.equal(august.metrics.calendarAccommodationRevenue, '700.00')
  assert.equal(september.metrics.calendarAccommodationRevenue, '1100.00')
  assert.equal(august.methods[0], 'prorated')
  const stored = applyCalendarMetrics(
    { paidByGuest: '1800', nights: '18', bookingCount: '1' },
    august,
  )
  assert.equal(stored.paidByGuest, '1800')
  assert.equal(stored.nights, '18')
  assert.equal(stored.bookingCount, '1')
  assert.equal(stored.calendarPaidByGuest, '700.00')
})

test('respeta tarifas nocturnas cuando cuadran con el alojamiento', () => {
  const variable = stay({
    checkIn: '2026-08-31',
    checkOut: '2026-09-02',
    hostPayout: 300,
    fareCleaning: 0,
    fareAccommodation: 300,
    nightlyAccommodation: [100, 200],
  })
  const august = month('2026-08', [variable])
  const september = month('2026-09', [variable])
  assert.equal(august.metrics.calendarOccupiedNights, '1')
  assert.equal(september.metrics.calendarOccupiedNights, '1')
  assert.equal(august.metrics.calendarAccommodationRevenue, '100.00')
  assert.equal(september.metrics.calendarAccommodationRevenue, '200.00')
  assert.equal(august.metrics.calendarPaidByGuest, '100.00')
  assert.equal(september.metrics.calendarPaidByGuest, '200.00')
  assert.equal(august.methods[0], 'nightly')
})

test('varios payouts o ajustes de la misma reserva no duplican noches ni importe', () => {
  const first = stay()
  const duplicate = stay()
  const august = month('2026-08', [first, duplicate])
  assert.equal(august.metrics.calendarOccupiedNights, '7')
  assert.equal(august.metrics.calendarPaidByGuest, '700.00')
  assert.equal(august.reservations.length, 1)

  const refunded = stay({ hostPayout: 1600 })
  const conflict = month('2026-08', [first, refunded])
  assert.equal(conflict.metrics.calendarOccupiedNights, '7')
  assert.equal(conflict.metrics.calendarPaidByGuest, null)
  assert.equal(conflict.metrics.calendarAveragePaidPerNight, null)
  assert.equal(conflict.qualityFlags.includes('calendarContradictory'), true)
  assert.equal(conflict.qualityFlags.includes('calendarPriceIncomplete'), true)
})

test('fin de año, febrero bisiesto, salida exclusiva y horario de verano', () => {
  assert.deepEqual(stayNights('2025-12-30', '2026-01-02'), [
    '2025-12-30',
    '2025-12-31',
    '2026-01-01',
  ])
  const yearEnd = stay({
    checkIn: '2025-12-30',
    checkOut: '2026-01-02',
    hostPayout: 300,
    fareCleaning: 0,
  })
  assert.equal(month('2025-12', [yearEnd], '2026-02-01').metrics.calendarOccupiedNights, '2')
  assert.equal(month('2026-01', [yearEnd], '2026-02-01').metrics.calendarOccupiedNights, '1')
  assert.equal(month('2025-12', [yearEnd], '2026-02-01').metrics.calendarPaidByGuest, '200.00')
  assert.equal(month('2026-01', [yearEnd], '2026-02-01').metrics.calendarPaidByGuest, '100.00')

  const leap = stay({
    checkIn: '2024-02-28',
    checkOut: '2024-03-02',
    hostPayout: 300,
    fareCleaning: 0,
  })
  assert.deepEqual(stayNights('2024-02-28', '2024-03-02'), [
    '2024-02-28',
    '2024-02-29',
    '2024-03-01',
  ])
  assert.equal(month('2024-02', [leap], '2024-04-01').metrics.calendarOccupiedNights, '2')
  assert.equal(month('2024-03', [leap], '2024-04-01').metrics.calendarOccupiedNights, '1')

  assert.deepEqual(stayNights('2026-08-12', '2026-08-12'), [])
  assert.deepEqual(stayNights('2026-08-01', '2026-08-02'), ['2026-08-01'])

  const dst = stay({
    checkIn: '2026-03-29',
    checkOut: '2026-03-30',
    hostPayout: 80,
    fareCleaning: 0,
  })
  assert.equal(month('2026-03', [dst], '2026-04-02').metrics.calendarOccupiedNights, '1')
  assert.equal(month('2026-03', [dst], '2026-04-02').metrics.calendarPaidByGuest, '80.00')
})

test('las noches futuras no son ocupación realizada', () => {
  const august = month('2026-08', [stay()], '2026-08-28')
  const september = month('2026-09', [stay()], '2026-08-28')
  assert.equal(august.metrics.calendarOccupiedNights, '3')
  assert.equal(september.metrics.calendarOccupiedNights, '0')
  assert.equal(september.metrics.calendarAveragePaidPerNight, null)
  assert.equal(august.metrics.calendarPaidByGuest, '300.00')
})

test('los datos incompletos no publican un promedio', () => {
  const unknown = month('2026-08', [
    stay({
      hostPayout: null,
      hostServiceFee: null,
      fareCleaning: null,
      fareAccommodation: null,
    }),
  ])
  assert.equal(unknown.metrics.calendarOccupiedNights, '7')
  assert.equal(unknown.metrics.calendarPaidByGuest, null)
  assert.equal(unknown.metrics.calendarAveragePaidPerNight, null)
  assert.equal(unknown.metrics.calendarAccommodationRevenue, null)
  assert.equal(unknown.metrics.calendarADR, null)
  assert.equal(unknown.qualityFlags.includes('calendarPriceIncomplete'), true)

  const noCleaning = month('2026-08', [
    stay({ fareCleaning: null, fareAccommodation: null }),
  ])
  assert.equal(noCleaning.metrics.calendarPaidByGuest, '700.00')
  assert.equal(noCleaning.metrics.calendarAccommodationRevenue, null)
  assert.equal(noCleaning.metrics.calendarADR, null)
  assert.equal(
    noCleaning.qualityFlags.includes('calendarAccommodationIncomplete'),
    true,
  )

  const empty = month('2026-07', [stay()])
  assert.equal(empty.metrics.calendarOccupiedNights, '0')
  assert.equal(empty.metrics.calendarPaidByGuest, null)
  assert.equal(empty.metrics.calendarAveragePaidPerNight, null)
})

test('una estancia gratuita cuenta noches y no entra en la tarifa de alojamiento', () => {
  const free = month('2026-08', [
    stay({
      checkIn: '2026-08-01',
      checkOut: '2026-08-03',
      hostPayout: 0,
      fareCleaning: 0,
      fareAccommodation: 0,
    }),
  ])
  assert.equal(free.metrics.calendarOccupiedNights, '2')
  assert.equal(free.metrics.calendarPaidByGuest, '0.00')
  assert.equal(free.metrics.calendarAveragePaidPerNight, '0.00')
  assert.equal(free.metrics.calendarAccommodationRevenue, null)
  assert.equal(free.metrics.calendarADR, null)
  assert.equal(free.qualityFlags.includes('calendarComplimentary'), true)
})

test('el redondeo conserva el total y recalcular no duplica', () => {
  const cents = stay({
    checkIn: '2026-01-30',
    checkOut: '2026-02-02',
    hostPayout: 0.1,
    fareCleaning: 0,
  })
  const january = month('2026-01', [cents], '2026-03-01')
  const february = month('2026-02', [cents], '2026-03-01')
  const januaryCents = Math.round(Number(january.metrics.calendarPaidByGuest) * 100)
  const februaryCents = Math.round(Number(february.metrics.calendarPaidByGuest) * 100)
  assert.equal(januaryCents + februaryCents, 10)
  assert.equal(january.metrics.calendarOccupiedNights, '2')
  assert.equal(february.metrics.calendarOccupiedNights, '1')

  const again = month('2026-08', [stay()])
  const repeated = month('2026-08', [stay()])
  assert.deepEqual(again, repeated)
  const byPeriod = new Map<string, unknown>()
  byPeriod.set('2026-08', again)
  byPeriod.set('2026-08', repeated)
  assert.equal(byPeriod.size, 1)
})

test('un solapamiento en la misma unidad no duplica la noche ni inventa el importe', () => {
  const other = stay({
    reservationId: 'stay-2',
    checkIn: '2026-08-25',
    checkOut: '2026-08-26',
    hostPayout: 100,
  })
  const august = month('2026-08', [stay(), other])
  assert.equal(august.metrics.calendarOccupiedNights, '7')
  assert.equal(august.metrics.calendarPaidByGuest, null)
  assert.equal(august.qualityFlags.includes('calendarOverlap'), true)

  const otherUnit = stay({
    reservationId: 'stay-2',
    unitId: 'other-unit',
    checkIn: '2026-08-25',
    checkOut: '2026-08-26',
    hostPayout: 100,
    fareCleaning: 0,
  })
  const units = month('2026-08', [
    stay({ checkIn: '2026-08-25', checkOut: '2026-08-26', hostPayout: 100, fareCleaning: 0 }),
    otherUnit,
  ])
  assert.equal(units.metrics.calendarOccupiedNights, '2')
  assert.equal(units.metrics.calendarPaidByGuest, '200.00')
})

test('cancelaciones, bloqueos y estados desconocidos no cuentan como ocupación', () => {
  const august = month('2026-08', [
    stay({ status: 'canceled' }),
    stay({ reservationId: 'block', status: 'owner-block' }),
    stay({ reservationId: 'inquiry', status: 'inquiry' }),
    stay({ reservationId: 'mystery', status: 'awaiting_payment' }),
  ])
  assert.equal(august.metrics.calendarOccupiedNights, '0')
  assert.equal(august.qualityFlags.includes('calendarUnknownStatus'), true)
  const invalid = month('2026-08', [
    stay({ checkIn: '2026-08-10', checkOut: '2026-08-10' }),
  ])
  assert.equal(invalid.metrics.calendarOccupiedNights, '0')
  assert.equal(invalid.qualityFlags.includes('calendarContradictory'), true)
  assert.equal(august.metrics.calendarPaidByGuest, null)
})

test('no mezcla otra moneda y no usa el excel como importe de calendario', () => {
  const foreign = month('2026-08', [stay({ currency: 'USD' })])
  assert.equal(foreign.metrics.calendarOccupiedNights, '7')
  assert.equal(foreign.metrics.calendarPaidByGuest, null)
  assert.equal(foreign.qualityFlags.includes('calendarCurrency'), true)
  const legacy = applyCalendarMetrics(
    { paidByGuest: '999.00', nights: '3', dataOrigin: 'legacy_excel' },
    month('2026-08', [stay()]),
  )
  assert.equal(legacy.paidByGuest, '999.00')
  assert.equal(legacy.nights, '3')
  assert.equal(legacy.calendarOccupiedNights, '7')
  assert.equal(legacy.calendarPaidByGuest, '700.00')
})
