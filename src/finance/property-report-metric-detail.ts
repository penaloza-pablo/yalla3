import type { LineAllocation } from '../../amplify/functions/shared/property-report-allocations'
import {
  resolveMarkupPercent,
  type PropertyReportSettings,
} from '../../amplify/functions/shared/property-report-settings'

export const METRICS_WITHOUT_DETAIL = new Set([
  'nights',
  'managementFee',
  'propertyContribution',
  'ourProfit',
  'netEarnings',
  'netProfit',
])

export type MetricDetailRow = {
  id: string
  title: string
  amount: number
}

export type MetricDetailSection = {
  id: string
  titleKey: string
  rows: MetricDetailRow[]
}

export type MetricDetailPayout = {
  id: string
  guestName: string
  guestPay: number
  cleaningFee: number
  cleaningGross: number
  cleaningPayoutVat: number
  cleaningNet: number
  accommodationGross: number
  accommodationPayoutVat: number
  accommodationNet: number
}

export type MetricDetailAllocatedLine = {
  id: string
  title: string
  net: number
  kit?: number
  iva: number
  allocation: LineAllocation | ''
}

export type MetricDetailSources = {
  payouts: MetricDetailPayout[]
  cleaning: MetricDetailAllocatedLine[]
  maintenance: MetricDetailAllocatedLine[]
  services: MetricDetailAllocatedLine[]
  expenses: MetricDetailAllocatedLine[]
  incomes: MetricDetailAllocatedLine[]
  settings?: PropertyReportSettings | null
}

const roundMoney = (value: number) => Math.round(value * 100) / 100

const isOwnerAlloc = (allocation: LineAllocation | '') =>
  allocation === 'owner' || allocation === 'ownerPlus12'

const isBearAlloc = (allocation: LineAllocation | '') => allocation === 'bear'

const isIncomeApplyMarkup = (allocation: LineAllocation | '') =>
  allocation === 'applyMarkup' || allocation === 'ownerPlus12'

const isIncomeDoNotSend = (allocation: LineAllocation | '') =>
  allocation === 'doNotSend' || allocation === 'bear'

const payoutRows = (
  payouts: MetricDetailPayout[],
  amount: (row: MetricDetailPayout) => number,
): MetricDetailRow[] =>
  payouts.map((row) => ({
    id: row.id,
    title: row.guestName,
    amount: roundMoney(amount(row)),
  }))

const allocatedRows = (
  lines: MetricDetailAllocatedLine[],
  amount: (line: MetricDetailAllocatedLine) => number,
  match: (line: MetricDetailAllocatedLine) => boolean = () => true,
): MetricDetailRow[] =>
  lines.filter(match).map((line) => ({
    id: line.id,
    title: line.title,
    amount: roundMoney(amount(line)),
  }))

const section = (
  id: string,
  titleKey: string,
  rows: MetricDetailRow[],
): MetricDetailSection | null =>
  rows.length ? { id, titleKey, rows } : null

export const metricHasDetail = (metricId: string) =>
  !METRICS_WITHOUT_DETAIL.has(metricId)

