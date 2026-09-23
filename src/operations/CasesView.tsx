import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { YlIcon } from '../design/icons'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { DismissibleNotice } from './DismissibleNotice'
import { ACTION_KEYS } from '../../amplify/functions/shared/rbac-catalog'
import { usePermissions } from '../rbac/PermissionsProvider'
import { fetchJson, getUnassignedPool, saveTask } from './api'
import { CaseDetailModal } from './CaseDetailModal'
import {
  getCaseDetail,
  getCases,
  mapCase,
  saveCase,
  type CaseDetail,
  type CaseRecord,
  type CaseStatus,
} from './casesApi'
import './cases.css'
import { getTodayMadrid } from './dateHelpers'
import {
  filterCaseReportOptions,
  getPropertyLabel,
  reportDestinationIdForProperty,
  taskMatchesReportDestination,
} from './propertyHelpers'
import { displayTaskTitle } from './taskTitleDisplay'
import type { PropertyOption, TaskRecord, VisitRecord } from './types'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
}

const mapTask = (item: Record<string, unknown>): TaskRecord => ({
  id: String(item.id ?? ''),
  propertyId: String(item.propertyId ?? ''),
  visitId: typeof item.visitId === 'string' ? item.visitId : undefined,
  teamId: String(item.teamId ?? ''),
  assignedUserId:
    typeof item.assignedUserId === 'string' ? item.assignedUserId : undefined,
  title: String(item.title ?? ''),
  titleEs: typeof item.titleEs === 'string' ? item.titleEs : undefined,
  description: String(item.description ?? ''),
  descriptionEs:
    typeof item.descriptionEs === 'string' ? item.descriptionEs : undefined,
  status: String(item.status ?? 'UNASSIGNED').toUpperCase() as TaskRecord['status'],
  priority: String(item.priority ?? 'MEDIUM'),
  dueDate: typeof item.dueDate === 'string' ? item.dueDate : undefined,
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
})

const formatDay = (value: string | undefined, locale: string) => {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Europe/Madrid',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed)
}

