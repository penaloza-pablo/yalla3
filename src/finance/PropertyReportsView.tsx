import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IVA_RATES,
  parseIvaRate,
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
    }),
    [getEndpoint],
  )

  const properties = useMemo(
    () => filterPropertyReportsOptions(propertyOptions),
    [propertyOptions],
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
  const [serviceLines, setServiceLines] = useState<ServiceLine[]>([])
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [openTables, setOpenTables] = useState({
    bookings: false,
    cleaning: false,
    maintenance: false,
    expenses: false,
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

  const bookingTotals = useMemo(
    () => ({
      count: bookings.length,
      payout: bookings.reduce((sum, booking) => sum + (booking.hostPayout ?? 0), 0),
      cleaningFee: bookings.reduce(
        (sum, booking) => sum + (booking.fareCleaning ?? 0),
        0,
      ),
      serviceFee: bookings.reduce(
        (sum, booking) => sum + (booking.hostServiceFee ?? 0),
        0,
      ),
    }),
    [bookings],
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
  const expenseTotals = useMemo(
    () => ({
      count: expenses.length,
      totalCost: expenses.reduce((sum, line) => sum + line.amountExclIva, 0),
      totalIva: roundMoney(
        expenses.reduce(
          (sum, line) =>
            sum + ivaEuroFromNet(line.amountExclIva, line.ivaRate),
          0,
        ),
      ),
      totalCostWithIva: expenses.reduce(
        (sum, line) => sum + line.amountInclIva,
        0,
      ),
    }),
    [expenses],
  )
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
      const payload = await fetchJson<{ months?: Record<string, unknown>[] }>(
        `${endpoints.get}?propertyId=${encodeURIComponent(propertyId)}`,
      )
      setMonths((payload.months ?? []).map(mapMonth))
    },
    [endpoints.get, t],
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
        services?: {
          lines?: ServiceLine[]
        }
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
      setExpenses(
        (payload.expenses?.lines ?? []).map((item) => ({
          ...item,
          ivaRate:
            parseIvaRate((item as ExpenseLine).ivaRate) ??
            inferIvaRate(item.amountExclIva, item.amountInclIva, 0),
        })),
      )
      setServiceLines(
        (payload.services?.lines ?? []).map((item) => ({
          ...item,
          ivaRate:
            parseIvaRate((item as ServiceLine).ivaRate) ??
            inferIvaRate(item.price, item.priceWithIva, 0),
        })),
      )
    },
    [endpoints.get, t],
  )

  useEffect(() => {
    if (!selectedPropertyId) {
      setMonths([])
      setSelectedMonthId('')
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
      services: false,
    })
    setExpandedRowIds(new Set())
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

  const title = selectedMonthId
    ? `${propertyLabel} · ${formatMonthLabel(selectedMonthId)}`
    : selectedPropertyId
      ? propertyLabel
      : t('pages.Property Reports')

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
                  if (selectedMonthId) {
                    setSelectedMonthId('')
                    setReport(null)
                    setBookings([])
                    setExpenses([])
                    setServiceLines([])
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
              ? t('propertyReports.monthSubtitle')
              : selectedPropertyId
                ? t('propertyReports.monthsSubtitle')
                : t('propertyReports.subtitle')}
          </p>
        </div>
        {selectedMonthId && report && canChangeStatus ? (
          <div className="header-actions">
            {report.canMarkReady ? (
              <button
                className="btn-secondary"
                type="button"
                disabled={isSaving}
                onClick={() => void saveStatus('ready')}
              >
                {t('propertyReports.markReady')}
              </button>
            ) : null}
            {report.canClose ? (
              <button
                className="btn-primary"
                type="button"
                disabled={isSaving}
                onClick={() => void saveStatus('close')}
              >
                {t('propertyReports.closeMonth')}
              </button>
            ) : null}
            {report.canReopen ? (
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
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setSelectedPropertyId(property.id)}
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

      {selectedMonthId ? (
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
                    <p className="card-label">{t('propertyReports.payout')}</p>
                    <p className="card-value">
                      {money.format(bookingTotals.payout)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.cleaningFee')}</p>
                    <p className="card-value">
                      {money.format(bookingTotals.cleaningFee)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.serviceFee')}</p>
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
                      <th>{t('propertyReports.checkOut')}</th>
                      <th>{t('propertyReports.hostPayout')}</th>
                      <th>{t('propertyReports.fareCleaning')}</th>
                      <th>{t('propertyReports.hostServiceFee')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.length === 0 && !isLoading ? (
                      <tr>
                        <td colSpan={7}>{t('propertyReports.emptyBookings')}</td>
                      </tr>
                    ) : (
                      bookings.map((booking) => (
                        <tr key={booking.reservationId || booking.bookingId}>
                          <td>{booking.bookingId}</td>
                          <td>{booking.guestName || '—'}</td>
                          <td>{dateLabel(booking.checkInDate)}</td>
                          <td>{dateLabel(booking.checkOutDate)}</td>
                          <td>
                            {booking.hostPayout === null
                              ? '—'
                              : money.format(booking.hostPayout)}
                          </td>
                          <td>
                            {booking.fareCleaning === null
                              ? '—'
                              : money.format(booking.fareCleaning)}
                          </td>
                          <td>
                            {booking.hostServiceFee === null
                              ? '—'
                              : money.format(booking.hostServiceFee)}
                          </td>
                        </tr>
                      ))
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
                      <th>{t('common.actions')}</th>
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
                      <th>{t('common.actions')}</th>
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
                      <th>{t('common.actions')}</th>
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

          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">{t('propertyReports.expensesTitle')}</h2>
                <div className="report-metrics">
                  <div className="report-metric">
                    <p className="card-label">
                      {t('propertyReports.expensesCount')}
                    </p>
                    <p className="card-value">{expenseTotals.count}</p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.net')}</p>
                    <p className="card-value">
                      {money.format(expenseTotals.totalCost)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.iva')}</p>
                    <p className="card-value">
                      {money.format(expenseTotals.totalIva)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">{t('propertyReports.gross')}</p>
                    <p className="card-value">
                      {money.format(expenseTotals.totalCostWithIva)}
                    </p>
                  </div>
                </div>
              </div>
              <TableToggleButton
                open={openTables.expenses}
                onClick={() => toggleTable('expenses')}
                expandLabel={t('propertyReports.showTable')}
                collapseLabel={t('propertyReports.hideTable')}
              />
            </div>
            {openTables.expenses ? (
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
                      <th>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.length === 0 && !isLoading ? (
                      <tr>
                        <td colSpan={6}>{t('propertyReports.emptyExpenses')}</td>
                      </tr>
                    ) : (
                      expenses.map((line) => {
                        const rowId = `expense:${line.id}`
                        const isExpanded = expandedRowIds.has(rowId)
                        return (
                          <Fragment key={line.id}>
                            <tr>
                              <td>{dateLabel(line.date)}</td>
                              <td className="report-col-clamp">
                                <TruncatedText value={line.itemName || ''} />
                              </td>
                              <td>{originLabel(line.origin)}</td>
                              <td>{money.format(line.amountExclIva)}</td>
                              <td>{money.format(line.amountInclIva)}</td>
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
                                      setExpenses((current) =>
                                        current.map((entry) =>
                                          entry.id === line.id
                                            ? {
                                                ...entry,
                                                ivaRate,
                                                amountInclIva: roundMoney(
                                                  entry.amountExclIva +
                                                    ivaEuroFromNet(
                                                      entry.amountExclIva,
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
        </>
      ) : null}
    </>
  )
}
