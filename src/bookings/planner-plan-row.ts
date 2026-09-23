import {
  type PlannerWarningCode,
  canonicalizeLinenValue,
  displayedPlannerWarnings,
  resolveEarlyCheckInMode,
  type EarlyCheckInMode,
} from '../../amplify/functions/shared/bookings-planner'
import { resolveYallaPropertyLabel } from '../../amplify/functions/shared/property-identity'

export type PlannerPlanRow = {
  id: string
  listingId: string
  guestName: string
  property: string
  checkIn: string
  checkOut: string
  guests: string
  nights: string
  status: string
  linen: string
  giftCard: string
  giftCardOn: boolean
  access: string
  earlyCheckInOn: boolean
  earlyCheckInMode: EarlyCheckInMode
  warnings: PlannerWarningCode[]
}

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : value == null ? '' : String(value)

const asBoolean = (value: unknown, fallback = false) =>
  typeof value === 'boolean' ? value : fallback

const asWarnings = (value: unknown): PlannerWarningCode[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is PlannerWarningCode =>
          entry === 'linen_ask_guest' ||
          entry === 'gift_card_access_missing' ||
          entry === 'single_guest' ||
          entry === 'double_or_two_singles_ask',
      )
    : []

export const isConfirmedPlannerStatus = (status: string) =>
  status.toLowerCase() === 'confirmed'

export const mapPlannerPlanRow = (
  item: Record<string, unknown>,
): PlannerPlanRow => {
  const giftCard = asString(item.GiftCard ?? item.giftCard)
  const early = asString(item.EarlyCheckIn ?? item.earlyCheckIn)
  const listingId = asString(item.ListingID ?? item.listingId)
  const earlyCheckInMode = resolveEarlyCheckInMode(
    early,
    asBoolean(item.EarlyCheckInOn ?? item.earlyCheckInOn),
  )
  return {
    id: asString(item.ReservationID ?? item.id),
    listingId,
    guestName: asString(item.GuestName) || '—',
    property:
      resolveYallaPropertyLabel({
        id: listingId,
        listingNickname: asString(item.ListingNickname ?? item.ListingName),
        nickname: asString(item.ListingNickname ?? item.ListingName),
      }) || '—',
    checkIn: asString(item.CheckInDate).slice(0, 10),
    checkOut: asString(item.CheckOutDate).slice(0, 10),
    guests: asString(item.Guests),
    nights: asString(item.Nights),
    status: asString(item.Status),
    linen: canonicalizeLinenValue(item.Linen ?? item.linen, listingId),
    giftCard,
    giftCardOn: asBoolean(
      item.GiftCardOn ?? item.giftCardOn,
      Boolean(giftCard) && giftCard !== 'Sin tarjeta',
    ),
    access: asString(item.Access ?? item.access),
    earlyCheckInOn: earlyCheckInMode === 'early',
    earlyCheckInMode,
    warnings: asWarnings(item.PlannerWarnings ?? item.warnings),
  }
}

export const warningsForPlannerPlanRow = (
  row: PlannerPlanRow,
): PlannerWarningCode[] =>
  displayedPlannerWarnings({
    ListingID: row.listingId,
    Linen: row.linen,
    Access: row.access,
    PlannerWarnings: row.warnings,
  })

export const bookingsPlanWithoutWarningCounts = (rows: PlannerPlanRow[]) => {
  const total = rows.length
  const completed = rows.filter(
    (row) => warningsForPlannerPlanRow(row).length === 0,
  ).length
  return { completed, total }
}
