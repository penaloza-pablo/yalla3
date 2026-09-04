import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { fetchJson } from '../operations/api'
import { VisitDetailModal } from '../operations/VisitDetailModal'
import {
  formatDateOnlyLabel,
  getMadridMonthRange,
  getTodayMadrid,
  getTomorrowMadrid,
  isPlanDateTooFarAhead,
} from '../operations/dateHelpers'
import type { PropertyOption } from '../operations/types'
import type {
  CleanerRecord,
  CleaningPlanRecord,
  CleaningPlanRow,
  CleaningPlanStatus,
  PropertyCleaningType,
} from './types'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
  isSummaryInfoOpen: boolean
  onToggleSummaryInfo: () => void
}

const mapCleaner = (item: Record<string, unknown>): CleanerRecord => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? item.id ?? ''),
  active: item.active !== false,
})

const mapCleaningType = (item: Record<string, unknown>): PropertyCleaningType => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? ''),
  price: Number(item.price ?? 0),
  durationHours: Number(item.durationHours ?? 0),
  isDefault: Boolean(item.isDefault),
})

const mapPlanRow = (item: Record<string, unknown>): CleaningPlanRow => {
  const cleaningTypes = Array.isArray(item.cleaningTypes)
    ? (item.cleaningTypes as Record<string, unknown>[]).map(mapCleaningType)
    : []
  const defaultType = cleaningTypes.find((type) => type.isDefault) ?? cleaningTypes[0]
  const savedTypeId = String(item.cleaningTypeId ?? '')
  const cleaningTypeId = cleaningTypes.some((type) => type.id === savedTypeId)
    ? savedTypeId
    : defaultType?.id ?? ''
  return {
    visitId: String(item.visitId ?? ''),
    propertyId: String(item.propertyId ?? ''),
    title: String(item.title ?? ''),
    visitStatus: String(item.visitStatus ?? ''),
    visitStartTime: String(item.visitStartTime ?? ''),
    cleanerId: String(item.cleanerId ?? ''),
    startTime: String(item.startTime ?? item.visitStartTime ?? '')
      .trim()
      .replace(/^(\d):/, '0$1'),
    qualityReview: Boolean(item.qualityReview),
    cleaningTypeId,
    cleaningTypes,
    guestyTaskId:
      typeof item.guestyTaskId === 'string' ? item.guestyTaskId : undefined,
  }
}

const mapPlan = (item: Record<string, unknown>): CleaningPlanRecord => ({
  id: String(item.id ?? ''),
  plannedDate: String(item.plannedDate ?? item.id ?? ''),
  status: String(item.status ?? 'DRAFT').toUpperCase() as CleaningPlanStatus,
  items: Array.isArray(item.items)
    ? (item.items as CleaningPlanRecord['items'])
    : [],
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
  updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
  readyAt: typeof item.readyAt === 'string' ? item.readyAt : undefined,
})

const planStatusOf = (
  history: CleaningPlanRecord[],
  date: string,
): CleaningPlanStatus => {
  const match = history.find((plan) => (plan.plannedDate || plan.id) === date)
  return match?.status === 'READY' ? 'READY' : 'DRAFT'
}

