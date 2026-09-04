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
  MaintenanceAgentRecord,
  MaintenancePlanRecord,
  MaintenancePlanRow,
  MaintenancePlanStatus,
} from './types'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
  isSummaryInfoOpen: boolean
  onToggleSummaryInfo: () => void
}

const mapAgent = (item: Record<string, unknown>): MaintenanceAgentRecord => ({
  id: String(item.id ?? item.userId ?? ''),
  userId: String(item.userId ?? item.id ?? ''),
  name: String(item.name ?? item.id ?? ''),
  active: item.active !== false,
})

const mapPlanRow = (item: Record<string, unknown>): MaintenancePlanRow => ({
  visitId: String(item.visitId ?? ''),
  propertyId: String(item.propertyId ?? ''),
  title: String(item.title ?? ''),
  visitStatus: String(item.visitStatus ?? ''),
  visitStartTime: String(item.visitStartTime ?? ''),
  visitEndTime: String(item.visitEndTime ?? ''),
  agentId: String(item.agentId ?? ''),
  startTime: String(item.startTime ?? item.visitStartTime ?? '')
    .trim()
    .replace(/^(\d):/, '0$1'),
  endTime: String(item.endTime ?? item.visitEndTime ?? '')
    .trim()
    .replace(/^(\d):/, '0$1'),
  guestyTaskId:
    typeof item.guestyTaskId === 'string' ? item.guestyTaskId : undefined,
})

const mapPlan = (item: Record<string, unknown>): MaintenancePlanRecord => ({
  id: String(item.id ?? ''),
  plannedDate: String(item.plannedDate ?? item.id ?? ''),
  status: String(item.status ?? 'DRAFT').toUpperCase() as MaintenancePlanStatus,
  items: Array.isArray(item.items)
    ? (item.items as MaintenancePlanRecord['items'])
    : [],
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
  updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
  readyAt: typeof item.readyAt === 'string' ? item.readyAt : undefined,
})

const planStatusOf = (
  history: MaintenancePlanRecord[],
  date: string,
): MaintenancePlanStatus => {
  const match = history.find((plan) => (plan.plannedDate || plan.id) === date)
  return match?.status === 'READY' ? 'READY' : 'DRAFT'
}

