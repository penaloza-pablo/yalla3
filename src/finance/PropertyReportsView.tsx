import { Fragment, useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IVA_RATES,
  occurrencePriceWithIva,
  parseIvaRate,
  persistIvaFields,
  priceFromGross,
  type IvaRate,
} from '../../amplify/functions/shared/finance-services'
import { ACTION_KEYS } from '../../amplify/functions/shared/rbac-catalog'
import { usePermissions } from '../rbac/PermissionsProvider'
import { fetchJson } from '../operations/api'
import { formatDateOnlyLabel, getTodayMadrid } from '../operations/dateHelpers'
import {
  filterPropertyReportsOptions,
  listPropertyReportMonthIds,
  propertyReportsLabel,
} from '../operations/propertyHelpers'
import type { PropertyOption } from '../operations/types'
import {
  GLOBAL_REPORT_SETTINGS_PROPERTY_ID,
  emptyReportSettings,
  mergeReportSettings,
  parseReportSettings,
  type PropertyReportSettings,
} from '../../amplify/functions/shared/property-report-settings'
import { DEFAULT_COMMISSION_FORMULA } from '../../amplify/functions/shared/property-report-formula'
import {
  computePayoutBreakdown,
  sumPayoutField,
} from '../../amplify/functions/shared/property-report-payouts'
import { PropertyReportSettingsView } from './PropertyReportSettingsView'
import { PropertyClosedReportView } from './PropertyClosedReportView'
import { computePropertyReportMetrics } from './property-report-metrics'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
  onNavigate: (page: string, options?: { billingMonth?: string }) => void
}

type ReportStatus =
  | 'CURRENT'
  | 'PENDING_TO_CLOSE'
  | 'READY_TO_CLOSE'
  | 'CLOSED'

type ReportMonth = {
  id: string
  status: ReportStatus
  canMarkReady: boolean
  canClose: boolean
  canReopen: boolean
}

type ReportBooking = {
  bookingId: string
  reservationId: string
  guestName: string
  checkInDate: string
  checkOutDate: string
  hostPayout: number | null
  fareCleaning: number | null
  hostServiceFee: number | null
  currency: string
}

type CleaningLine = {
  id: string
  date: string
  cleaningTypeName: string
  status: string
  price: number | null
  kitCost: number
  ivaRate: IvaRate
}

type MaintenanceLine = {
  id: string
  date: string
  title: string
  visitTypeName: string
  price: number | null
  ivaRate: IvaRate
}

type ExpenseLine = {
  id: string
  origin: string
  itemName: string
  date: string
  amountExclIva: number
  amountInclIva: number
  ivaRate: IvaRate
}

type MovementKind = 'income' | 'outcome'

type MovementDraft = {
  description: string
  amount: string
  ivaRate: IvaRate
  totalAmount: string
  date: string
  kind: MovementKind
}

const defaultDateInMonth = (monthId: string) => {
  const today = getTodayMadrid()
  if (today.startsWith(`${monthId}-`)) {
    return today
  }
  return `${monthId}-01`
}