export function CleaningPlanView({
  getEndpoint,
  propertyOptions,
  isSummaryInfoOpen,
  onToggleSummaryInfo,
}: Props) {
  const { t, i18n } = useTranslation()
  const currentMonth = useMemo(() => getMadridMonthRange(0), [])
  const endpoints = useMemo(
    () => ({
      getPlan: getEndpoint(
        'getCleaningPlanUrl',
        import.meta.env.VITE_GET_CLEANING_PLAN_URL,
      ),
      upsertPlan: getEndpoint(
        'upsertCleaningPlanUrl',
        import.meta.env.VITE_UPSERT_CLEANING_PLAN_URL,
      ),
      getCleaners: getEndpoint(
        'getCleanersUrl',
        import.meta.env.VITE_GET_CLEANERS_URL,
      ),
    }),
    [getEndpoint],
  )

  const [plannedDate, setPlannedDate] = useState('')
  const [isDayModalOpen, setIsDayModalOpen] = useState(false)
  const [openVisitId, setOpenVisitId] = useState('')
  const [status, setStatus] = useState<CleaningPlanStatus>('DRAFT')
  const [rows, setRows] = useState<CleaningPlanRow[]>([])
  const [history, setHistory] = useState<CleaningPlanRecord[]>([])
  const [cleaners, setCleaners] = useState<CleanerRecord[]>([])
  const [dateFrom, setDateFrom] = useState(currentMonth.from)
  const [dateTo, setDateTo] = useState(currentMonth.to)
  const [filterDraft, setFilterDraft] = useState({
    from: currentMonth.from,
    to: currentMonth.to,
  })
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const today = getTodayMadrid()
  const tomorrow = getTomorrowMadrid()
  const isReady = status === 'READY'
  const canMarkReady = !isPlanDateTooFarAhead(plannedDate, today)
  const cleanerById = useMemo(
    () => new Map(cleaners.map((cleaner) => [cleaner.id, cleaner])),
    [cleaners],
  )
  const activeCleaners = useMemo(
    () => cleaners.filter((cleaner) => cleaner.active),
    [cleaners],
  )
  const filteredHistory = useMemo(
    () =>
      history.filter((plan) => {
        const date = plan.plannedDate || plan.id
        return date >= dateFrom && date <= dateTo
      }),
    [dateFrom, dateTo, history],
  )
  const qualityChecksCount = useMemo(
    () =>
      filteredHistory.reduce((total, plan) => {
        const items = plan.items ?? []
        return total + items.filter((item) => item.qualityReview).length
      }, 0),
    [filteredHistory],
  )
  const isCustomRange =
    dateFrom !== currentMonth.from || dateTo !== currentMonth.to
  const todayStatus = planStatusOf(history, today)
  const tomorrowStatus = planStatusOf(history, tomorrow)

  const loadCleaners = useCallback(async () => {
    if (!endpoints.getCleaners) {
      return
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      `${endpoints.getCleaners}?includeInactive=true`,
    )
    setCleaners((payload.items ?? []).map(mapCleaner))
  }, [endpoints.getCleaners])

  const loadHistory = useCallback(async () => {
    if (!endpoints.getPlan) {
      setError(t('cleaningPlan.missingEndpoint'))
      return
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      `${endpoints.getPlan}?list=true`,
    )
    setHistory((payload.items ?? []).map(mapPlan))
  }, [endpoints.getPlan, t])

  const loadPlan = useCallback(
    async (date: string) => {
      if (!endpoints.getPlan) {
        setError(t('cleaningPlan.missingEndpoint'))
        return
      }
      setIsLoading(true)
      setError('')
      try {
        const payload = await fetchJson<{
          status?: string
          rows?: Record<string, unknown>[]
        }>(`${endpoints.getPlan}?date=${encodeURIComponent(date)}`)
        setStatus(
          String(payload.status ?? 'DRAFT').toUpperCase() === 'READY'
            ? 'READY'
            : 'DRAFT',
        )
        setRows((payload.rows ?? []).map(mapPlanRow))
      } catch (requestError) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : t('cleaningPlan.loadError'),
        )
      } finally {
        setIsLoading(false)
      }
    },
    [endpoints.getPlan, t],
  )

  const refreshPage = useCallback(async () => {
    setError('')
    try {
      await Promise.all([loadHistory(), loadCleaners()])
      if (isDayModalOpen && plannedDate) {
        await loadPlan(plannedDate)
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningPlan.loadError'),
      )
    }
  }, [isDayModalOpen, loadCleaners, loadHistory, loadPlan, plannedDate, t])

  useEffect(() => {
    void loadCleaners().catch(() => {
      setError(t('cleaningPlan.missingCleaners'))
    })
  }, [loadCleaners, t])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const openDay = async (date: string) => {
    setPlannedDate(date)
    setIsDayModalOpen(true)
    setMessage('')
    setError('')
    await loadPlan(date)
  }

  const closeDay = () => {
    setOpenVisitId('')
    setIsDayModalOpen(false)
    setMessage('')
  }

  const updateRow = (
    visitId: string,
    patch: Partial<
      Pick<CleaningPlanRow, 'cleanerId' | 'startTime' | 'qualityReview' | 'cleaningTypeId'>
    >,
  ) => {
    setRows((current) =>
      current.map((row) =>
        row.visitId === visitId ? { ...row, ...patch } : row,
      ),
    )
    setMessage('')
  }

  const savePlan = async (action: 'save' | 'ready' | 'reopen') => {
    if (!endpoints.upsertPlan) {
      setError(t('cleaningPlan.missingWrite'))
      return
    }
    if (action === 'ready') {
      if (isPlanDateTooFarAhead(plannedDate)) {
        setError(t('cleaningPlan.draftOnlyFuture'))
        return
      }
      const incomplete = rows.filter((row) => !row.cleanerId || !row.startTime)
      if (incomplete.length > 0) {
        setError(t('cleaningPlan.incompleteReady'))
        return
      }
    }
    setIsSaving(true)
    setError('')
    try {
      const payload = await fetchJson<{
        item?: Record<string, unknown>
        syncErrors?: Array<{ visitId: string; error: string }>
      }>(endpoints.upsertPlan, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          plannedDate,
          action,
          items: rows.map((row) => ({
            visitId: row.visitId,
            cleanerId: row.cleanerId,
            startTime: row.startTime,
            qualityReview: row.qualityReview,
            cleaningTypeId: row.cleaningTypeId,
          })),
        }),
      })
      const nextStatus =
        String(payload.item?.status ?? '').toUpperCase() === 'READY'
          ? 'READY'
          : 'DRAFT'
      setStatus(nextStatus)
      if (payload.syncErrors && payload.syncErrors.length > 0) {
        setError(
          t('cleaningPlan.syncPartial', { count: payload.syncErrors.length }),
        )
      } else if (action === 'ready') {
        setMessage(t('cleaningPlan.markedReady'))
      } else if (action === 'reopen') {
        setMessage(t('cleaningPlan.reopened'))
      } else {
        setMessage(t('cleaningPlan.saved'))
      }
      await loadHistory()
      await loadPlan(plannedDate)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningPlan.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const statusLabel = (value: CleaningPlanStatus) =>
    value === 'READY' ? t('cleaningPlan.ready') : t('cleaningPlan.pending')

  const renderVisitRows = () => {
    if (isLoading) {
      return (
        <tr>
          <td colSpan={5}>{t('common.loading')}</td>
        </tr>
      )
    }
    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={5}>{t('cleaningPlan.emptyVisits')}</td>
        </tr>
      )
    }
    return rows.map((row) => {
      const assignedCleaner = cleanerById.get(row.cleanerId)
      const cleanerOptions = activeCleaners.slice()
      if (
        assignedCleaner &&
        !assignedCleaner.active &&
        !cleanerOptions.some((entry) => entry.id === assignedCleaner.id)
      ) {
        cleanerOptions.push(assignedCleaner)
      }
      return (
        <tr key={row.visitId}>
          <td>
            <div className="cleaning-visit-cell">
              <button
                type="button"
                className="cleaning-visit-title-btn"
                aria-label={t('cleaningPlan.openVisit')}
                onClick={() => setOpenVisitId(row.visitId)}
              >
                {row.title || row.visitId}
              </button>
              {row.visitStatus ? (
                <span className="card-meta">
                  {t(`operations.visitStatuses.${row.visitStatus}`, {
                    defaultValue: row.visitStatus,
                  })}
                </span>
              ) : null}
            </div>
          </td>
          <td>
            <select
              value={row.cleaningTypeId}
              disabled={isReady || row.cleaningTypes.length === 0}
              onChange={(event) =>
                updateRow(row.visitId, {
                  cleaningTypeId: event.target.value,
                })
              }
            >
              {row.cleaningTypes.length === 0 ? (
                <option value="">{t('cleaningPlan.noTypes')}</option>
              ) : (
                row.cleaningTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))
              )}
            </select>
          </td>
          <td>
            <select
              value={row.cleanerId}
              disabled={isReady}
              onChange={(event) =>
                updateRow(row.visitId, {
                  cleanerId: event.target.value,
                })
              }
            >
              <option value="">{t('cleaningPlan.selectCleaner')}</option>
              {cleanerOptions.map((cleaner) => (
                <option key={cleaner.id} value={cleaner.id}>
                  {cleaner.name}
                  {cleaner.active ? '' : ` (${t('cleaningSettings.inactive')})`}
                </option>
              ))}
            </select>
          </td>
          <td>
            <input
              type="time"
              value={row.startTime}
              disabled={isReady}
              onChange={(event) =>
                updateRow(row.visitId, {
                  startTime: event.target.value,
                })
              }
            />
          </td>
          <td className="cleaning-quality-cell">
            <input
              type="checkbox"
              checked={row.qualityReview}
              disabled={isReady}
              onChange={(event) =>
                updateRow(row.visitId, {
                  qualityReview: event.target.checked,
                })
              }
              aria-label={t('cleaningPlan.qualityCheck')}
            />
          </td>
        </tr>
      )
    })
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('cleaningPlan.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Cleaning Plan')}</h1>
            <button
              type="button"
              className={`btn-page-info ${isSummaryInfoOpen ? 'is-active' : ''}`}
              aria-label={
                isSummaryInfoOpen
                  ? t('common.hideSummaryInfo')
                  : t('common.showSummaryInfo')
              }
              aria-expanded={isSummaryInfoOpen}
              onClick={onToggleSummaryInfo}
            >
              i
            </button>
          </div>
          <p className="subtitle">{t('cleaningPlan.subtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <div className="header-actions">
              <label
                className="btn-ghost cleaning-plan-jump-btn"
                title={t('operations.chooseDate')}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  width="16"
                  height="16"
                >
                  <path
                    d="M6 2h2v2h4V2h2v2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2zm10 6H4v8h12V8z"
                    fill="currentColor"
                  />
                </svg>
                <input
                  className="operations-day-date-input"
                  type="date"
                  onChange={(event) => {
                    const date = event.target.value
                    if (date) {
                      void openDay(date)
                    }
                    event.target.value = ''
                  }}
                  aria-label={t('operations.chooseDate')}
                />
              </label>
              <button
                className={`btn-ghost btn-filter ${isFilterOpen ? 'is-active' : ''}`}
                type="button"
                aria-label={t('common.filters')}
                onClick={() => {
                  setFilterDraft({ from: dateFrom, to: dateTo })
                  setIsFilterOpen(true)
                }}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  width="16"
                  height="16"
                >
                  <path
                    d="M3 4h14l-5.5 6.2V16l-3-1.5v-4.3L3 4z"
                    fill="currentColor"
                  />
                </svg>
                {isCustomRange ? <span className="filter-badge">1</span> : null}
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => void refreshPage()}
                aria-label={t('common.refresh')}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  width="16"
                  height="16"
                >
                  <path
                    d="M16 4v5h-5l1.8-1.8a4.5 4.5 0 1 0 1.3 4.3h1.9a6.5 6.5 0 1 1-1.9-4.6L16 4z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {error && !isDayModalOpen ? <div className="alert">{error}</div> : null}
      {message && !isDayModalOpen ? (
        <p className="notice success">{message}</p>
      ) : null}

      <section
        className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}
      >
        <button
          type="button"
          className={`card card-compact summary-card-button ${
            isDayModalOpen && plannedDate === today ? 'is-selected' : ''
          }`}
          onClick={() => void openDay(today)}
        >
          <p className="card-label">{t('cleaningPlan.todayCard')}</p>
          <p className="card-value">{statusLabel(todayStatus)}</p>
          <p className="card-meta">
            {formatDateOnlyLabel(today, i18n.language)}
          </p>
        </button>
        <button
          type="button"
          className={`card card-compact summary-card-button ${
            isDayModalOpen && plannedDate === tomorrow ? 'is-selected' : ''
          }`}
          onClick={() => void openDay(tomorrow)}
        >
          <p className="card-label">{t('cleaningPlan.tomorrowCard')}</p>
          <p className="card-value">{statusLabel(tomorrowStatus)}</p>
          <p className="card-meta">
            {formatDateOnlyLabel(tomorrow, i18n.language)}
          </p>
        </button>
        <div className="card card-compact">
          <p className="card-label">{t('cleaningPlan.qualityChecks')}</p>
          <p className="card-value">{qualityChecksCount}</p>
          <p className="card-meta">{t('cleaningPlan.qualityChecksMeta')}</p>
        </div>
      </section>

      {isFilterOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-scrollable">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('common.filters')}</h3>
                <p className="modal-subtitle">
                  {t('cleaningPlan.filterSubtitle')}
                </p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsFilterOpen(false)}
                aria-label={t('common.closeFilters')}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="filters-grid">
                <label>
                  {t('common.from')}
                  <input
                    type="date"
                    value={filterDraft.from}
                    onChange={(event) =>
                      setFilterDraft((current) => ({
                        ...current,
                        from: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {t('common.to')}
                  <input
                    type="date"
                    value={filterDraft.to}
                    onChange={(event) =>
                      setFilterDraft((current) => ({
                        ...current,
                        to: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={() =>
                  setFilterDraft({
                    from: currentMonth.from,
                    to: currentMonth.to,
                  })
                }
              >
                {t('common.clear')}
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  const from =
                    filterDraft.from <= filterDraft.to
                      ? filterDraft.from
                      : filterDraft.to
                  const to =
                    filterDraft.from <= filterDraft.to
                      ? filterDraft.to
                      : filterDraft.from
                  setDateFrom(from)
                  setDateTo(to)
                  setIsFilterOpen(false)
                }}
              >
                {t('common.applyFilters')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('cleaningPlan.historyTitle')}</h2>
            <p className="card-subtitle">{t('cleaningPlan.historySubtitle')}</p>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="data-table data-table-cleaning-plan">
            <thead>
              <tr>
                <th scope="col" className="mobile-quick-filter-col">
                  <button
                    className={`btn-quick-filter ${
                      isDayModalOpen && plannedDate === today ? 'is-active' : ''
                    }`}
                    type="button"
                    aria-pressed={isDayModalOpen && plannedDate === today}
                    onClick={() => void openDay(today)}
                  >
                    {t('cleaningPlan.todayCard')}
                    <span className="quick-filter-dot" aria-hidden="true" />
                  </button>
                </th>
                <th scope="col" className="mobile-quick-filter-col">
                  <button
                    className={`btn-quick-filter ${
                      isDayModalOpen && plannedDate === tomorrow ? 'is-active' : ''
                    }`}
                    type="button"
                    aria-pressed={isDayModalOpen && plannedDate === tomorrow}
                    onClick={() => void openDay(tomorrow)}
                  >
                    {t('cleaningPlan.tomorrowCard')}
                    <span className="quick-filter-dot" aria-hidden="true" />
                  </button>
                </th>
                <th>{t('cleaningPlan.day')}</th>
                <th>{t('cleaningPlan.cleanings')}</th>
                <th>{t('cleaningPlan.planStatus')}</th>
                <th>{t('cleaningPlan.qualityChecks')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 ? (
                <tr>
                  <td className="table-empty" colSpan={5}>
                    {t('cleaningPlan.emptyHistory')}
                  </td>
                </tr>
              ) : (
                filteredHistory.map((plan) => {
                  const items = plan.items ?? []
                  const quality = items.filter((item) => item.qualityReview).length
                  const date = plan.plannedDate || plan.id
                  return (
                    <tr key={plan.id}>
                      <td>{formatDateOnlyLabel(date, i18n.language)}</td>
                      <td>
                        <span className="cleaning-plan-count-label">
                          {t('cleaningPlan.cleanings')}:{' '}
                        </span>
                        {items.length}
                      </td>
                      <td>
                        <span
                          className={`cleaning-status-tag ${
                            plan.status === 'READY' ? 'is-ready' : 'is-draft'
                          }`}
                        >
                          {statusLabel(plan.status)}
                        </span>
                      </td>
                      <td>{quality}</td>
                      <td>
                        <button
                          className="btn-secondary cleaning-plan-view-btn"
                          type="button"
                          onClick={() => void openDay(date)}
                          aria-label={t('cleaningPlan.viewDay')}
                        >
                          <span className="cleaning-plan-view-text">
                            {t('cleaningPlan.viewDay')}
                          </span>
                          <svg
                            className="cleaning-plan-view-icon"
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            width="18"
                            height="18"
                          >
                            <path
                              d="M8.5 3a5.5 5.5 0 0 1 4.38 8.82l3.65 3.65-1.41 1.41-3.65-3.65A5.5 5.5 0 1 1 8.5 3zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isDayModalOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-wide modal-scrollable cleaning-plan-modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {formatDateOnlyLabel(plannedDate, i18n.language)}
                </h3>
                <p className="modal-subtitle">
                  <span
                    className={`cleaning-status-tag ${
                      isReady ? 'is-ready' : 'is-draft'
                    }`}
                  >
                    {statusLabel(status)}
                  </span>
                </p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={closeDay}
                aria-label={t('common.cancel')}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {message ? <p className="notice success">{message}</p> : null}
              {error ? <p className="notice error">{error}</p> : null}
              {!isReady && !canMarkReady ? (
                <p className="notice">{t('cleaningPlan.draftOnlyFuture')}</p>
              ) : null}
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('cleaningPlan.visit')}</th>
                      <th>{t('cleaningPlan.type')}</th>
                      <th>{t('cleaningPlan.cleaner')}</th>
                      <th>{t('cleaningPlan.startTime')}</th>
                      <th>{t('cleaningPlan.qualityCheck')}</th>
                    </tr>
                  </thead>
                  <tbody>{renderVisitRows()}</tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              {isReady ? (
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={isSaving}
                  onClick={() => void savePlan('reopen')}
                >
                  {t('cleaningPlan.editPlan')}
                </button>
              ) : (
                <>
                  <button
                    className="btn-secondary"
                    type="button"
                    disabled={isSaving || isLoading}
                    onClick={() => void savePlan('save')}
                  >
                    {isSaving ? t('common.saving') : t('cleaningPlan.saveDraft')}
                  </button>
                  <button
                    className="btn-primary"
                    type="button"
                    disabled={isSaving || isLoading || !canMarkReady}
                    onClick={() => void savePlan('ready')}
                  >
                    {t('cleaningPlan.markReady')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {openVisitId ? (
        <VisitDetailModal
          visitId={openVisitId}
          getEndpoint={getEndpoint}
          propertyOptions={propertyOptions}
          onClose={() => setOpenVisitId('')}
        />
      ) : null}
    </>
  )
}
