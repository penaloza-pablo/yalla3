import { calendarDaysBetween } from '../operations/dateHelpers'
import { parseIvaRate, type IvaRate } from '../../amplify/functions/shared/finance-services'
import {
  isLineAllocation,
  parseCleaningMovedToExpenses,
} from '../../amplify/functions/shared/property-report-allocations'
import {
  computePayoutBreakdown,
  sumPayoutField,
} from '../../amplify/functions/shared/property-report-payouts'
import {
  summarizeReportReviews,
  type PropertyReportReview,
} from '../../amplify/functions/shared/property-report-reviews'
import {
  GLOBAL_REPORT_SETTINGS_PROPERTY_ID,
  mergeReportSettings,
  parseReportSettings,
  type PropertyReportSettings,
} from '../../amplify/functions/shared/property-report-settings'
import {
  deriveReportStatus,
  isReportFrozen,
  type PropertyReportStatus,
} from '../../amplify/functions/shared/property-report-status'
import {
  computePropertyReportMetrics,
  type AllocatedReportLine,
} from './property-report-metrics'

const roundMoney = (value: number) => Math.round(value * 100) / 100

const ivaEuroFromNet = (net: number, ivaRate: IvaRate) =>
  roundMoney(net * (ivaRate / 100))

type BookingRow = {
  hostPayout: number | null
  fareCleaning: number | null
  hostServiceFee: number | null
  checkInDate: string
  checkOutDate: string
}

type CleaningRow = {
  id: string
  price: number | null
  kitCost: number
  ivaRate: IvaRate
}

type MoneyRow = {
  id: string
  price: number
  ivaRate: IvaRate
  allocation?: string
}

type ExpenseRow = {
  id: string
  amountExclIva: number
  ivaRate: IvaRate
  fromCleaning?: boolean
}

const asNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const asRecord = (value: unknown) =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null

const allocationFor = (
  allocations: Record<string, unknown>,
  rowId: string,
): AllocatedReportLine['allocation'] => {
  const value = allocations[rowId]
  return isLineAllocation(value) ? value : ''
}

export const loadGlobalReportSettings = async (
  getUrl: string,
  fetchJson: <T>(url: string) => Promise<T>,
) => {
  try {
    const payload = await fetchJson<{ settings?: Record<string, unknown> }>(
      `${getUrl}?propertyId=${encodeURIComponent(GLOBAL_REPORT_SETTINGS_PROPERTY_ID)}&settings=true`,
    )
    return parseReportSettings(payload.settings)
  } catch {
    return null
  }
}