export function MaintenancePlanView({
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
        'getMaintenancePlanUrl',
        import.meta.env.VITE_GET_MAINTENANCE_PLAN_URL,
      ),
      upsertPlan: getEndpoint(
        'upsertMaintenancePlanUrl',
        import.meta.env.VITE_UPSERT_MAINTENANCE_PLAN_URL,
      ),
      getAgents: getEndpoint(
        'getMaintenanceAgentsUrl',
        import.meta.env.VITE_GET_MAINTENANCE_AGENTS_URL,
      ),
    }),
    [getEndpoint],
  )

  const [plannedDate, setPlannedDate] = useState('')
  const [isDayModalOpen, setIsDayModalOpen] = useState(false)
  const [openVisitId, setOpenVisitId] = useState('')
  const [status, setStatus] = useState<MaintenancePlanStatus>('DRAFT')
  const [rows, setRows] = useState<MaintenancePlanRow[]>([])
  const [history, setHistory] = useState<MaintenancePlanRecord[]>([])
  const [agents, setAgents] = useState<MaintenanceAgentRecord[]>([])
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
  const agentById = useMemo(
    () => new Map(agents.map((agent) => [agent.id, agent])),
    [agents],
  )
  const activeAgents = useMemo(
    () => agents.filter((agent) => agent.active),
    [agents],
  )
  const filteredHistory = useMemo(
    () =>
      history.filter((plan) => {
        const date = plan.plannedDate || plan.id
        return date >= dateFrom && date <= dateTo
      }),
    [dateFrom, dateTo, history],
  )
  const isCustomRange =
    dateFrom !== currentMonth.from || dateTo !== currentMonth.to
  const todayStatus = planStatusOf(history, today)
  const tomorrowStatus = planStatusOf(history, tomorrow)

  const loadAgents = useCallback(async () => {
    if (!endpoints.getAgents) {
      return
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      `${endpoints.getAgents}?includeInactive=true`,
    )
    setAgents((payload.items ?? []).map(mapAgent))
  }, [endpoints.getAgents])

  const loadHistory = useCallback(async () => {
    if (!endpoints.getPlan) {
      setError(t('maintenancePlan.missingEndpoint'))
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
        setError(t('maintenancePlan.missingEndpoint'))
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
            : t('maintenancePlan.loadError'),
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
      await Promise.all([loadHistory(), loadAgents()])
      if (isDayModalOpen && plannedDate) {
        await loadPlan(plannedDate)
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('maintenancePlan.loadError'),
      )
    }
  }, [isDayModalOpen, loadAgents, loadHistory, loadPlan, plannedDate, t])

  useEffect(() => {
    void loadAgents().catch(() => {
      setError(t('maintenancePlan.missingAgents'))
    })
  }, [loadAgents, t])

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
    patch: Partial<Pick<MaintenancePlanRow, 'agentId' | 'startTime' | 'endTime'>>,
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
      setError(t('maintenancePlan.missingWrite'))
      return
    }
    if (action === 'ready') {
      if (isPlanDateTooFarAhead(plannedDate)) {
        setError(t('maintenancePlan.draftOnlyFuture'))
        return
      }
      const incomplete = rows.filter(
        (row) => !row.agentId || !row.startTime || !row.endTime,
      )
      if (incomplete.length > 0) {
        setError(t('maintenancePlan.incompleteReady'))
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
            agentId: row.agentId,
            startTime: row.startTime,
            endTime: row.endTime,
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
          t('maintenancePlan.syncPartial', { count: payload.syncErrors.length }),
        )
      } else if (action === 'ready') {
        setMessage(t('maintenancePlan.markedReady'))
      } else if (action === 'reopen') {
        setMessage(t('maintenancePlan.reopened'))
      } else {
        setMessage(t('maintenancePlan.saved'))
      }
      await loadHistory()
      await loadPlan(plannedDate)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('maintenancePlan.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const statusLabel = (value: MaintenancePlanStatus) =>
    value === 'READY' ? t('maintenancePlan.ready') : t('maintenancePlan.pending')

  const renderVisitRows = () => {
    if (isLoading) {
      return (
        <tr>
          <td colSpan={4}>{t('common.loading')}</td>
        </tr>
      )
    }
    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={4}>{t('maintenancePlan.emptyVisits')}</td>
        </tr>
      )
    }
    return rows.map((row) => {
      const assignedAgent = agentById.get(row.agentId)
      const agentOptions = activeAgents.slice()
      if (
        assignedAgent &&
        !assignedAgent.active &&
        !agentOptions.some((entry) => entry.id === assignedAgent.id)
      ) {
        agentOptions.push(assignedAgent)
      }
      return (
        <tr key={row.visitId}>
          <td>
            <div className="cleaning-visit-cell">
              <button
                type="button"
                className="cleaning-visit-title-btn"
                aria-label={t('maintenancePlan.openVisit')}
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
              value={row.agentId}
              disabled={isReady}
              onChange={(event) =>
                updateRow(row.visitId, {
                  agentId: event.target.value,
                })
              }
            >
              <option value="">{t('maintenancePlan.selectAgent')}</option>
              {agentOptions.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                  {agent.active ? '' : ` (${t('maintenanceSettings.inactive')})`}
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
          <td>
            <input
              type="time"
              value={row.endTime}
              disabled={isReady}
              onChange={(event) =>
                updateRow(row.visitId, {
                  endTime: event.target.value,
                })
              }
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
          <p className="eyebrow">{t('maintenancePlan.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Maintenance Plan')}</h1>
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
          <p className="subtitle">{t('maintenancePlan.subtitle')}</p>
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
          <p className="card-label">{t('maintenancePlan.todayCard')}</p>
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
          <p className="card-label">{t('maintenancePlan.tomorrowCard')}</p>
          <p className="card-value">{statusLabel(tomorrowStatus)}</p>
          <p className="card-meta">
            {formatDateOnlyLabel(tomorrow, i18n.language)}
          </p>
        </button>
      </section>

      {isFilterOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('common.filters')}</h3>
                <p className="modal-subtitle">
                  {t('maintenancePlan.filterSubtitle')}
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
            <h2 className="card-title">{t('maintenancePlan.historyTitle')}</h2>
            <p className="card-subtitle">{t('maintenancePlan.historySubtitle')}</p>
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
                    {t('maintenancePlan.todayCard')}
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
                    {t('maintenancePlan.tomorrowCard')}
                    <span className="quick-filter-dot" aria-hidden="true" />
                  </button>
                </th>
                <th>{t('maintenancePlan.day')}</th>
                <th>{t('maintenancePlan.visits')}</th>
                <th>{t('maintenancePlan.planStatus')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 ? (
                <tr>
                  <td className="table-empty" colSpan={4}>
                    {t('maintenancePlan.emptyHistory')}
                  </td>
                </tr>
              ) : (
                filteredHistory.map((plan) => {
                  const items = plan.items ?? []
                  const date = plan.plannedDate || plan.id
                  return (
                    <tr key={plan.id}>
                      <td>{formatDateOnlyLabel(date, i18n.language)}</td>
                      <td>{items.length}</td>
                      <td>
                        <span
                          className={`cleaning-status-tag ${
                            plan.status === 'READY' ? 'is-ready' : 'is-draft'
                          }`}
                        >
                          {statusLabel(plan.status)}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn-secondary cleaning-plan-view-btn"
                          type="button"
                          onClick={() => void openDay(date)}
                          aria-label={t('maintenancePlan.viewDay')}
                        >
                          <span className="cleaning-plan-view-text">
                            {t('maintenancePlan.viewDay')}
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
                <p className="notice">{t('maintenancePlan.draftOnlyFuture')}</p>
              ) : null}
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('maintenancePlan.visit')}</th>
                      <th>{t('maintenancePlan.agent')}</th>
                      <th>{t('maintenancePlan.startTime')}</th>
                      <th>{t('maintenancePlan.endTime')}</th>
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
                  {t('maintenancePlan.editPlan')}
                </button>
              ) : (
                <>
                  <button
                    className="btn-secondary"
                    type="button"
                    disabled={isSaving || isLoading}
                    onClick={() => void savePlan('save')}
                  >
                    {isSaving ? t('common.saving') : t('maintenancePlan.saveDraft')}
                  </button>
                  <button
                    className="btn-primary"
                    type="button"
                    disabled={isSaving || isLoading || !canMarkReady}
                    onClick={() => void savePlan('ready')}
                  >
                    {t('maintenancePlan.markReady')}
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
