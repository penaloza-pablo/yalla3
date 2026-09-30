import {
  calendarMetricsForMonth,
  calendarStayFromBooking,
  datesFromThrough,
  stayNights,
} from '../amplify/functions/shared/calendar-occupancy.ts'
import { queryHistoricPrefix } from '../amplify/functions/shared/finance-historic-store.ts'
import {
  getBookingById,
  getPropertyById,
  includePayoutInReportMonth,
  listingMatchesProperty,
  payoutReportMonthOverride,
  queryBookingsByCheckInDate,
  reservationFromPayload,
} from '../amplify/functions/shared/property-reports.ts'
import { getTodayInMadrid } from '../amplify/functions/shared/visit-task-utils.ts'

const PROPERTY_ID = '6835c21a7daf0d0026d38b36'
const PROPERTIES_TABLE = 'yalla-properties'
const BOOKINGS_TABLE = 'yalla-bookings'
const HISTORIC_TABLE = 'yalla-finance-historic'

const money = (cents: number | null) =>
  cents === null ? 'sin dato' : (cents / 100).toFixed(2)

const decimal = (value: string | null | undefined) => value ?? 'sin dato'

const eachMonth = (from: string, to: string) => {
  const months: string[] = []
  let cursor = from
  while (cursor <= to) {
    months.push(cursor)
    const [year, month] = cursor.split('-').map(Number)
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    cursor = `${nextYear}-${String(nextMonth).padStart(2, '0')}`
  }
  return months
}

const paidOf = (stay: {
  hostPayout: number | null
  hostServiceFee: number | null
}) => {
  if (stay.hostPayout === null && stay.hostServiceFee === null) return null
  return Math.round(((stay.hostPayout ?? 0) + (stay.hostServiceFee ?? 0)) * 100) / 100
}