export const buildMetricDetailSections = (
  metricId: string,
  sources: MetricDetailSources,
): MetricDetailSection[] => {
  const markupRate = resolveMarkupPercent(sources.settings) / 100
  const payoutName = 'propertyReports.bookingsTitle'
  const cleaningName = 'propertyReports.cleaningTitle'
  const maintenanceName = 'propertyReports.maintenanceTitle'
  const servicesName = 'propertyReports.servicesTitle'
  const expensesName = 'propertyReports.expensesTitle'
  const incomesName = 'propertyReports.incomesTitle'

  const markupAmount = (net: number) => roundMoney(net * markupRate)

  switch (metricId) {
    case 'paidByGuest':
      return [
        section(payoutName, payoutName, payoutRows(sources.payouts, (row) => row.guestPay)),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'bookingCount':
      return [
        section(payoutName, payoutName, payoutRows(sources.payouts, () => 1)),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'payoutCleaningNet':
      return [
        section(payoutName, payoutName, payoutRows(sources.payouts, (row) => row.cleaningNet)),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'payoutCleaningGross':
      return [
        section(
          payoutName,
          payoutName,
          payoutRows(sources.payouts, (row) => row.cleaningGross),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'cleaningFee':
      return [
        section(
          payoutName,
          payoutName,
          payoutRows(sources.payouts, (row) => row.cleaningFee),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'cleaningPayoutVat':
      return [
        section(
          payoutName,
          payoutName,
          payoutRows(sources.payouts, (row) => row.cleaningPayoutVat),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'accommodationGross':
      return [
        section(
          payoutName,
          payoutName,
          payoutRows(sources.payouts, (row) => row.accommodationGross),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'accommodationPayoutVat':
      return [
        section(
          payoutName,
          payoutName,
          payoutRows(sources.payouts, (row) => row.accommodationPayoutVat),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'accommodationNet':
      return [
        section(
          payoutName,
          payoutName,
          payoutRows(sources.payouts, (row) => row.accommodationNet),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'otherIncomesNet':
      return [
        section(
          incomesName,
          incomesName,
          allocatedRows(sources.incomes, (line) => line.net),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'otherIncomesIva':
      return [
        section(
          incomesName,
          incomesName,
          allocatedRows(sources.incomes, (line) => line.iva),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'cleaningNet':
      return [
        section(
          cleaningName,
          cleaningName,
          allocatedRows(sources.cleaning, (line) => line.net),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'cleaningKit':
      return [
        section(
          cleaningName,
          cleaningName,
          allocatedRows(
            sources.cleaning,
            (line) => line.kit ?? 0,
            (line) => (line.kit ?? 0) !== 0,
          ),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'cleaningIva':
      return [
        section(
          cleaningName,
          cleaningName,
          allocatedRows(sources.cleaning, (line) => line.iva),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'maintenance':
    case 'maintenanceNet':
      return [
        section(
          maintenanceName,
          maintenanceName,
          allocatedRows(sources.maintenance, (line) => line.net),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'maintenanceIva':
      return [
        section(
          maintenanceName,
          maintenanceName,
          allocatedRows(sources.maintenance, (line) => line.iva),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'maintenanceCoverByOwner':
      return [
        section(
          maintenanceName,
          maintenanceName,
          allocatedRows(
            sources.maintenance,
            (line) => line.net,
            (line) => isOwnerAlloc(line.allocation),
          ),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'maintenanceCoverByUs':
      return [
        section(
          maintenanceName,
          maintenanceName,
          allocatedRows(
            sources.maintenance,
            (line) => line.net,
            (line) => isBearAlloc(line.allocation),
          ),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'servicesNet':
      return [
        section(
          servicesName,
          servicesName,
          allocatedRows(sources.services, (line) => line.net),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'servicesIva':
      return [
        section(
          servicesName,
          servicesName,
          allocatedRows(sources.services, (line) => line.iva),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'otherExpensesNet':
      return [
        section(
          expensesName,
          expensesName,
          allocatedRows(sources.expenses, (line) => line.net),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'otherExpensesIva':
      return [
        section(
          expensesName,
          expensesName,
          allocatedRows(sources.expenses, (line) => line.iva),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'income':
      return [
        section(
          payoutName,
          payoutName,
          payoutRows(sources.payouts, (row) => row.guestPay),
        ),
        section(
          incomesName,
          incomesName,
          allocatedRows(sources.incomes, (line) => line.net),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'cleaningMargin':
      return [
        section(
          payoutName,
          payoutName,
          payoutRows(sources.payouts, (row) => row.cleaningNet),
        ),
        section(
          cleaningName,
          cleaningName,
          allocatedRows(sources.cleaning, (line) => line.net + (line.kit ?? 0)),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'expensesAndServices':
      return [
        section(
          servicesName,
          servicesName,
          allocatedRows(sources.services, (line) => line.net),
        ),
        section(
          expensesName,
          expensesName,
          allocatedRows(sources.expenses, (line) => line.net),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'expensesAndServicesCoverByOwner':
      return [
        section(
          servicesName,
          servicesName,
          allocatedRows(
            sources.services,
            (line) => line.net,
            (line) => isOwnerAlloc(line.allocation),
          ),
        ),
        section(
          expensesName,
          expensesName,
          allocatedRows(
            sources.expenses,
            (line) => line.net,
            (line) => isOwnerAlloc(line.allocation),
          ),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'expensesAndServicesCoverByUs':
      return [
        section(
          servicesName,
          servicesName,
          allocatedRows(
            sources.services,
            (line) => line.net,
            (line) => isBearAlloc(line.allocation),
          ),
        ),
        section(
          expensesName,
          expensesName,
          allocatedRows(
            sources.expenses,
            (line) => line.net,
            (line) => isBearAlloc(line.allocation),
          ),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'markup':
      return [
        section(
          cleaningName,
          cleaningName,
          allocatedRows(
            sources.cleaning,
            (line) => markupAmount(line.net + (line.kit ?? 0)),
            (line) => isBearAlloc(line.allocation),
          ),
        ),
        section(
          maintenanceName,
          maintenanceName,
          allocatedRows(
            sources.maintenance,
            (line) => markupAmount(line.net),
            (line) => isBearAlloc(line.allocation),
          ),
        ),
        section(
          servicesName,
          servicesName,
          allocatedRows(
            sources.services,
            (line) => markupAmount(line.net),
            (line) => isBearAlloc(line.allocation),
          ),
        ),
        section(
          expensesName,
          expensesName,
          allocatedRows(
            sources.expenses,
            (line) => markupAmount(line.net),
            (line) => isBearAlloc(line.allocation),
          ),
        ),
        section(
          incomesName,
          incomesName,
          allocatedRows(
            sources.incomes,
            (line) => markupAmount(line.net),
            (line) => isIncomeApplyMarkup(line.allocation),
          ),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'iva':
      return [
        section(
          cleaningName,
          cleaningName,
          allocatedRows(sources.cleaning, (line) => line.iva),
        ),
        section(
          maintenanceName,
          maintenanceName,
          allocatedRows(sources.maintenance, (line) => line.iva),
        ),
        section(
          servicesName,
          servicesName,
          allocatedRows(sources.services, (line) => line.iva),
        ),
        section(
          expensesName,
          expensesName,
          allocatedRows(sources.expenses, (line) => line.iva),
        ),
        section(
          incomesName,
          incomesName,
          allocatedRows(sources.incomes, (line) => -line.iva),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    case 'amountTransferred':
      return [
        section(
          payoutName,
          payoutName,
          payoutRows(sources.payouts, (row) => row.guestPay),
        ),
        section(
          incomesName,
          incomesName,
          allocatedRows(
            sources.incomes,
            (line) => line.net,
            (line) => !isIncomeDoNotSend(line.allocation),
          ),
        ),
        section(
          maintenanceName,
          maintenanceName,
          allocatedRows(
            sources.maintenance,
            (line) => -line.net,
            (line) => isOwnerAlloc(line.allocation),
          ),
        ),
        section(
          servicesName,
          servicesName,
          allocatedRows(
            sources.services,
            (line) => -line.net,
            (line) => isOwnerAlloc(line.allocation),
          ),
        ),
        section(
          expensesName,
          expensesName,
          allocatedRows(
            sources.expenses,
            (line) => -line.net,
            (line) => isOwnerAlloc(line.allocation),
          ),
        ),
      ].filter((item): item is MetricDetailSection => Boolean(item))
    default:
      return []
  }
}