const lastDateInMonth = (monthId: string) => {
  const [year, month] = monthId.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${monthId}-${String(lastDay).padStart(2, '0')}`
}

const emptyMovementDraft = (
  monthId: string,
  kind: MovementKind,
): MovementDraft => ({
  description: '',
  amount: '',
  ivaRate: 0,
  totalAmount: '',
  date: defaultDateInMonth(monthId),
  kind,
})

const syncDraftFromNet = (amount: string, ivaRate: IvaRate) => {
  const parsed = Number(amount)
  if (!Number.isFinite(parsed) || amount.trim() === '') {
    return { amount, ivaRate, totalAmount: '' }
  }
  return {
    amount,
    ivaRate,
    totalAmount: String(occurrencePriceWithIva(parsed, ivaRate)),
  }
}

const syncDraftFromGross = (totalAmount: string, ivaRate: IvaRate) => {
  const parsed = Number(totalAmount)
  if (!Number.isFinite(parsed) || totalAmount.trim() === '') {
    return { amount: '', ivaRate, totalAmount }
  }
  return {
    amount: String(priceFromGross(parsed, ivaRate)),
    ivaRate,
    totalAmount,
  }
}

type ServiceLine = {
  id: string
  title: string
  recurrence: string
  date: string
  price: number
  priceWithIva: number
  ivaRate: IvaRate
}

const roundMoney = (value: number) => Math.round(value * 100) / 100

const payoutGuestPay = (booking: ReportBooking) => {
  if (booking.hostPayout === null && booking.hostServiceFee === null) {
    return null
  }
  return roundMoney((booking.hostPayout ?? 0) + (booking.hostServiceFee ?? 0))
}

const ivaEuroFromNet = (net: number, ivaRate: IvaRate) =>
  roundMoney(net * (ivaRate / 100))

const grossFromNet = (net: number, ivaRate: IvaRate) =>
  roundMoney(net + ivaEuroFromNet(net, ivaRate))

const inferIvaRate = (net: number, gross: number, fallback: IvaRate = 21): IvaRate => {
  if (!Number.isFinite(net) || !Number.isFinite(gross)) {
    return fallback
  }
  if (Math.abs(net) < 0.005) {
    return Math.abs(gross) < 0.005 ? 0 : fallback
  }
  const ratio = (gross - net) / net
  if (Math.abs(ratio - 0.21) < 0.02) {
    return 21
  }
  if (Math.abs(ratio - 0.1) < 0.02) {
    return 10
  }
  if (Math.abs(ratio) < 0.02) {
    return 0
  }
  return fallback
}

type IvaDetailsProps = {
  ivaRate: IvaRate
  netAmount: number
  money: Intl.NumberFormat
  onChange: (rate: IvaRate) => void
  extra?: Array<{ label: string; value: string }>
}

const ReportIvaDetails = ({
  ivaRate,
  netAmount,
  money,
  onChange,
  extra,
}: IvaDetailsProps) => {
  const { t } = useTranslation()
  return (
    <div className="detail-grid report-iva-details">
      {extra?.map((item) => (
        <div key={item.label} className="detail-span">
          <p className="detail-label">{item.label}</p>
          <p className="detail-value">{item.value || '—'}</p>
        </div>
      ))}
      <div>
        <label className="form-field">
          <span>{t('propertyReports.ivaPercent')}</span>
          <select
            value={String(ivaRate)}
            onChange={(event) =>
              onChange(parseIvaRate(event.target.value) ?? 0)
            }
          >
            {IVA_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate === 10
                  ? t('common.iva10')
                  : rate === 21
                    ? t('common.iva21')
                    : t('common.ivaNone')}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <p className="detail-label">{t('propertyReports.ivaEuro')}</p>
        <p className="detail-value">
          {money.format(ivaEuroFromNet(netAmount, ivaRate))}
        </p>
      </div>
    </div>
  )
}

const TableToggleButton = ({
  open,
  onClick,
  expandLabel,
  collapseLabel,
}: {
  open: boolean
  onClick: () => void
  expandLabel: string
  collapseLabel: string
}) => (
  <button
    className="btn-icon btn-icon-ghost"
    type="button"
    aria-expanded={open}
    aria-label={open ? collapseLabel : expandLabel}
    onClick={onClick}
  >
    {open ? '▾' : '▸'}
  </button>
)

const TruncatedText = ({ value }: { value: string }) => (
  <span className="report-truncated-text" title={value || undefined}>
    {value || '—'}
  </span>
)

const COST_ALLOCATIONS = ['bear', 'ownerPlus12', 'owner'] as const
type CostAllocation = (typeof COST_ALLOCATIONS)[number]

const isCostAllocation = (value: unknown): value is CostAllocation =>
  COST_ALLOCATIONS.includes(String(value) as CostAllocation)

const parseLineAllocations = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, CostAllocation>
  }
  const next: Record<string, CostAllocation> = {}
  for (const [key, allocation] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const id = key.trim()
    if (!id || !isCostAllocation(allocation)) {
      continue
    }
    next[id] = allocation
  }
  return next
}

const ReportDocumentIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
    <path
      d="M6 2h6l4 4v12H6V2zm6 1.4V7h3.4L12 3.4zM8 9.2h6v1.4H8V9.2zm0 2.8h6v1.4H8v-1.4zm0 2.8h4v1.4H8v-1.4z"
      fill="currentColor"
    />
  </svg>
)

const SettingsGearIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.33 1.64a6.97 6.97 0 0 1 1.24.72l1.55-.83a1 1 0 0 1 1.22.22l1.67 1.67a1 1 0 0 1 .22 1.22l-.83 1.55c.3.38.54.8.72 1.24l1.64.33a1 1 0 0 1 .804.98v2.36a1 1 0 0 1-.804.98l-1.64.33a6.95 6.95 0 0 1-.72 1.24l.83 1.55a1 1 0 0 1-.22 1.22l-1.67 1.67a1 1 0 0 1-1.22.22l-1.55-.83a6.97 6.97 0 0 1-1.24.72l-.33 1.64a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.33-1.64a6.97 6.97 0 0 1-1.24-.72l-1.55.83a1 1 0 0 1-1.22-.22L2.83 14.87a1 1 0 0 1-.22-1.22l.83-1.55a6.95 6.95 0 0 1-.72-1.24l-1.64-.33A1 1 0 0 1 1 9.18V6.82a1 1 0 0 1 .804-.98l1.64-.33c.18-.44.42-.86.72-1.24l-.83-1.55a1 1 0 0 1 .22-1.22L5.22 1.83a1 1 0 0 1 1.22-.22l1.55.83c.38-.3.8-.54 1.24-.72l.33-1.64ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
      clipRule="evenodd"
    />
  </svg>
)

const AllocationChip = ({
  value,
  disabled,
  onChange,
}: {
  value: CostAllocation | ''
  disabled: boolean
  onChange: (value: CostAllocation) => void
}) => {
  const { t } = useTranslation()
  return (
    <select
      className="report-cost-chip"
      value={value}
      disabled={disabled}
      aria-label={t('propertyReports.allocation')}
      onChange={(event) => {
        if (isCostAllocation(event.target.value)) {
          onChange(event.target.value)
        }
      }}
    >
      <option value="">{t('common.select')}</option>
      <option value="bear">{t('propertyReports.allocationBear')}</option>
      <option value="ownerPlus12">
        {t('propertyReports.allocationOwnerPlus12')}
      </option>
      <option value="owner">{t('propertyReports.allocationOwner')}</option>
    </select>
  )
}

const fallbackMonths = (): ReportMonth[] =>
  listPropertyReportMonthIds(getTodayMadrid()).map((id) => ({
    id,
    status: id >= getTodayMadrid().slice(0, 7) ? 'CURRENT' : 'PENDING_TO_CLOSE',
    canMarkReady: id < getTodayMadrid().slice(0, 7),
    canClose: false,
    canReopen: false,
  }))

const mapMonth = (item: Record<string, unknown>): ReportMonth => ({
  id: String(item.id ?? ''),
  status: String(item.status ?? 'PENDING_TO_CLOSE') as ReportStatus,
  canMarkReady: Boolean(item.canMarkReady),
  canClose: Boolean(item.canClose),
  canReopen: Boolean(item.canReopen),
})

export function PropertyReportsView({
  getEndpoint,
  propertyOptions,
  onNavigate,
}: Props) {
  const { t, i18n } = useTranslation()
  const { can } = usePermissions()
  const canChangeStatus = can(ACTION_KEYS.propertyReportsCloseMonth)
  const endpoints = useMemo(
    () => ({
      get: getEndpoint('getPropertyReportUrl'),
      upsert: getEndpoint('upsertPropertyReportUrl'),
      upsertMovement: getEndpoint('upsertFinanceMovementUrl'),
    }),
    [getEndpoint],
  )

  const properties = useMemo(
    () => filterPropertyReportsOptions(propertyOptions),
    [propertyOptions],
  )
  const copyTargets = useMemo(
    () =>
      properties.map((property) => ({
        id: property.id,
        name: propertyReportsLabel(property),
      })),
    [properties],
  )

  const [selectedPropertyId, setSelectedPropertyId] = useState('')
  const [selectedMonthId, setSelectedMonthId] = useState('')
  const [months, setMonths] = useState<ReportMonth[]>([])
  const [report, setReport] = useState<ReportMonth | null>(null)
  const [bookings, setBookings] = useState<ReportBooking[]>([])
  const [cleaningClosed, setCleaningClosed] = useState(false)
  const [maintenanceClosed, setMaintenanceClosed] = useState(false)
  const [cleaningLines, setCleaningLines] = useState<CleaningLine[]>([])
  const [maintenanceLines, setMaintenanceLines] = useState<MaintenanceLine[]>([])
  const [cleaningTotal, setCleaningTotal] = useState(0)
  const [cleaningKitCost, setCleaningKitCost] = useState(0)
  const [maintenanceTotal, setMaintenanceTotal] = useState(0)
  const [expenses, setExpenses] = useState<ExpenseLine[]>([])
  const [incomes, setIncomes] = useState<ExpenseLine[]>([])
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([])
  const [movementDraft, setMovementDraft] = useState<MovementDraft | null>(null)
  const [isSavingMovement, setIsSavingMovement] = useState(false)
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set())
  const [lineAllocations, setLineAllocations] = useState<
    Record<string, CostAllocation>
  >({})
  const [isClosedReportOpen, setIsClosedReportOpen] = useState(false)
  const [settingsProperty, setSettingsProperty] = useState<{
    id: string
    name: string
  } | null>(null)
  const [reportSettings, setReportSettings] = useState<PropertyReportSettings>(
    emptyReportSettings(),
  )
  const [globalSettings, setGlobalSettings] =
    useState<PropertyReportSettings | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [openTables, setOpenTables] = useState({
    bookings: false,
    cleaning: false,
    maintenance: false,
    expenses: false,
    incomes: false,
    services: false,
  })

  const money = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language.startsWith('es') ? 'es-ES' : 'en-GB', {
        style: 'currency',
        currency: 'EUR',
      }),
    [i18n.language],
  )

  const payoutRows = useMemo(
    () =>
      bookings.map((booking) => ({
        booking,
        guestPay: payoutGuestPay(booking),
        ...computePayoutBreakdown(booking, reportSettings),
      })),
    [bookings, reportSettings],
  )

  const bookingTotals = useMemo(
    () => ({
      count: bookings.length,
      payout: bookings.reduce((sum, booking) => sum + (booking.hostPayout ?? 0), 0),
      paidByGuest: roundMoney(
        bookings.reduce((sum, booking) => sum + (payoutGuestPay(booking) ?? 0), 0),
      ),
      cleaningFee: sumPayoutField(payoutRows, 'cleaningFee'),
      cleaningGross: sumPayoutField(payoutRows, 'cleaningGross'),
      cleaningPayoutVat: sumPayoutField(payoutRows, 'cleaningPayoutVat'),
      cleaningNet: sumPayoutField(payoutRows, 'cleaningNet'),
      accommodationGross: sumPayoutField(payoutRows, 'accommodationGross'),
      accommodationPayoutVat: sumPayoutField(payoutRows, 'accommodationPayoutVat'),
      accommodationNet: sumPayoutField(payoutRows, 'accommodationNet'),
      serviceFee: bookings.reduce(
        (sum, booking) => sum + (booking.hostServiceFee ?? 0),
        0,
      ),
    }),
    [bookings, payoutRows],
  )
  const cleaningIvaTotal = useMemo(
    () =>
      roundMoney(
        cleaningLines.reduce(
          (sum, line) => sum + ivaEuroFromNet(line.price ?? 0, line.ivaRate),
          0,
        ),
      ),
    [cleaningLines],
  )
  const maintenanceIvaTotal = useMemo(
    () =>
      roundMoney(
        maintenanceLines.reduce(
          (sum, line) => sum + ivaEuroFromNet(line.price ?? 0, line.ivaRate),
          0,
        ),
      ),
    [maintenanceLines],
  )
  const cleaningGrossTotal = useMemo(
    () =>
      roundMoney(
        cleaningLines.reduce(
          (sum, line) => sum + grossFromNet(line.price ?? 0, line.ivaRate),
          0,
        ),
      ),
    [cleaningLines],
  )
  const maintenanceGrossTotal = useMemo(
    () =>
      roundMoney(
        maintenanceLines.reduce(
          (sum, line) => sum + grossFromNet(line.price ?? 0, line.ivaRate),
          0,
        ),
      ),
    [maintenanceLines],
  )
  const summarizeMoneyLines = (lines: ExpenseLine[]) => ({
    count: lines.length,
    totalCost: lines.reduce((sum, line) => sum + line.amountExclIva, 0),
    totalIva: roundMoney(
      lines.reduce(
        (sum, line) => sum + ivaEuroFromNet(line.amountExclIva, line.ivaRate),
        0,
      ),
    ),
    totalCostWithIva: lines.reduce((sum, line) => sum + line.amountInclIva, 0),
  })
  const expenseTotals = useMemo(
    () => summarizeMoneyLines(expenses),
    [expenses],
  )
  const incomeTotals = useMemo(() => summarizeMoneyLines(incomes), [incomes])
  const serviceTotals = useMemo(
    () => ({
      count: serviceLines.length,
      cost: serviceLines.reduce((sum, line) => sum + line.price, 0),
      iva: roundMoney(
        serviceLines.reduce(
          (sum, line) => sum + ivaEuroFromNet(line.price, line.ivaRate),
          0,
        ),
      ),
      costWithIva: serviceLines.reduce((sum, line) => sum + line.priceWithIva, 0),
    }),
    [serviceLines],
  )

  const originLabel = (origin: string) => {
    if (origin === 'subtraction') {
      return t('propertyReports.originSubtraction')
    }
    if (origin === 'movement') {
      return t('propertyReports.originMovement')
    }
    if (origin === 'purchase') {
      return t('propertyReports.originPurchase')
    }
    return origin
  }

  const recurrenceLabel = (value: string) =>
    t(
      `services.recurrence${value.charAt(0).toUpperCase()}${value.slice(1)}`,
      { defaultValue: value },
    )

  const toggleTable = (key: keyof typeof openTables) => {
    setOpenTables((current) => ({ ...current, [key]: !current[key] }))
  }

  const toggleExpandedRow = (rowId: string) => {
    setExpandedRowIds((current) => {
      const next = new Set(current)
      if (next.has(rowId)) {
        next.delete(rowId)
      } else {
        next.add(rowId)
      }
      return next
    })
  }

  const selectedProperty = properties.find(
    (property) => property.id === selectedPropertyId,
  )
  const propertyLabel = selectedProperty
    ? propertyReportsLabel(selectedProperty)
    : selectedPropertyId

  const dateLabel = (value: string) => formatDateOnlyLabel(value, i18n.language)
  const formatMonthLabel = (monthId: string) => {
    const [year, month] = monthId.split('-').map(Number)
    return new Intl.DateTimeFormat(
      i18n.language.startsWith('es') ? 'es-ES' : 'en-GB',
      { month: 'long', year: 'numeric', timeZone: 'UTC' },
    ).format(new Date(Date.UTC(year, month - 1, 1)))
  }

  const statusLabel = (status: ReportStatus) => {
    if (status === 'CURRENT') return t('propertyReports.statusCurrent')
    if (status === 'PENDING_TO_CLOSE') return t('propertyReports.statusPending')
    if (status === 'READY_TO_CLOSE') return t('propertyReports.statusReady')
    return t('propertyReports.statusClosed')
  }

  const loadMonths = useCallback(
    async (propertyId: string) => {
      if (!endpoints.get) {
        setMonths(fallbackMonths())
        return
      }
      const payload = await fetchJson<{
        months?: Record<string, unknown>[]
        settings?: Record<string, unknown>
      }>(
        `${endpoints.get}?propertyId=${encodeURIComponent(propertyId)}`,
      )
      setMonths((payload.months ?? []).map(mapMonth))
      setReportSettings(
        mergeReportSettings(
          parseReportSettings(payload.settings),
          globalSettings,
        ),
      )
    },
    [endpoints.get, globalSettings],
  )

  const loadDetail = useCallback(
    async (propertyId: string, monthId: string) => {
      if (!endpoints.get) {
        setError(t('propertyReports.missingEndpoint'))
        return
      }
      const payload = await fetchJson<{
        months?: Record<string, unknown>[]
        report?: Record<string, unknown>
        bookings?: ReportBooking[]
        cleaning?: {
          closed?: boolean
          lines?: Record<string, unknown>[]
          total?: number
          kitCost?: number
          kitCostWithIva?: number
        }
        maintenance?: {
          closed?: boolean
          lines?: MaintenanceLine[]
          total?: number
        }
        expenses?: {
          lines?: ExpenseLine[]
        }
        incomes?: {
          lines?: ExpenseLine[]
        }
        services?: {
          lines?: ServiceLine[]
        }
        lineAllocations?: Record<string, unknown>
        settings?: Record<string, unknown>
      }>(
        `${endpoints.get}?propertyId=${encodeURIComponent(propertyId)}&month=${encodeURIComponent(monthId)}`,
      )
      setMonths((payload.months ?? []).map(mapMonth))
      setReport(payload.report ? mapMonth(payload.report) : null)
      setBookings(payload.bookings ?? [])
      setCleaningClosed(Boolean(payload.cleaning?.closed))
      setMaintenanceClosed(Boolean(payload.maintenance?.closed))
      setCleaningLines(
        (payload.cleaning?.lines ?? []).map((item) => {
          const kit =
            item.kit && typeof item.kit === 'object'
              ? (item.kit as Record<string, unknown>)
              : null
          const price = item.price
          return {
            id: String(item.id ?? ''),
            date: String(item.date ?? ''),
            cleaningTypeName: String(item.cleaningTypeName ?? ''),
            status: String(item.status ?? ''),
            price:
              price === null || price === undefined || price === ''
                ? null
                : Number(price),
            kitCost: Number(kit?.cost ?? item.kitCost ?? 0),
            ivaRate: parseIvaRate(item.ivaRate) ?? 21,
          }
        }),
      )
      setMaintenanceLines(
        (payload.maintenance?.lines ?? []).map((item) => ({
          ...item,
          ivaRate: parseIvaRate((item as MaintenanceLine).ivaRate) ?? 21,
        })),
      )
      setCleaningTotal(Number(payload.cleaning?.total ?? 0))
      setCleaningKitCost(Number(payload.cleaning?.kitCost ?? 0))
      setMaintenanceTotal(Number(payload.maintenance?.total ?? 0))
      const mapMoneyLine = (item: ExpenseLine): ExpenseLine => ({
        ...item,
        ivaRate:
          parseIvaRate(item.ivaRate) ??
          inferIvaRate(item.amountExclIva, item.amountInclIva, 0),
      })
      setExpenses((payload.expenses?.lines ?? []).map(mapMoneyLine))
      setIncomes((payload.incomes?.lines ?? []).map(mapMoneyLine))
      setServiceLines(
        (payload.services?.lines ?? []).map((item) => ({
          ...item,
          ivaRate:
            parseIvaRate((item as ServiceLine).ivaRate) ??
            inferIvaRate(item.price, item.priceWithIva, 0),
        })),
      )
      setLineAllocations(parseLineAllocations(payload.lineAllocations))
      if (payload.settings) {
        setReportSettings(
          mergeReportSettings(
            parseReportSettings(payload.settings),
            globalSettings,
          ),
        )
      }
    },
    [endpoints.get, globalSettings, t],
  )

  useEffect(() => {
    if (!endpoints.get) {
      return
    }
    let cancelled = false
    void fetchJson<{ settings?: Record<string, unknown> }>(
      `${endpoints.get}?propertyId=${encodeURIComponent(GLOBAL_REPORT_SETTINGS_PROPERTY_ID)}&settings=1`,
    )
      .then((payload) => {
        if (!cancelled) {
          setGlobalSettings(parseReportSettings(payload.settings))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setGlobalSettings(emptyReportSettings())
        }
      })
    return () => {
      cancelled = true
    }
  }, [endpoints.get])

  useEffect(() => {
    if (!globalSettings) {
      return
    }
    setReportSettings((current) => mergeReportSettings(current, globalSettings))
  }, [globalSettings])

  useEffect(() => {
    if (!selectedPropertyId) {
      setMonths([])
      setSelectedMonthId('')
      setReportSettings(emptyReportSettings())
      setError(null)
      setMessage(null)
      return
    }
    setIsLoading(true)
    setError(null)
    void loadMonths(selectedPropertyId)
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : t('propertyReports.loadError'),
        )
      })
      .finally(() => setIsLoading(false))
  }, [loadMonths, selectedPropertyId, t])

  useEffect(() => {
    if (!selectedPropertyId || !selectedMonthId) {
      return
    }
    setOpenTables({
      bookings: false,
      cleaning: false,
      maintenance: false,
      expenses: false,
      incomes: false,
      services: false,
    })
    setMovementDraft(null)
    setExpandedRowIds(new Set())
    setLineAllocations({})
    setIsClosedReportOpen(false)
    setIsLoading(true)
    setError(null)
    void loadDetail(selectedPropertyId, selectedMonthId)
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : t('propertyReports.loadError'),
        )
      })
      .finally(() => setIsLoading(false))
  }, [loadDetail, selectedMonthId, selectedPropertyId, t])

  const saveStatus = async (action: 'ready' | 'close' | 'reopen') => {
    if (!endpoints.upsert || !selectedPropertyId || !selectedMonthId) {
      setError(t('propertyReports.missingWrite'))
      return
    }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      await fetchJson(endpoints.upsert, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          propertyId: selectedPropertyId,
          monthId: selectedMonthId,
          action,
        }),
      })
      setMessage(t('propertyReports.updated'))
      if (action === 'reopen') {
        setIsClosedReportOpen(false)
      }
      await loadDetail(selectedPropertyId, selectedMonthId)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t('propertyReports.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const saveAllocation = async (rowId: string, allocation: CostAllocation) => {
    const next = { ...lineAllocations, [rowId]: allocation }
    setLineAllocations(next)
    if (!endpoints.upsert || !selectedPropertyId || !selectedMonthId) {
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await fetchJson(endpoints.upsert, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          propertyId: selectedPropertyId,
          monthId: selectedMonthId,
          action: 'allocate',
          lineAllocations: next,
        }),
      })
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t('propertyReports.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const openMovementForm = (kind: MovementKind) => {
    if (!selectedMonthId) {
      return
    }
    setError(null)
    setMessage(null)
    setMovementDraft(emptyMovementDraft(selectedMonthId, kind))
  }

  const saveMovement = async () => {
    if (!movementDraft) {
      return
    }
    if (!endpoints.upsertMovement) {
      setError(t('propertyReports.missingMovementWrite'))
      return
    }
    if (!selectedPropertyId || !selectedMonthId) {
      return
    }
    const amount = Number(movementDraft.amount)
    const date = movementDraft.date
    if (!movementDraft.description.trim() || !date) {
      setError(t('propertyReports.validationMovement'))
      return
    }
    if (date.slice(0, 7) !== selectedMonthId) {
      setError(t('propertyReports.validationMovementDate'))
      return
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setError(t('movements.validationAmount'))
      return
    }
    setIsSavingMovement(true)
    setError(null)
    setMessage(null)
    try {
      await fetchJson(endpoints.upsertMovement, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          propertyId: selectedPropertyId,
          propertyName: propertyLabel,
          description: movementDraft.description.trim(),
          amount,
          ivaRate: movementDraft.ivaRate,
          appliesIva: persistIvaFields(movementDraft.ivaRate).appliesIva,
          totalAmount: Number.isFinite(Number(movementDraft.totalAmount))
            ? Number(movementDraft.totalAmount)
            : undefined,
          kind: movementDraft.kind,
          date,
          status: 'Pending Billing',
        }),
      })
      setMovementDraft(null)
      setMessage(t('propertyReports.addMovementSaved'))
      await loadDetail(selectedPropertyId, selectedMonthId)
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t('movements.saveError'),
      )
    } finally {
      setIsSavingMovement(false)
    }
  }

  const sectionsClosed = cleaningClosed && maintenanceClosed
  const pendingSectionLabels = [
    cleaningClosed ? null : t('propertyReports.cleaningTitle'),
    maintenanceClosed ? null : t('propertyReports.maintenanceTitle'),
  ].filter((value): value is string => Boolean(value))
  const usesAllocations =
    report?.status === 'READY_TO_CLOSE' || report?.status === 'CLOSED'
  const canOpenReport = report?.status === 'CLOSED'
  const allocationsLocked = report?.status === 'CLOSED' || isSaving
  const canAddMovement =
    Boolean(endpoints.upsertMovement) && report?.status !== 'CLOSED'

  const closedReportMetrics = useMemo(
    () =>
      computePropertyReportMetrics(
        {
        paidByGuest: bookingTotals.paidByGuest,
        otherIncomesNet: incomeTotals.totalCost,
        payoutCleaningNet: bookingTotals.cleaningNet,
        payoutCleaningGross: bookingTotals.cleaningGross,
        cleaningFee: bookingTotals.cleaningFee,
        cleaningPayoutVat: bookingTotals.cleaningPayoutVat,
        accommodationGross: bookingTotals.accommodationGross,
        accommodationPayoutVat: bookingTotals.accommodationPayoutVat,
        accommodationNet: bookingTotals.accommodationNet,
        cleaningNet: cleaningTotal,
        cleaningKit: cleaningKitCost,
        cleaningIva: cleaningIvaTotal,
        maintenanceNet: maintenanceTotal,
        maintenanceIva: maintenanceIvaTotal,
        servicesNet: serviceTotals.cost,
        servicesIva: serviceTotals.iva,
        otherExpensesNet: expenseTotals.totalCost,
        otherExpensesIva: expenseTotals.totalIva,
        otherIncomesIva: incomeTotals.totalIva,
        bookingCount: bookingTotals.count,
        allocatedLines: [
          ...cleaningLines.map((line) => ({
            section: 'cleaning' as const,
            net: (line.price ?? 0) + (line.kitCost || 0),
            allocation: lineAllocations[`cleaning:${line.id}`] ?? '',
          })),
          ...maintenanceLines.map((line) => ({
            section: 'maintenance' as const,
            net: line.price ?? 0,
            allocation: lineAllocations[`maintenance:${line.id}`] ?? '',
          })),
          ...serviceLines.map((line) => ({
            section: 'service' as const,
            net: line.price,
            allocation: lineAllocations[`service:${line.id}`] ?? '',
          })),
          ...expenses.map((line) => ({
            section: 'expense' as const,
            net: line.amountExclIva,
            allocation: lineAllocations[`expense:${line.id}`] ?? '',
          })),
          ...incomes.map((line) => ({
            section: 'income' as const,
            net: line.amountExclIva,
            allocation: lineAllocations[`income:${line.id}`] ?? '',
          })),
        ],
        },
        reportSettings,
      ),
    [
      bookingTotals,
      cleaningIvaTotal,
      cleaningKitCost,
      cleaningLines,
      cleaningTotal,
      expenseTotals,
      expenses,
      incomeTotals,
      incomes,
      lineAllocations,
      maintenanceIvaTotal,
      maintenanceLines,
      maintenanceTotal,
      reportSettings,
      serviceLines,
      serviceTotals,
    ],
  )

  const renderLineAction = (rowId: string, isExpanded: boolean) => {
    if (usesAllocations) {
      return (
        <td>
          <AllocationChip
            value={lineAllocations[rowId] ?? ''}
            disabled={allocationsLocked}
            onChange={(allocation) => void saveAllocation(rowId, allocation)}
          />
        </td>
      )
    }
    return (
      <td>
        <button
          className="btn-icon btn-icon-ghost"
          type="button"
          aria-expanded={isExpanded}
          aria-label={t('common.toggleDetails')}
          onClick={() => toggleExpandedRow(rowId)}
        >
          {isExpanded ? '▾' : '▸'}
        </button>
      </td>
    )
  }

  const updateLineIva = (
    setLines: Dispatch<SetStateAction<ExpenseLine[]>>,
    lineId: string,
    ivaRate: IvaRate,
  ) => {
    setLines((current) =>
      current.map((entry) =>
        entry.id === lineId
          ? {
              ...entry,
              ivaRate,
              amountInclIva: roundMoney(
                entry.amountExclIva +
                  ivaEuroFromNet(entry.amountExclIva, ivaRate),
              ),
            }
          : entry,
      ),
    )
  }

  const renderMoneyLinesCard = (
    tableKey: 'expenses' | 'incomes',
    lines: ExpenseLine[],
    totals: ReturnType<typeof summarizeMoneyLines>,
    setLines: Dispatch<SetStateAction<ExpenseLine[]>>,
  ) => {
    const rowPrefix = tableKey === 'expenses' ? 'expense' : 'income'
    const kind: MovementKind = tableKey === 'expenses' ? 'outcome' : 'income'
    return (
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              {t(`propertyReports.${tableKey}Title`)}
            </h2>
            <div className="report-metrics">
              <div className="report-metric">
                <p className="card-label">
                  {t(`propertyReports.${tableKey}Count`)}
                </p>
                <p className="card-value">{totals.count}</p>
              </div>
              <div className="report-metric">
                <p className="card-label">{t('propertyReports.net')}</p>
                <p className="card-value">{money.format(totals.totalCost)}</p>
              </div>
              <div className="report-metric">
                <p className="card-label">{t('propertyReports.iva')}</p>
                <p className="card-value">{money.format(totals.totalIva)}</p>
              </div>
              <div className="report-metric">
                <p className="card-label">{t('propertyReports.gross')}</p>
                <p className="card-value">
                  {money.format(totals.totalCostWithIva)}
                </p>
              </div>
            </div>
          </div>
          <div className="table-actions">
            {canAddMovement ? (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => openMovementForm(kind)}
              >
                {t(
                  tableKey === 'expenses'
                    ? 'propertyReports.addExpense'
                    : 'propertyReports.addIncome',
                )}
              </button>
            ) : null}
            <TableToggleButton
              open={openTables[tableKey]}
              onClick={() => toggleTable(tableKey)}
              expandLabel={t('propertyReports.showTable')}
              collapseLabel={t('propertyReports.hideTable')}
            />
          </div>
        </div>
        {openTables[tableKey] ? (
          <div className="table-wrap">
            <table className="data-table report-table-clamp">
              <thead>
                <tr>
                  <th>{t('propertyReports.date')}</th>
                  <th className="report-col-clamp">
                    {t('propertyReports.item')}
                  </th>
                  <th>{t('propertyReports.origin')}</th>
                  <th>{t('propertyReports.net')}</th>
                  <th>{t('propertyReports.gross')}</th>
                  <th>
                    {usesAllocations
                      ? t('propertyReports.allocation')
                      : t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && !isLoading ? (
                  <tr>
                    <td colSpan={6}>
                      {t(
                        tableKey === 'expenses'
                          ? 'propertyReports.emptyExpenses'
                          : 'propertyReports.emptyIncomes',
                      )}
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => {
                    const rowId = `${rowPrefix}:${line.id}`
                    const isExpanded = expandedRowIds.has(rowId)
                    return (
                      <Fragment key={`${tableKey}-${line.id}`}>
                        <tr>
                          <td>{dateLabel(line.date)}</td>
                          <td className="report-col-clamp">
                            <TruncatedText value={line.itemName || ''} />
                          </td>
                          <td>{originLabel(line.origin)}</td>
                          <td>{money.format(line.amountExclIva)}</td>
                          <td>{money.format(line.amountInclIva)}</td>
                          {renderLineAction(rowId, isExpanded)}
                        </tr>
                        {!usesAllocations && isExpanded ? (
                          <tr className="detail-row">
                            <td colSpan={6}>
                              <ReportIvaDetails
                                ivaRate={line.ivaRate}
                                netAmount={line.amountExclIva}
                                money={money}
                                extra={[
                                  {
                                    label: t('propertyReports.item'),
                                    value: line.itemName || '—',
                                  },
                                ]}
                                onChange={(ivaRate) =>
                                  updateLineIva(setLines, line.id, ivaRate)
                                }
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    )
  }

  const title = selectedMonthId
    ? `${propertyLabel} · ${formatMonthLabel(selectedMonthId)}`
    : selectedPropertyId
      ? propertyLabel
      : t('pages.Property Reports')

  if (settingsProperty) {
    return (
      <PropertyReportSettingsView
        propertyId={settingsProperty.id}
        propertyName={settingsProperty.name}
        getUrl={endpoints.get}
        upsertUrl={endpoints.upsert}
        copyTargets={copyTargets}
        onBack={() => setSettingsProperty(null)}
        onSaved={(settings) => {
          setReportSettings(mergeReportSettings(settings, globalSettings))
          setSettingsProperty(null)
          setMessage(t('propertyReports.settingsSaved'))
          setError(null)
          if (selectedPropertyId) {
            void loadMonths(selectedPropertyId).catch(() => undefined)
            if (selectedMonthId) {
              void loadDetail(selectedPropertyId, selectedMonthId).catch(
                () => undefined,
              )
            }
          }
        }}
      />
    )
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('propertyReports.eyebrow')}</p>
          <div className="page-title-row">
            {selectedPropertyId ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setError(null)
                  setMessage(null)
                  if (isClosedReportOpen) {
                    setIsClosedReportOpen(false)
                    return
                  }
                  if (selectedMonthId) {
                    setSelectedMonthId('')
                    setReport(null)
                    setBookings([])
                    setExpenses([])
                    setIncomes([])
                    setServiceLines([])
                    setMovementDraft(null)
                    setLineAllocations({})
                    setIsClosedReportOpen(false)
                    return
                  }
                  setSelectedPropertyId('')
                }}
              >
                {t('common.back')}
              </button>
            ) : null}
            <h1 className="page-title">{title}</h1>
          </div>
          <p className="subtitle">
            {selectedMonthId
              ? isClosedReportOpen
                ? t('propertyReports.closedReportSubtitle')
                : t('propertyReports.monthSubtitle')
              : selectedPropertyId
                ? t('propertyReports.monthsSubtitle')
                : t('propertyReports.subtitle')}
          </p>
        </div>
        {(selectedPropertyId || (selectedMonthId && report)) ? (
          <div className="header-actions">
            {selectedPropertyId ? (
              <button
                className="btn-icon btn-icon-ghost"
                type="button"
                aria-label={t('propertyReports.openSettings')}
                title={t('propertyReports.openSettings')}
                onClick={() =>
                  setSettingsProperty({
                    id: selectedPropertyId,
                    name: propertyLabel,
                  })
                }
              >
                <SettingsGearIcon />
              </button>
            ) : null}
            {selectedMonthId && report && !isClosedReportOpen ? (
              <button
                className={`btn-icon${canOpenReport ? '' : ' is-disabled'}`}
                type="button"
                disabled={!canOpenReport}
                aria-label={t('propertyReports.openReport')}
                title={
                  canOpenReport
                    ? t('propertyReports.openReport')
                    : t('propertyReports.reportLocked')
                }
                onClick={() => setIsClosedReportOpen(true)}
              >
                <ReportDocumentIcon />
              </button>
            ) : null}
            {selectedMonthId && report && canChangeStatus && report.status === 'PENDING_TO_CLOSE' ? (
              <button
                className="btn-secondary"
                type="button"
                disabled={isSaving || !sectionsClosed}
                title={
                  sectionsClosed
                    ? undefined
                    : t('propertyReports.sectionsMustClose', {
                        sections: pendingSectionLabels.join(', '),
                      })
                }
                onClick={() => void saveStatus('ready')}
              >
                {t('propertyReports.markReady')}
              </button>
            ) : null}
            {selectedMonthId && report && canChangeStatus && report.canClose ? (
              <button
                className="btn-primary"
                type="button"
                disabled={isSaving}
                onClick={() => void saveStatus('close')}
              >
                {t('propertyReports.closeMonth')}
              </button>
            ) : null}
            {selectedMonthId && report && canChangeStatus && report.canReopen ? (
              <button
                className="btn-secondary"
                type="button"
                disabled={isSaving}
                onClick={() => void saveStatus('reopen')}
              >
                {t('propertyReports.reopenMonth')}
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {error ? <p className="notice error">{error}</p> : null}
      {message ? <p className="notice success">{message}</p> : null}
      {selectedMonthId &&
      report?.status === 'PENDING_TO_CLOSE' &&
      !sectionsClosed ? (
        <p className="report-billing-warning" role="status">
          {t('propertyReports.sectionsMustClose', {
            sections: pendingSectionLabels.join(', '),
          })}
        </p>
      ) : null}
      {isLoading ? <p>{t('common.loading')}</p> : null}

      {!selectedPropertyId ? (
        <section className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('operations.property')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {properties.length === 0 ? (
                  <tr>
                    <td colSpan={2}>{t('propertyReports.emptyProperties')}</td>
                  </tr>
                ) : (
                  properties.map((property) => (
                    <tr key={property.id}>
                      <td>{propertyReportsLabel(property)}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="btn-icon btn-icon-ghost"
                            type="button"
                            aria-label={t('propertyReports.openMonths')}
                            title={t('propertyReports.openMonths')}
                            onClick={() => setSelectedPropertyId(property.id)}
                          >
                            <ReportDocumentIcon />
                          </button>
                          <button
                            className="btn-icon btn-icon-ghost"
                            type="button"
                            aria-label={t('propertyReports.openSettings')}
                            title={t('propertyReports.openSettings')}
                            onClick={() =>
                              setSettingsProperty({
                                id: property.id,
                                name: propertyReportsLabel(property),
                              })
                            }
                          >
                            <SettingsGearIcon />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {selectedPropertyId && !selectedMonthId ? (
        <section className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('propertyReports.month')}</th>
                  <th>{t('propertyReports.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {months.length === 0 && !isLoading ? (
                  <tr>
                    <td colSpan={3}>{t('propertyReports.emptyMonths')}</td>
                  </tr>
                ) : (
                  months.map((month) => (
                    <tr key={month.id}>
                      <td>{formatMonthLabel(month.id)}</td>
                      <td>{statusLabel(month.status)}</td>
                      <td>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setSelectedMonthId(month.id)}
                        >
                          {t('propertyReports.open')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {selectedMonthId && isClosedReportOpen ? (
        <PropertyClosedReportView
          metrics={closedReportMetrics}
          visibility={reportSettings.visibility}
          hideManagementFee={reportSettings.businessModel === 'fixedRent'}
          feeFormula={
            reportSettings.businessModel === 'commission'
              ? reportSettings.formula.trim() || DEFAULT_COMMISSION_FORMULA
              : undefined
          }
          contributionFormula={
            reportSettings.propertyContributionFormula.trim() || undefined
          }
          ourProfitFormula={reportSettings.ourProfitFormula.trim() || undefined}
          netEarningsFormula={
            reportSettings.netEarningsFormula.trim() || undefined
          }
        />
      ) : null}

      {selectedMonthId && !isClosedReportOpen ? (
        <>
          {report ? (
            <p className="subtitle">
              {t('propertyReports.status')}: {statusLabel(report.status)}
            </p>
          ) : null}

          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">{t('propertyReports.bookingsTitle')}</h2>
                <div className="report-metrics">
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.bookingsCount')}</p>
                    <p className="card-value">{bookingTotals.count}</p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.paidByGuest')}</p>
                    <p className="card-value">
                      {money.format(bookingTotals.paidByGuest)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.cleaningFee')}</p>
                    <p className="card-value">
                      {money.format(bookingTotals.cleaningFee)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.cleaningGross')}</p>
                    <p className="card-value">
                      {money.format(bookingTotals.cleaningGross)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">
                      {t('propertyReports.cleaningPayoutVat')}
                    </p>
                    <p className="card-value">
                      {money.format(bookingTotals.cleaningPayoutVat)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.cleaningNet')}</p>
                    <p className="card-value">
                      {money.format(bookingTotals.cleaningNet)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">
                      {t('propertyReports.accommodationGross')}
                    </p>
                    <p className="card-value">
                      {money.format(bookingTotals.accommodationGross)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">
                      {t('propertyReports.accommodationPayoutVat')}
                    </p>
                    <p className="card-value">
                      {money.format(bookingTotals.accommodationPayoutVat)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">
                      {t('propertyReports.accommodationNet')}
                    </p>
                    <p className="card-value">
                      {money.format(bookingTotals.accommodationNet)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.channelFee')}</p>
                    <p className="card-value">
                      {money.format(bookingTotals.serviceFee)}
                    </p>
                  </div>
                </div>
              </div>
              <TableToggleButton
                open={openTables.bookings}
                onClick={() => toggleTable('bookings')}
                expandLabel={t('propertyReports.showTable')}
                collapseLabel={t('propertyReports.hideTable')}
              />
            </div>
            {openTables.bookings ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('propertyReports.bookingId')}</th>
                      <th>{t('propertyReports.guestName')}</th>
                      <th>{t('propertyReports.checkIn')}</th>
                      <th>{t('propertyReports.paidByGuest')}</th>
                      <th>{t('propertyReports.cleaningGross')}</th>
                      <th>{t('propertyReports.channelFee')}</th>
                      <th>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payoutRows.length === 0 && !isLoading ? (
                      <tr>
                        <td colSpan={7}>{t('propertyReports.emptyBookings')}</td>
                      </tr>
                    ) : (
                      payoutRows.map((row) => {
                        const booking = row.booking
                        const rowId = `booking:${booking.reservationId || booking.bookingId}`
                        const isExpanded = expandedRowIds.has(rowId)
                        const moneyOrDash = (value: number | null) =>
                          value === null ? '—' : money.format(value)
                        return (
                          <Fragment key={booking.reservationId || booking.bookingId}>
                            <tr>
                              <td>{booking.bookingId}</td>
                              <td>{booking.guestName || '—'}</td>
                              <td>{dateLabel(booking.checkInDate)}</td>
                              <td>{moneyOrDash(row.guestPay)}</td>
                              <td>{moneyOrDash(row.cleaningGross)}</td>
                              <td>{moneyOrDash(booking.hostServiceFee)}</td>
                              <td>
                                <button
                                  className="btn-icon btn-icon-ghost"
                                  type="button"
                                  aria-expanded={isExpanded}
                                  aria-label={t('common.toggleDetails')}
                                  onClick={() => toggleExpandedRow(rowId)}
                                >
                                  {isExpanded ? '▾' : '▸'}
                                </button>
                              </td>
                            </tr>
                            {isExpanded ? (
                              <tr className="detail-row">
                                <td colSpan={7}>
                                  <div className="detail-grid report-iva-details">
                                    <div>
                                      <p className="detail-label">
                                        {t('propertyReports.checkOut')}
                                      </p>
                                      <p className="detail-value">
                                        {dateLabel(booking.checkOutDate)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">
                                        {t('propertyReports.payout')}
                                      </p>
                                      <p className="detail-value">
                                        {moneyOrDash(booking.hostPayout)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">
                                        {t('propertyReports.cleaningFee')}
                                      </p>
                                      <p className="detail-value">
                                        {moneyOrDash(row.cleaningFee)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">
                                        {t('propertyReports.cleaningGross')}
                                      </p>
                                      <p className="detail-value">
                                        {moneyOrDash(row.cleaningGross)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">
                                        {t('propertyReports.cleaningPayoutVat')}
                                      </p>
                                      <p className="detail-value">
                                        {moneyOrDash(row.cleaningPayoutVat)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">
                                        {t('propertyReports.cleaningNet')}
                                      </p>
                                      <p className="detail-value">
                                        {moneyOrDash(row.cleaningNet)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">
                                        {t('propertyReports.accommodationGross')}
                                      </p>
                                      <p className="detail-value">
                                        {moneyOrDash(row.accommodationGross)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">
                                        {t('propertyReports.accommodationPayoutVat')}
                                      </p>
                                      <p className="detail-value">
                                        {moneyOrDash(row.accommodationPayoutVat)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="detail-label">
                                        {t('propertyReports.accommodationNet')}
                                      </p>
                                      <p className="detail-value">
                                        {moneyOrDash(row.accommodationNet)}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title-row">
                  <h2 className="card-title">
                    {t('propertyReports.cleaningTitle')}
                  </h2>
                  {!cleaningClosed ? (
                    <span className="report-billing-warning" role="status">
                      {t('propertyReports.billingPendingWarning')}
                    </span>
                  ) : null}
                </div>
                <div className="report-metrics">
                  <div className="report-metric">
                    <p className="card-label">
                      {t('propertyReports.cleaningsCount')}
                    </p>
                    <p className="card-value">{cleaningLines.length}</p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.net')}</p>
                    <p className="card-value">{money.format(cleaningTotal)}</p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.iva')}</p>
                    <p className="card-value">
                      {money.format(cleaningIvaTotal)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.gross')}</p>
                    <p className="card-value">
                      {money.format(cleaningGrossTotal)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.kit')}</p>
                    <p className="card-value">{money.format(cleaningKitCost)}</p>
                  </div>
                </div>
              </div>
              <div className="table-actions">
                {!cleaningClosed ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      onNavigate('Cleaning Billing', {
                        billingMonth: selectedMonthId,
                      })
                    }
                  >
                    {t('propertyReports.openCleaningBilling')}
                  </button>
                ) : null}
                <TableToggleButton
                  open={openTables.cleaning}
                  onClick={() => toggleTable('cleaning')}
                  expandLabel={t('propertyReports.showTable')}
                  collapseLabel={t('propertyReports.hideTable')}
                />
              </div>
            </div>
            {openTables.cleaning ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('propertyReports.date')}</th>
                      <th>{t('propertyReports.cleaningType')}</th>
                      <th>{t('propertyReports.netColumn')}</th>
                      <th>{t('propertyReports.grossColumn')}</th>
                      <th>{t('propertyReports.kit')}</th>
                      <th>
                        {usesAllocations
                          ? t('propertyReports.allocation')
                          : t('common.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cleaningLines.length === 0 ? (
                      <tr>
                        <td colSpan={6}>{t('propertyReports.emptyCleaning')}</td>
                      </tr>
                    ) : (
                      cleaningLines.map((line) => {
                        const rowId = `cleaning:${line.id}`
                        const isExpanded = expandedRowIds.has(rowId)
                        return (
                          <Fragment key={line.id}>
                            <tr>
                              <td>{dateLabel(line.date)}</td>
                              <td>{line.cleaningTypeName || '—'}</td>
                              <td>
                                {line.price === null
                                  ? '—'
                                  : money.format(line.price)}
                              </td>
                              <td>
                                {line.price === null
                                  ? '—'
                                  : money.format(
                                      grossFromNet(line.price, line.ivaRate),
                                    )}
                              </td>
                              <td>
                                {line.kitCost
                                  ? money.format(line.kitCost)
                                  : '—'}
                              </td>
                              {renderLineAction(rowId, isExpanded)}
                            </tr>
                            {!usesAllocations && isExpanded ? (
                              <tr className="detail-row">
                                <td colSpan={6}>
                                  <ReportIvaDetails
                                    ivaRate={line.ivaRate}
                                    netAmount={line.price ?? 0}
                                    money={money}
                                    onChange={(ivaRate) =>
                                      setCleaningLines((current) =>
                                        current.map((entry) =>
                                          entry.id === line.id
                                            ? { ...entry, ivaRate }
                                            : entry,
                                        ),
                                      )
                                    }
                                  />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title-row">
                  <h2 className="card-title">
                    {t('propertyReports.maintenanceTitle')}
                  </h2>
                  {!maintenanceClosed ? (
                    <span className="report-billing-warning" role="status">
                      {t('propertyReports.billingPendingWarning')}
                    </span>
                  ) : null}
                </div>
                <div className="report-metrics">
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.visitsCount')}</p>
                    <p className="card-value">{maintenanceLines.length}</p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.net')}</p>
                    <p className="card-value">
                      {money.format(maintenanceTotal)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.iva')}</p>
                    <p className="card-value">
                      {money.format(maintenanceIvaTotal)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.gross')}</p>
                    <p className="card-value">
                      {money.format(maintenanceGrossTotal)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="table-actions">
                {!maintenanceClosed ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() =>
                      onNavigate('Maintenance Billing', {
                        billingMonth: selectedMonthId,
                      })
                    }
                  >
                    {t('propertyReports.openMaintenanceBilling')}
                  </button>
                ) : null}
                <TableToggleButton
                  open={openTables.maintenance}
                  onClick={() => toggleTable('maintenance')}
                  expandLabel={t('propertyReports.showTable')}
                  collapseLabel={t('propertyReports.hideTable')}
                />
              </div>
            </div>
            {openTables.maintenance ? (
              <div className="table-wrap">
                <table className="data-table report-table-clamp">
                  <thead>
                    <tr>
                      <th>{t('propertyReports.date')}</th>
                      <th className="report-col-clamp">
                        {t('propertyReports.jobsColumn')}
                      </th>
                      <th>{t('propertyReports.netColumn')}</th>
                      <th>{t('propertyReports.grossColumn')}</th>
                      <th>
                        {usesAllocations
                          ? t('propertyReports.allocation')
                          : t('common.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintenanceLines.length === 0 ? (
                      <tr>
                        <td colSpan={5}>
                          {t('propertyReports.emptyMaintenance')}
                        </td>
                      </tr>
                    ) : (
                      maintenanceLines.map((line) => {
                        const rowId = `maintenance:${line.id}`
                        const isExpanded = expandedRowIds.has(rowId)
                        return (
                          <Fragment key={line.id}>
                            <tr>
                              <td>{dateLabel(line.date)}</td>
                              <td className="report-col-clamp">
                                <TruncatedText value={line.title || ''} />
                              </td>
                              <td>
                                {line.price === null
                                  ? '—'
                                  : money.format(line.price)}
                              </td>
                              <td>
                                {line.price === null
                                  ? '—'
                                  : money.format(
                                      grossFromNet(line.price, line.ivaRate),
                                    )}
                              </td>
                              {renderLineAction(rowId, isExpanded)}
                            </tr>
                            {!usesAllocations && isExpanded ? (
                              <tr className="detail-row">
                                <td colSpan={5}>
                                  <ReportIvaDetails
                                    ivaRate={line.ivaRate}
                                    netAmount={line.price ?? 0}
                                    money={money}
                                    extra={[
                                      {
                                        label: t('propertyReports.jobsColumn'),
                                        value: line.title || '—',
                                      },
                                    ]}
                                    onChange={(ivaRate) =>
                                      setMaintenanceLines((current) =>
                                        current.map((entry) =>
                                          entry.id === line.id
                                            ? { ...entry, ivaRate }
                                            : entry,
                                        ),
                                      )
                                    }
                                  />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">{t('propertyReports.servicesTitle')}</h2>
                <div className="report-metrics">
                  <div className="report-metric">
                    <p className="card-label">
                      {t('propertyReports.servicesCount')}
                    </p>
                    <p className="card-value">{serviceTotals.count}</p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.net')}</p>
                    <p className="card-value">
                      {money.format(serviceTotals.cost)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.iva')}</p>
                    <p className="card-value">
                      {money.format(serviceTotals.iva)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.gross')}</p>
                    <p className="card-value">
                      {money.format(serviceTotals.costWithIva)}
                    </p>
                  </div>
                </div>
              </div>
              <TableToggleButton
                open={openTables.services}
                onClick={() => toggleTable('services')}
                expandLabel={t('propertyReports.showTable')}
                collapseLabel={t('propertyReports.hideTable')}
              />
            </div>
            {openTables.services ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('propertyReports.date')}</th>
                      <th>{t('propertyReports.serviceTitle')}</th>
                      <th>{t('propertyReports.recurrence')}</th>
                      <th>{t('propertyReports.net')}</th>
                      <th>{t('propertyReports.gross')}</th>
                      <th>
                        {usesAllocations
                          ? t('propertyReports.allocation')
                          : t('common.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {serviceLines.length === 0 && !isLoading ? (
                      <tr>
                        <td colSpan={6}>{t('propertyReports.emptyServices')}</td>
                      </tr>
                    ) : (
                      serviceLines.map((line) => {
                        const rowId = `service:${line.id}`
                        const isExpanded = expandedRowIds.has(rowId)
                        return (
                          <Fragment key={line.id}>
                            <tr>
                              <td>{dateLabel(line.date)}</td>
                              <td>{line.title || '—'}</td>
                              <td>{recurrenceLabel(line.recurrence)}</td>
                              <td>{money.format(line.price)}</td>
                              <td>{money.format(line.priceWithIva)}</td>
                              {renderLineAction(rowId, isExpanded)}
                            </tr>
                            {!usesAllocations && isExpanded ? (
                              <tr className="detail-row">
                                <td colSpan={6}>
                                  <ReportIvaDetails
                                    ivaRate={line.ivaRate}
                                    netAmount={line.price}
                                    money={money}
                                    onChange={(ivaRate) =>
                                      setServiceLines((current) =>
                                        current.map((entry) =>
                                          entry.id === line.id
                                            ? {
                                                ...entry,
                                                ivaRate,
                                                priceWithIva: roundMoney(
                                                  entry.price +
                                                    ivaEuroFromNet(
                                                      entry.price,
                                                      ivaRate,
                                                    ),
                                                ),
                                              }
                                            : entry,
                                        ),
                                      )
                                    }
                                  />
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          {renderMoneyLinesCard(
            'expenses',
            expenses,
            expenseTotals,
            setExpenses,
          )}
          {renderMoneyLinesCard('incomes', incomes, incomeTotals, setIncomes)}
        </>
      ) : null}

      {movementDraft ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {movementDraft.kind === 'outcome'
                    ? t('propertyReports.addExpenseTitle')
                    : t('propertyReports.addIncomeTitle')}
                </h3>
                <p className="modal-subtitle">
                  {t('propertyReports.addMovementSubtitle')}
                </p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setMovementDraft(null)}
                aria-label={t('common.closeForm')}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <label>
                  {t('movements.property')}
                  <input type="text" value={propertyLabel} readOnly />
                </label>
                <label>
                  {t('movements.date')}
                  <input
                    type="date"
                    min={`${selectedMonthId}-01`}
                    max={lastDateInMonth(selectedMonthId)}
                    value={movementDraft.date}
                    onChange={(event) =>
                      setMovementDraft((current) =>
                        current
                          ? { ...current, date: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  {t('movements.description')}
                  <input
                    type="text"
                    value={movementDraft.description}
                    onChange={(event) =>
                      setMovementDraft((current) =>
                        current
                          ? { ...current, description: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  {t('movements.kind')}
                  <input
                    type="text"
                    readOnly
                    value={
                      movementDraft.kind === 'outcome'
                        ? t('movements.outcome')
                        : t('movements.income')
                    }
                  />
                </label>
                <div className="services-iva-row">
                  <label className="form-field">
                    <span>{t('movements.price')}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={movementDraft.amount}
                      onChange={(event) =>
                        setMovementDraft((current) =>
                          current
                            ? {
                                ...current,
                                ...syncDraftFromNet(
                                  event.target.value,
                                  current.ivaRate,
                                ),
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                  <label className="form-field">
                    <span>{t('movements.appliesIva')}</span>
                    <select
                      value={String(movementDraft.ivaRate)}
                      onChange={(event) =>
                        setMovementDraft((current) =>
                          current
                            ? {
                                ...current,
                                ...syncDraftFromNet(
                                  current.amount,
                                  parseIvaRate(event.target.value) ?? 0,
                                ),
                              }
                            : current,
                        )
                      }
                    >
                      {IVA_RATES.map((rate) => (
                        <option key={rate} value={rate}>
                          {rate === 10
                            ? t('common.iva10')
                            : rate === 21
                              ? t('common.iva21')
                              : t('common.ivaNone')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>{t('movements.priceWithIva')}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={movementDraft.totalAmount}
                      onChange={(event) =>
                        setMovementDraft((current) =>
                          current
                            ? {
                                ...current,
                                ...syncDraftFromGross(
                                  event.target.value,
                                  current.ivaRate,
                                ),
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setMovementDraft(null)}
              >
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={isSavingMovement}
                onClick={() => void saveMovement()}
              >
                {isSavingMovement ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