export function CasesView({ getEndpoint, propertyOptions }: Props) {
  const { t, i18n } = useTranslation()
  const { can } = usePermissions()
  const canEdit = can(ACTION_KEYS.unassignedTasksEdit)
  const destinations = useMemo(
    () => filterCaseReportOptions(propertyOptions),
    [propertyOptions],
  )
  const endpoints = useMemo(
    () => ({
      cases: getEndpoint('getCasesUrl', import.meta.env.VITE_GET_CASES_URL),
      upsertCase: getEndpoint('upsertCaseUrl', import.meta.env.VITE_UPSERT_CASE_URL),
      tasks: getEndpoint('getTasksUrl', import.meta.env.VITE_GET_TASKS_URL),
      upsertTask: getEndpoint('upsertTaskUrl', import.meta.env.VITE_UPSERT_TASK_URL),
      visits: getEndpoint('getVisitsUrl', import.meta.env.VITE_GET_VISITS_URL),
      upsertVisit: getEndpoint('upsertVisitUrl', import.meta.env.VITE_UPSERT_VISIT_URL),
      teams: getEndpoint('getTeamsUrl', import.meta.env.VITE_GET_TEAMS_URL),
      visitTypes: getEndpoint('getVisitTypesUrl', import.meta.env.VITE_GET_VISIT_TYPES_URL),
    }),
    [getEndpoint],
  )
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [cases, setCases] = useState<CaseRecord[]>([])
  const [closedCases, setClosedCases] = useState<CaseRecord[]>([])
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [includeClosed, setIncludeClosed] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
  const [filterDraft, setFilterDraft] = useState({
    propertyId: '',
    includeClosed: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [assignTask, setAssignTask] = useState<TaskRecord | null>(null)
  const [assignVisitId, setAssignVisitId] = useState('')
  const [assignVisits, setAssignVisits] = useState<VisitRecord[]>([])
  const [createFromTask, setCreateFromTask] = useState<TaskRecord | null>(null)
  const [attachTask, setAttachTask] = useState<TaskRecord | null>(null)
  const [attachCaseId, setAttachCaseId] = useState('')
  const [showNewCase, setShowNewCase] = useState(false)
  const [draft, setDraft] = useState({ title: '', propertyId: '', description: '' })

  const load = useCallback(async () => {
    if (!endpoints.cases) {
      setError(t('cases.missingEndpoint'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [casePayload, taskPayload] = await Promise.all([
        getCases(endpoints.cases, {
          includeClosed,
          q: debouncedQuery,
          propertyId,
        }),
        endpoints.tasks
          ? getUnassignedPool(endpoints.tasks)
          : Promise.resolve({ items: [] }),
      ])
      setCases((casePayload.items ?? []).map((item) => mapCase(item)))
      setClosedCases((casePayload.closed ?? []).map((item) => mapCase(item)))
      setTasks(
        ((taskPayload.items ?? []) as unknown as Record<string, unknown>[]).map(mapTask),
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cases.loadError'))
    } finally {
      setLoading(false)
    }
  }, [endpoints.cases, endpoints.tasks, includeClosed, propertyId, debouncedQuery, t])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    void load()
  }, [load])

  const openCase = async (id: string) => {
    if (!endpoints.cases) return
    setError(null)
    try {
      const payload = await getCaseDetail(endpoints.cases, id)
      setDetail({
        ...payload,
        item: mapCase(payload.item as unknown as Record<string, unknown>),
        events: payload.events ?? [],
        visits: payload.visits ?? [],
        movements: payload.movements ?? [],
        cost: payload.cost ?? { visits: 0, expenses: 0, total: 0 },
        scopePropertyIds: payload.scopePropertyIds ?? [],
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cases.loadError'))
    }
  }

  const inbox = tasks.filter((task) => {
    const title = displayTaskTitle(i18n.language, task.title, task.titleEs)
    const haystack = `${title} ${task.description}`.toLowerCase()
    if (query.trim() && !haystack.includes(query.trim().toLowerCase())) {
      return false
    }
    return taskMatchesReportDestination(propertyOptions, task.propertyId, propertyId)
  })

  const column = (status: CaseStatus) =>
    (status === 'CLOSED' ? closedCases : cases).filter((entry) => entry.status === status)

  const propertyName = (id: string, fallback?: string) => {
    const property = propertyOptions.find((entry) => entry.id === id)
    return property ? getPropertyLabel(property) : fallback || id
  }

  const saveAndReload = async (payload: Record<string, unknown>) => {
    if (!endpoints.upsertCase) {
      throw new Error(t('cases.missingEndpoint'))
    }
    await saveCase(endpoints.upsertCase, payload)
    await load()
  }

  useEffect(() => {
    if (!assignTask || !endpoints.visits) {
      setAssignVisits([])
      return
    }
    const today = getTodayMadrid()
    void fetchJson<{ items?: Record<string, unknown>[] }>(
      `${endpoints.visits}?propertyId=${encodeURIComponent(assignTask.propertyId)}`,
    )
      .then((payload) => {
        const options = (payload.items ?? [])
          .map(
            (entry) =>
              ({
                id: String(entry.id ?? ''),
                teamId: String(entry.teamId ?? ''),
                status: String(entry.status ?? ''),
                scheduledDate: String(entry.scheduledDate ?? ''),
                scheduledStartTime: String(entry.scheduledStartTime ?? ''),
                title: String(entry.title ?? ''),
              }) as VisitRecord,
          )
          .filter(
            (visit) =>
              visit.teamId === assignTask.teamId &&
              visit.status !== 'COMPLETED' &&
              visit.status !== 'CANCELLED' &&
              visit.scheduledDate >= today,
          )
          .sort(
            (a, b) =>
              a.scheduledDate.localeCompare(b.scheduledDate) ||
              a.scheduledStartTime.localeCompare(b.scheduledStartTime),
          )
        setAssignVisits(options)
      })
      .catch(() => setAssignVisits([]))
  }, [assignTask, endpoints.visits])

  const activeFilterCount = (propertyId ? 1 : 0) + (includeClosed ? 1 : 0)

  const openNewCase = () => {
    setFormError(null)
    setDraft({
      title: '',
      propertyId: '',
      description: '',
    })
    setCreateFromTask(null)
    setShowNewCase(true)
  }

  const closeCaseForm = () => {
    setShowNewCase(false)
    setCreateFromTask(null)
    setFormError(null)
  }

  const attachOptions = attachTask
    ? cases.filter(
        (entry) =>
          entry.propertyId ===
          reportDestinationIdForProperty(propertyOptions, attachTask.propertyId),
      )
    : []

  return (
    <div className="cases-page">
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('cases.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Cases')}</h1>
          </div>
          <p className="subtitle">{t('cases.subtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div
            className={`page-action-bar ${
              isMobileSearchOpen ? 'is-search-open' : ''
            }`}
          >
            <input
              className="search-input"
              placeholder={t('cases.search')}
              type="search"
              aria-label={t('cases.search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="header-actions">
              <button
                className={`btn-ghost btn-search-toggle ${
                  isMobileSearchOpen ? 'is-active' : ''
                }`}
                type="button"
                aria-label={
                  isMobileSearchOpen ? t('common.hideSearch') : t('common.showSearch')
                }
                aria-expanded={isMobileSearchOpen}
                onClick={() => setIsMobileSearchOpen((current) => !current)}
              >
                {isMobileSearchOpen ? (
                  <YlIcon name="xmark" size={16} />
                ) : (
                  <YlIcon name="magnifyingglass" size={16} />
                )}
              </button>
              <button
                className={`btn-ghost btn-filter ${isFilterOpen ? 'is-active' : ''}`}
                type="button"
                aria-label={t('common.filters')}
                onClick={() => {
                  setFilterDraft({ propertyId, includeClosed })
                  setIsFilterOpen(true)
                }}
              >
                <YlIcon name="line.3.horizontal.decrease" size={16} />
                {activeFilterCount > 0 ? (
                  <span className="filter-badge">{activeFilterCount}</span>
                ) : null}
              </button>
              {canEdit ? (
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={openNewCase}
                  aria-label={t('cases.newCase')}
                  title={t('cases.newCase')}
                >
                  <YlIcon name="plus" size={16} />
                </button>
              ) : null}
              <button
                className="btn-primary"
                type="button"
                onClick={() => void load()}
                disabled={loading}
                aria-label={t('common.refresh')}
              >
                <YlIcon name="arrow.clockwise" size={16} />
              </button>
            </div>
          </div>
        </MobileBodyPortal>
      </header>
      {error ? (
        <DismissibleNotice
          dismissLabel={t('common.close')}
          onDismiss={() => setError(null)}
        >
          {error}
        </DismissibleNotice>
      ) : null}
      {loading ? <p className="cases-meta">{t('cases.loading')}</p> : null}
      <div className={`cases-board${includeClosed ? ' has-closed' : ''}`}>
        <Column
          title={t('cases.columns.inbox')}
          hint={t('cases.inboxHint')}
          count={inbox.length}
        >
          {inbox.map((task) => {
            const title = displayTaskTitle(i18n.language, task.title, task.titleEs)
            return (
              <article className="cases-card" key={task.id}>
                <h3 className="cases-card-title">{title}</h3>
                <p className="cases-meta">
                  {propertyName(task.propertyId)}
                  {task.status === 'DISMISS' ? ` · ${t('cases.dismissed')}` : ''}
                </p>
                {canEdit ? (
                  <div className="cases-card-actions">
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => {
                        setAssignTask(task)
                        setAssignVisitId('')
                      }}
                    >
                      {t('cases.assignVisit')}
                    </button>
                    <button
                      className="btn-secondary"
                      type="button"
                      onClick={() => {
                        setFormError(null)
                        setShowNewCase(false)
                        setCreateFromTask(task)
                        setDraft({
                          title,
                          propertyId: reportDestinationIdForProperty(
                            propertyOptions,
                            task.propertyId,
                          ),
                          description: task.description,
                        })
                      }}
                    >
                      {t('cases.createCase')}
                    </button>
                    <button
                      className="btn-ghost"
                      type="button"
                      onClick={() => {
                        setAttachTask(task)
                        setAttachCaseId('')
                      }}
                    >
                      {t('cases.addToCase')}
                    </button>
                  </div>
                ) : null}
              </article>
            )
          })}
        </Column>
        <CaseColumn
          title={t('cases.columns.known')}
          hint={t('cases.knownHint')}
          items={column('KNOWN')}
          locale={i18n.language}
          onOpen={(id) => void openCase(id)}
        />
        <CaseColumn
          title={t('cases.columns.quarantine')}
          hint={t('cases.quarantineHint')}
          items={column('QUARANTINE')}
          locale={i18n.language}
          onOpen={(id) => void openCase(id)}
        />
        {includeClosed ? (
          <CaseColumn
            title={t('cases.columns.closed')}
            hint={t('cases.closedHint')}
            items={column('CLOSED')}
            locale={i18n.language}
            onOpen={(id) => void openCase(id)}
          />
        ) : null}
      </div>

      {isFilterOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-scrollable">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('common.filters')}</h3>
                <p className="modal-subtitle">{t('cases.filterSubtitle')}</p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsFilterOpen(false)}
                aria-label={t('common.closeFilters')}
              >
                <YlIcon name="xmark" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="filter-grid">
                <div className="filter-group">
                  <p className="filter-title">{t('cases.property')}</p>
                  <select
                    value={filterDraft.propertyId}
                    onChange={(event) =>
                      setFilterDraft((current) => ({
                        ...current,
                        propertyId: event.target.value,
                      }))
                    }
                  >
                    <option value="">{t('cases.allProperties')}</option>
                    {destinations.map((property) => (
                      <option key={property.id} value={property.id}>
                        {getPropertyLabel(property)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="filter-group">
                  <p className="filter-title">{t('cases.columns.closed')}</p>
                  <div className="filter-options">
                    <label className="filter-option">
                      <input
                        type="checkbox"
                        checked={filterDraft.includeClosed}
                        onChange={(event) =>
                          setFilterDraft((current) => ({
                            ...current,
                            includeClosed: event.target.checked,
                          }))
                        }
                      />
                      <span>{t('cases.includeClosed')}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={() =>
                  setFilterDraft({ propertyId: '', includeClosed: false })
                }
              >
                {t('common.clear')}
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  setPropertyId(filterDraft.propertyId)
                  setIncludeClosed(filterDraft.includeClosed)
                  setIsFilterOpen(false)
                }}
              >
                {t('common.applyFilters')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {detail && endpoints.upsertCase ? (
        <CaseDetailModal
          detail={detail}
          canEdit={canEdit}
          propertyOptions={propertyOptions}
          endpoints={endpoints}
          onClose={() => setDetail(null)}
          onChanged={async () => {
            await load()
            if (endpoints.cases) {
              const payload = await getCaseDetail(endpoints.cases, detail.item.id)
              setDetail({
                ...payload,
                item: mapCase(payload.item as unknown as Record<string, unknown>),
                events: payload.events ?? [],
                visits: payload.visits ?? [],
                movements: payload.movements ?? [],
                cost: payload.cost ?? { visits: 0, expenses: 0, total: 0 },
                scopePropertyIds: payload.scopePropertyIds ?? [],
              })
            }
          }}
        />
      ) : null}

      {assignTask ? (
        <Modal
          title={t('operations.assignTaskToVisit')}
          error={formError}
          onClose={() => setAssignTask(null)}
        >
          <label>
            {t('operations.visit')}
            <select
              value={assignVisitId}
              onChange={(event) => setAssignVisitId(event.target.value)}
            >
              <option value="">{t('operations.selectVisit')}</option>
              {assignVisits.map((visit) => (
                <option key={visit.id} value={visit.id}>
                  {visit.scheduledDate} {visit.scheduledStartTime} – {visit.title}
                </option>
              ))}
            </select>
          </label>
          <p className="cases-meta">{t('operations.assignVisitHelp')}</p>
          <button
            className="btn-primary"
            type="button"
            disabled={!assignVisitId || !endpoints.upsertTask}
            onClick={() =>
              void saveTask(endpoints.upsertTask ?? '', {
                id: assignTask.id,
                action: 'assign',
                assignVisitId,
              })
                .then(() => {
                  setAssignTask(null)
                  return load()
                })
                .catch((cause: unknown) =>
                  setFormError(cause instanceof Error ? cause.message : t('cases.saveError')),
                )
            }
          >
            {t('operations.assignTask')}
          </button>
        </Modal>
      ) : null}

      {showNewCase || createFromTask ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={closeCaseForm}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('cases.createCase')}</h3>
                <p className="modal-subtitle">{t('cases.formSubtitle')}</p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={closeCaseForm}
                aria-label={t('common.closeForm')}
              >
                <YlIcon name="xmark" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <label className="form-field">
                  <span>{t('cases.caseTitle')}</span>
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, title: event.target.value }))
                    }
                  />
                </label>
                <label className="form-field">
                  <span>{t('cases.property')}</span>
                  <select
                    value={draft.propertyId}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        propertyId: event.target.value,
                      }))
                    }
                  >
                    <option value="">{t('cases.selectProperty')}</option>
                    {destinations.map((property) => (
                      <option key={property.id} value={property.id}>
                        {getPropertyLabel(property)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span>{t('cases.description')}</span>
                  <textarea
                    value={draft.description}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              {formError ? (
                <DismissibleNotice
                  dismissLabel={t('common.close')}
                  onDismiss={() => setFormError(null)}
                >
                  {formError}
                </DismissibleNotice>
              ) : null}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" type="button" onClick={closeCaseForm}>
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={!draft.title.trim() || !draft.propertyId}
                onClick={() =>
                  void saveAndReload({
                    action: 'create',
                    title: draft.title,
                    propertyId: draft.propertyId,
                    description: draft.description,
                    taskId: createFromTask?.id,
                  })
                    .then(() => closeCaseForm())
                    .catch((cause: unknown) =>
                      setFormError(
                        cause instanceof Error ? cause.message : t('cases.saveError'),
                      ),
                    )
                }
              >
                {t('cases.createCase')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {attachTask ? (
        <Modal
          title={t('cases.addToCase')}
          error={formError}
          onClose={() => setAttachTask(null)}
        >
          <label>
            {t('cases.columns.known')}
            <select
              value={attachCaseId}
              onChange={(event) => setAttachCaseId(event.target.value)}
            >
              <option value="">{t('cases.selectCase')}</option>
              {attachOptions.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title}
                </option>
              ))}
            </select>
          </label>
          {attachOptions.length === 0 ? (
            <p className="cases-meta">{t('cases.noCasesForProperty')}</p>
          ) : null}
          <button
            className="btn-primary"
            type="button"
            disabled={!attachCaseId}
            onClick={() =>
              void saveAndReload({
                action: 'linkTask',
                id: attachCaseId,
                taskId: attachTask.id,
              })
                .then(() => setAttachTask(null))
                .catch((cause: unknown) =>
                  setFormError(cause instanceof Error ? cause.message : t('cases.saveError')),
                )
            }
          >
            {t('cases.addToCase')}
          </button>
        </Modal>
      ) : null}
    </div>
  )
}

function Column({
  title,
  hint,
  count,
  children,
}: {
  title: string
  hint: string
  count?: number
  children: ReactNode
}) {
  return (
    <section className="cases-column">
      <div className="cases-column-head">
        <h2 className="cases-column-title">
          {title}
          {typeof count === 'number' ? ` (${count})` : ''}
        </h2>
      </div>
      <p className="cases-column-hint">{hint}</p>
      {children}
    </section>
  )
}

function CaseColumn({
  title,
  hint,
  items,
  locale,
  onOpen,
}: {
  title: string
  hint: string
  items: CaseRecord[]
  locale: string
  onOpen: (id: string) => void
}) {
  const { t } = useTranslation()
  return (
    <Column title={title} hint={hint} count={items.length}>
      {items.map((entry) => (
        <article className="cases-card" key={entry.id}>
          <button className="cases-card-open" type="button" onClick={() => onOpen(entry.id)}>
            <h3 className="cases-card-title">{entry.title}</h3>
            <p className="cases-meta">{entry.propertyName || entry.propertyId}</p>
            <p className="cases-meta">
              {entry.lastIssueAt
                ? t('cases.lastIssue', { date: formatDay(entry.lastIssueAt, locale) })
                : t('cases.noIssueYet')}
            </p>
          </button>
        </article>
      ))}
    </Column>
  )
}

function Modal({
  title,
  error,
  onClose,
  children,
}: {
  title: string
  error?: string | null
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="btn-icon" type="button" onClick={onClose}>
            <YlIcon name="xmark" size={16} />
          </button>
        </div>
        <div className="modal-body cases-inline-form">
          {error ? <p className="cases-error">{error}</p> : null}
          {children}
        </div>
      </div>
    </div>
  )
}
