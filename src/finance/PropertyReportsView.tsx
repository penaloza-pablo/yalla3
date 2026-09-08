import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ACTION_KEYS } from '../../amplify/functions/shared/rbac-catalog'
import { usePermissions } from '../rbac/PermissionsProvider'
import { fetchJson } from '../operations/api'
import { formatDateOnlyLabel } from '../operations/dateHelpers'
import { getPropertyLabel } from '../operations/propertyHelpers'
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
}

type MaintenanceLine = {
  id: string
  date: string
  title: string
  visitTypeName: string
  price: number | null
}

type ExpenseLine = {
  id: string
  origin: string
  itemName: string
  date: string
  amountExclIva: number
  amountInclIva: number
}

const PHASE1_NICKNAME = 'esperanza 9'
const PHASE1_MONTH_IDS = ['2026-08']

const isPhase1Property = (property: PropertyOption) =>
  [property.nickname, property.listingNickname, property.title]
    .map((value) => value.trim().toLowerCase())
    .includes(PHASE1_NICKNAME)

const fallbackMonths = (): ReportMonth[] =>
  PHASE1_MONTH_IDS.map((id) => ({
    id,
    status: 'PENDING_TO_CLOSE',
    canMarkReady: true,
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
    () => propertyOptions.filter(isPhase1Property),
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
  const [maintenanceTotal, setMaintenanceTotal] = useState(0)
  const [expenses, setExpenses] = useState<ExpenseLine[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [openTables, setOpenTables] = useState({
    bookings: false,
    cleaning: false,
    maintenance: false,
    expenses: false,
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
  const cleaningPriceWithIva = cleaningTotal * 1.21
  const expenseTotals = useMemo(
    () => ({
      count: expenses.length,
      totalCost: expenses.reduce((sum, line) => sum + line.amountExclIva, 0),
      totalCostWithIva: expenses.reduce(
        (sum, line) => sum + line.amountInclIva,
        0,
      ),
    }),
    [expenses],
  )

  const originLabel = (origin: string) => {
    if (origin === 'subtraction') {
      return t('propertyReports.originSubtraction')
    }
    return origin
  }

  const toggleTable = (key: keyof typeof openTables) => {
    setOpenTables((current) => ({ ...current, [key]: !current[key] }))
  }

  const selectedProperty = properties.find(
    (property) => property.id === selectedPropertyId,
  )
  const propertyLabel = selectedProperty
    ? getPropertyLabel(selectedProperty)
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
          lines?: CleaningLine[]
          total?: number
        }
        maintenance?: {
          closed?: boolean
          lines?: MaintenanceLine[]
          total?: number
        }
        expenses?: {
          lines?: ExpenseLine[]
        }
      }>(
        `${endpoints.get}?propertyId=${encodeURIComponent(propertyId)}&month=${encodeURIComponent(monthId)}`,
      )
      setMonths((payload.months ?? []).map(mapMonth))
      setReport(payload.report ? mapMonth(payload.report) : null)
      setBookings(payload.bookings ?? [])
      setCleaningClosed(Boolean(payload.cleaning?.closed))
      setMaintenanceClosed(Boolean(payload.maintenance?.closed))
      setCleaningLines(payload.cleaning?.lines ?? [])
      setMaintenanceLines(payload.maintenance?.lines ?? [])
      setCleaningTotal(Number(payload.cleaning?.total ?? 0))
      setMaintenanceTotal(Number(payload.maintenance?.total ?? 0))
      setExpenses(payload.expenses?.lines ?? [])
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
    })
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
                      <td>{getPropertyLabel(property)}</td>
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
              <button
                type="button"
                className="btn-secondary"
                onClick={() => toggleTable('bookings')}
              >
                {openTables.bookings
                  ? t('propertyReports.hideTable')
                  : t('propertyReports.showTable')}
              </button>
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
                <h2 className="card-title">{t('propertyReports.cleaningTitle')}</h2>
                {cleaningClosed ? (
                  <div className="report-metrics">
                    <div className="report-metric">
                      <p className="card-label">
                        {t('propertyReports.cleaningsCount')}
                      </p>
                      <p className="card-value">{cleaningLines.length}</p>
                    </div>
                    <div className="report-metric">
                      <p className="card-label">{t('propertyReports.price')}</p>
                      <p className="card-value">{money.format(cleaningTotal)}</p>
                    </div>
                    <div className="report-metric">
                      <p className="card-label">{t('propertyReports.priceWithIva')}</p>
                      <p className="card-value">
                        {money.format(cleaningPriceWithIva)}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
              {cleaningClosed ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => toggleTable('cleaning')}
                >
                  {openTables.cleaning
                    ? t('propertyReports.hideTable')
                    : t('propertyReports.showTable')}
                </button>
              ) : null}
            </div>
            {cleaningClosed ? (
              openTables.cleaning ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t('propertyReports.date')}</th>
                        <th>{t('propertyReports.cleaningType')}</th>
                        <th>{t('propertyReports.visitStatus')}</th>
                        <th>{t('propertyReports.price')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cleaningLines.length === 0 ? (
                        <tr>
                          <td colSpan={4}>{t('propertyReports.emptyCleaning')}</td>
                        </tr>
                      ) : (
                        cleaningLines.map((line) => (
                          <tr key={line.id}>
                            <td>{dateLabel(line.date)}</td>
                            <td>{line.cleaningTypeName || '—'}</td>
                            <td>{line.status || '—'}</td>
                            <td>
                              {line.price === null
                                ? '—'
                                : money.format(line.price)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null
            ) : (
              <p className="notice">
                {t('propertyReports.cleaningPending')}{' '}
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
              </p>
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  {t('propertyReports.maintenanceTitle')}
                </h2>
                {maintenanceClosed ? (
                  <div className="report-metrics">
                    <div className="report-metric">
                      <p className="card-label">{t('propertyReports.visitsCount')}</p>
                      <p className="card-value">{maintenanceLines.length}</p>
                    </div>
                    <div className="report-metric">
                      <p className="card-label">{t('propertyReports.price')}</p>
                      <p className="card-value">
                        {money.format(maintenanceTotal)}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
              {maintenanceClosed ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => toggleTable('maintenance')}
                >
                  {openTables.maintenance
                    ? t('propertyReports.hideTable')
                    : t('propertyReports.showTable')}
                </button>
              ) : null}
            </div>
            {maintenanceClosed ? (
              openTables.maintenance ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t('propertyReports.date')}</th>
                        <th>{t('propertyReports.visitTitle')}</th>
                        <th>{t('propertyReports.visitType')}</th>
                        <th>{t('propertyReports.price')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {maintenanceLines.length === 0 ? (
                        <tr>
                          <td colSpan={4}>
                            {t('propertyReports.emptyMaintenance')}
                          </td>
                        </tr>
                      ) : (
                        maintenanceLines.map((line) => (
                          <tr key={line.id}>
                            <td>{dateLabel(line.date)}</td>
                            <td>{line.title || '—'}</td>
                            <td>{line.visitTypeName || '—'}</td>
                            <td>
                              {line.price === null
                                ? '—'
                                : money.format(line.price)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : null
            ) : (
              <p className="notice">
                {t('propertyReports.maintenancePending')}{' '}
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
              </p>
            )}
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
                    <p className="card-label">{t('propertyReports.totalCost')}</p>
                    <p className="card-value">
                      {money.format(expenseTotals.totalCost)}
                    </p>
                  </div>
                  <div className="report-metric">
                    <p className="card-label">
                      {t('propertyReports.totalCostWithIva')}
                    </p>
                    <p className="card-value">
                      {money.format(expenseTotals.totalCostWithIva)}
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => toggleTable('expenses')}
              >
                {openTables.expenses
                  ? t('propertyReports.hideTable')
                  : t('propertyReports.showTable')}
              </button>
            </div>
            {openTables.expenses ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('propertyReports.origin')}</th>
                      <th>{t('propertyReports.item')}</th>
                      <th>{t('propertyReports.date')}</th>
                      <th>{t('propertyReports.amountExclIva')}</th>
                      <th>{t('propertyReports.amountInclIva')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.length === 0 && !isLoading ? (
                      <tr>
                        <td colSpan={5}>{t('propertyReports.emptyExpenses')}</td>
                      </tr>
                    ) : (
                      expenses.map((line) => (
                        <tr key={line.id}>
                          <td>{originLabel(line.origin)}</td>
                          <td>{line.itemName || '—'}</td>
                          <td>{dateLabel(line.date)}</td>
                          <td>{money.format(line.amountExclIva)}</td>
                          <td>{money.format(line.amountInclIva)}</td>
                        </tr>
                      ))
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