export const metricsFromPropertyReportPayload = (
  payload: Record<string, unknown>,
  monthId: string,
  globalSettings: PropertyReportSettings | null,
) => {
  const report = asRecord(payload.report)
  const status = deriveReportStatus(monthId, String(report?.status ?? ''))
  const settings = mergeReportSettings(
    parseReportSettings(asRecord(payload.settings) ?? undefined),
    globalSettings,
  )
  const allocations = asRecord(payload.lineAllocations) ?? {}
  const moved = new Set(parseCleaningMovedToExpenses(payload.cleaningMovedToExpenses))

  const bookings: BookingRow[] = Array.isArray(payload.bookings)
    ? payload.bookings.map((item) => {
        const row = asRecord(item) ?? {}
        return {
          hostPayout: asNumber(row.hostPayout),
          fareCleaning: asNumber(row.fareCleaning),
          hostServiceFee: asNumber(row.hostServiceFee),
          checkInDate: String(row.checkInDate ?? ''),
          checkOutDate: String(row.checkOutDate ?? ''),
        }
      })
    : []

  const payoutRows = bookings.map((booking) => ({
    booking,
    nights:
      booking.checkInDate && booking.checkOutDate
        ? Math.max(
            0,
            calendarDaysBetween(booking.checkInDate, booking.checkOutDate),
          )
        : 0,
    ...computePayoutBreakdown(booking, settings),
  }))

  const cleaningSource = asRecord(payload.cleaning)
  const cleaningLines: CleaningRow[] = Array.isArray(cleaningSource?.lines)
    ? cleaningSource.lines.map((item) => {
        const row = asRecord(item) ?? {}
        const kit = asRecord(row.kit)
        return {
          id: String(row.id ?? ''),
          price: asNumber(row.price),
          kitCost: asNumber(kit?.cost ?? row.kitCost) ?? 0,
          ivaRate: parseIvaRate(row.ivaRate) ?? 21,
        }
      })
    : []
  const visibleCleaning = cleaningLines.filter((line) => !moved.has(line.id))

  const maintenanceSource = asRecord(payload.maintenance)
  const maintenanceLines: MoneyRow[] = Array.isArray(maintenanceSource?.lines)
    ? maintenanceSource.lines.map((item) => {
        const row = asRecord(item) ?? {}
        return {
          id: String(row.id ?? ''),
          price: asNumber(row.price) ?? 0,
          ivaRate: parseIvaRate(row.ivaRate) ?? 21,
        }
      })
    : []

  const serviceSource = asRecord(payload.services)
  const serviceLines: MoneyRow[] = Array.isArray(serviceSource?.lines)
    ? serviceSource.lines.map((item) => {
        const row = asRecord(item) ?? {}
        return {
          id: String(row.id ?? ''),
          price: asNumber(row.price) ?? 0,
          ivaRate: parseIvaRate(row.ivaRate) ?? 21,
          allocation: String(row.allocation ?? ''),
        }
      })
    : []

  const expenseSource = asRecord(payload.expenses)
  const expenseLines: ExpenseRow[] = Array.isArray(expenseSource?.lines)
    ? expenseSource.lines.map((item) => {
        const row = asRecord(item) ?? {}
        return {
          id: String(row.id ?? ''),
          amountExclIva: asNumber(row.amountExclIva) ?? 0,
          ivaRate: parseIvaRate(row.ivaRate) ?? 21,
        }
      })
    : []

  const incomeSource = asRecord(payload.incomes)
  const incomeLines: ExpenseRow[] = Array.isArray(incomeSource?.lines)
    ? incomeSource.lines.map((item) => {
        const row = asRecord(item) ?? {}
        return {
          id: String(row.id ?? ''),
          amountExclIva: asNumber(row.amountExclIva) ?? 0,
          ivaRate: parseIvaRate(row.ivaRate) ?? 21,
        }
      })
    : []

  const movedCleaningExpenses = cleaningLines
    .filter((line) => moved.has(line.id))
    .map((line) => ({
      id: line.id,
      amountExclIva: roundMoney((line.price ?? 0) + (line.kitCost || 0)),
      ivaRate: line.ivaRate,
      fromCleaning: true,
    }))
  const displayExpenses = [...expenseLines, ...movedCleaningExpenses]

  const reviews: PropertyReportReview[] = Array.isArray(payload.reviews)
    ? payload.reviews.map((item) => {
        const row = asRecord(item) ?? {}
        return {
          id: String(row.id ?? ''),
          reservationId: String(row.reservationId ?? ''),
          guestName: String(row.guestName ?? ''),
          status: String(row.status ?? ''),
          rating: asNumber(row.rating) ?? 0,
        }
      })
    : []
  const reviewTotals = summarizeReportReviews(reviews)

  const allocatedLines: AllocatedReportLine[] = [
    ...visibleCleaning.map((line) => ({
      section: 'cleaning' as const,
      net: line.price ?? 0,
      iva: ivaEuroFromNet(line.price ?? 0, line.ivaRate),
      allocation: allocationFor(allocations, `cleaning:${line.id}`),
    })),
    ...maintenanceLines.map((line) => ({
      section: 'maintenance' as const,
      net: line.price,
      iva: ivaEuroFromNet(line.price, line.ivaRate),
      allocation: allocationFor(allocations, `maintenance:${line.id}`),
    })),
    ...serviceLines.map((line) => ({
      section: 'service' as const,
      net: line.price,
      iva: ivaEuroFromNet(line.price, line.ivaRate),
      allocation: allocationFor(allocations, `service:${line.id}`),
    })),
    ...displayExpenses.map((line) => ({
      section: 'expense' as const,
      net: line.amountExclIva,
      iva: ivaEuroFromNet(line.amountExclIva, line.ivaRate),
      allocation: allocationFor(
        allocations,
        line.fromCleaning ? `cleaning:${line.id}` : `expense:${line.id}`,
      ),
    })),
    ...incomeLines.map((line) => ({
      section: 'income' as const,
      net: line.amountExclIva,
      iva: ivaEuroFromNet(line.amountExclIva, line.ivaRate),
      allocation: allocationFor(allocations, `income:${line.id}`),
    })),
  ]

  const paidByGuest = roundMoney(
    bookings.reduce((sum, booking) => {
      if (booking.hostPayout === null && booking.hostServiceFee === null) {
        return sum
      }
      return sum + (booking.hostPayout ?? 0) + (booking.hostServiceFee ?? 0)
    }, 0),
  )

  const values = computePropertyReportMetrics(
    {
      paidByGuest,
      channelFee: roundMoney(
        bookings.reduce((sum, booking) => sum + (booking.hostServiceFee ?? 0), 0),
      ),
      otherIncomesNet: roundMoney(
        incomeLines.reduce((sum, line) => sum + line.amountExclIva, 0),
      ),
      payoutCleaningNet: sumPayoutField(payoutRows, 'cleaningNet'),
      payoutCleaningGross: sumPayoutField(payoutRows, 'cleaningGross'),
      cleaningFee: sumPayoutField(payoutRows, 'cleaningFee'),
      cleaningPayoutVat: sumPayoutField(payoutRows, 'cleaningPayoutVat'),
      accommodationGross: sumPayoutField(payoutRows, 'accommodationGross'),
      accommodationPayoutVat: sumPayoutField(payoutRows, 'accommodationPayoutVat'),
      accommodationNet: sumPayoutField(payoutRows, 'accommodationNet'),
      cleaningNet: roundMoney(
        visibleCleaning.reduce((sum, line) => sum + (line.price ?? 0), 0),
      ),
      cleaningKit: roundMoney(
        visibleCleaning.reduce((sum, line) => sum + (line.kitCost || 0), 0),
      ),
      cleaningIva: roundMoney(
        visibleCleaning.reduce(
          (sum, line) => sum + ivaEuroFromNet(line.price ?? 0, line.ivaRate),
          0,
        ),
      ),
      maintenanceNet: roundMoney(
        maintenanceLines.reduce((sum, line) => sum + line.price, 0),
      ),
      maintenanceIva: roundMoney(
        maintenanceLines.reduce(
          (sum, line) => sum + ivaEuroFromNet(line.price, line.ivaRate),
          0,
        ),
      ),
      servicesNet: roundMoney(serviceLines.reduce((sum, line) => sum + line.price, 0)),
      servicesIva: roundMoney(
        serviceLines.reduce(
          (sum, line) => sum + ivaEuroFromNet(line.price, line.ivaRate),
          0,
        ),
      ),
      otherExpensesNet: roundMoney(
        displayExpenses.reduce((sum, line) => sum + line.amountExclIva, 0),
      ),
      otherExpensesIva: roundMoney(
        displayExpenses.reduce(
          (sum, line) => sum + ivaEuroFromNet(line.amountExclIva, line.ivaRate),
          0,
        ),
      ),
      otherIncomesIva: roundMoney(
        incomeLines.reduce(
          (sum, line) => sum + ivaEuroFromNet(line.amountExclIva, line.ivaRate),
          0,
        ),
      ),
      bookingCount: bookings.length,
      nights: payoutRows.reduce((sum, row) => sum + row.nights, 0),
      fiveStarReviewCount: reviewTotals.fiveStarReviewCount,
      underFiveStarReviewCount: reviewTotals.underFiveStarReviewCount,
      rescuedUnderFiveStarReviewPercent:
        reviewTotals.rescuedUnderFiveStarReviewPercent,
      allocatedLines,
    },
    settings,
  )

  return {
    status,
    closed: isReportFrozen(status),
    values,
  }
}

export type { PropertyReportStatus }