const main = async () => {
  const today = getTodayInMadrid()
  const property = await getPropertyById(PROPERTIES_TABLE, PROPERTY_ID)
  if (!property) {
    throw new Error(`No se encontró la propiedad ${PROPERTY_ID}.`)
  }
  const dates = datesFromThrough('2024-09-01', today)
  const reservationIds: string[] = []
  for (let index = 0; index < dates.length; index += 8) {
    const pages = await Promise.all(
      dates
        .slice(index, index + 8)
        .map((date) => queryBookingsByCheckInDate(BOOKINGS_TABLE, date)),
    )
    for (const page of pages) {
      for (const item of page) {
        const reservationId = String(item.ReservationID ?? '')
        if (!reservationId || reservationIds.includes(reservationId)) continue
        if (!listingMatchesProperty(item, property)) continue
        reservationIds.push(reservationId)
      }
    }
    if (index % 80 === 0) {
      console.error(`Consultadas ${Math.min(index + 8, dates.length)} de ${dates.length} fechas de check-in`)
    }
  }
  const items = new Map<string, Record<string, unknown>>()
  for (let index = 0; index < reservationIds.length; index += 8) {
    const loaded = await Promise.all(
      reservationIds
        .slice(index, index + 8)
        .map((reservationId) => getBookingById(BOOKINGS_TABLE, reservationId)),
    )
    for (const item of loaded) {
      if (!item || !listingMatchesProperty(item, property)) continue
      const reservationId = String(item.ReservationID ?? '')
      if (!reservationId || items.has(reservationId)) continue
      items.set(reservationId, item)
    }
  }

  const stays = [...items.values()]
    .map((item) => calendarStayFromBooking(item, PROPERTY_ID))
    .filter((stay): stay is NonNullable<typeof stay> => stay !== null)
  const longStays = stays.filter(
    (stay) => stayNights(stay.checkIn, stay.checkOut).length > 120,
  )
  const updatedAt = new Date().toISOString()
  const months = eachMonth('2025-01', today.slice(0, 7))
  const historic = await queryHistoricPrefix(HISTORIC_TABLE, PROPERTY_ID, 'ACTUAL#')
  const historicByPeriod = new Map(
    historic.map((item) => [String(item.period ?? ''), item]),
  )

  const payoutByMonth = new Map<
    string,
    { bookings: number; nights: number; paid: number }
  >()
  for (const item of items.values()) {
    const stay = calendarStayFromBooking(item, PROPERTY_ID)
    if (!stay) continue
    const reservation = reservationFromPayload(item.RawPayload)
    const override = payoutReportMonthOverride(stay.reservationId)
    const reportMonth = override || stay.checkIn.slice(0, 7)
    if (
      !includePayoutInReportMonth(
        stay.reservationId,
        reservation,
        item,
        reportMonth,
        today,
      )
    ) {
      continue
    }
    const current = payoutByMonth.get(reportMonth) ?? {
      bookings: 0,
      nights: 0,
      paid: 0,
    }
    current.bookings += 1
    current.nights += stayNights(stay.checkIn, stay.checkOut).length
    current.paid += paidOf(stay) ?? 0
    payoutByMonth.set(reportMonth, current)
  }

  console.log(`Propiedad: ${String(property.nickname ?? PROPERTY_ID)} (${PROPERTY_ID})`)
  console.log(`Hoy Madrid: ${today}`)
  const withoutMoney = stays.filter(
    (stay) => stay.hostPayout === null && stay.hostServiceFee === null,
  ).length
  const withoutCleaning = stays.filter((stay) => stay.fareCleaning === null).length
  console.log(`Reservas leídas de yalla-bookings: ${stays.length}`)
  console.log(`Reservas sin paid by guest: ${withoutMoney}`)
  console.log(`Reservas sin tarifa de limpieza: ${withoutCleaning}`)
  console.log(`Estancias de más de 120 noches: ${longStays.length}`)
  console.log('Sin escrituras. El excel no entra en estas cifras.')
  console.log('')
  console.log(
    [
      'mes',
      'payouts',
      'noches payout',
      'paid payout',
      'noches calendario',
      'paid calendario',
      'pago medio',
      'alojamiento',
      'tarifa alojamiento',
      'método',
      'incidencias',
      'origen guardado',
      'paid guardado',
    ].join('\t'),
  )

  for (const period of months) {
    const calendar = calendarMetricsForMonth({
      propertyId: PROPERTY_ID,
      period,
      stays,
      today,
      updatedAt,
    })
    const payout = payoutByMonth.get(period)
    const stored = historicByPeriod.get(period)
    const storedMetrics =
      stored?.metrics && typeof stored.metrics === 'object'
        ? (stored.metrics as Record<string, string | null>)
        : {}
    console.log(
      [
        period,
        payout?.bookings ?? 0,
        payout?.nights ?? 0,
        payout ? payout.paid.toFixed(2) : '0.00',
        calendar.metrics.calendarOccupiedNights,
        decimal(calendar.metrics.calendarPaidByGuest),
        decimal(calendar.metrics.calendarAveragePaidPerNight),
        decimal(calendar.metrics.calendarAccommodationRevenue),
        decimal(calendar.metrics.calendarADR),
        calendar.methods.join('+') || '—',
        calendar.qualityFlags.join(',') || '—',
        String(stored?.dataOrigin ?? 'sin snapshot'),
        decimal(storedMetrics.paidByGuest),
      ].join('\t'),
    )
  }

  const statuses = new Map<string, number>()
  for (const stay of stays) {
    const status = stay.status || '(vacío)'
    statuses.set(status, (statuses.get(status) ?? 0) + 1)
  }
  console.log('')
  console.log('Estados')
  for (const [status, count] of [...statuses.entries()].sort((left, right) =>
    left[0].localeCompare(right[0]),
  )) {
    console.log(`${status}\t${count}`)
  }

  console.log('')
  console.log('Cobertura y reservas de los meses con noches')
  for (const period of months) {
    const calendar = calendarMetricsForMonth({
      propertyId: PROPERTY_ID,
      period,
      stays,
      today,
      updatedAt,
    })
    if (calendar.coverage.occupiedNights === 0) continue
    console.log(
      `${period}\tocupadas ${calendar.coverage.occupiedNights}\tcon importe ${calendar.coverage.paidCoveredNights}\tcon alojamiento ${calendar.coverage.accommodationCoveredNights}\tbase tarifa ${calendar.coverage.adrNights}`,
    )
    const byId = new Map(stays.map((stay) => [stay.reservationId, stay]))
    for (const reservation of calendar.reservations) {
      const source = byId.get(reservation.reservationId)
      console.log(
        [
          period,
          reservation.reservationId,
          source?.status ?? '',
          source?.checkIn ?? '',
          source?.checkOut ?? '',
          reservation.nights,
          money(reservation.paidCents),
          money(reservation.accommodationCents),
          reservation.method,
          reservation.issues.join(',') || '—',
        ].join('\t'),
      )
    }
  }

  console.log('')
  console.log('Reservas con incidencia')
  for (const period of months) {
    const calendar = calendarMetricsForMonth({
      propertyId: PROPERTY_ID,
      period,
      stays,
      today,
      updatedAt,
    })
    const flagged = calendar.reservations.filter(
      (reservation) => reservation.issues.length > 0,
    )
    for (const reservation of flagged) {
      console.log(
        [
          period,
          reservation.reservationId,
          reservation.nights,
          money(reservation.paidCents),
          money(reservation.accommodationCents),
          reservation.method,
          reservation.issues.join(','),
        ].join('\t'),
      )
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
