import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchJson } from '../operations/api'
import {
  getTodayMadrid,
  getTomorrowMadrid,
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

export function CleaningPlanView({ getEndpoint, propertyOptions: _propertyOptions }: Props) {
  const { t } = useTranslation()
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

  const [plannedDate, setPlannedDate] = useState(getTomorrowMadrid())
  const [status, setStatus] = useState<CleaningPlanStatus>('DRAFT')
  const [rows, setRows] = useState<CleaningPlanRow[]>([])
  const [history, setHistory] = useState<CleaningPlanRecord[]>([])
  const [cleaners, setCleaners] = useState<CleanerRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const isReady = status === 'READY'
  const cleanerById = useMemo(
    () => new Map(cleaners.map((cleaner) => [cleaner.id, cleaner])),
    [cleaners],
  )
  const activeCleaners = useMemo(
    () => cleaners.filter((cleaner) => cleaner.active),
    [cleaners],
  )

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
      return
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      `${endpoints.getPlan}?list=true`,
    )
    setHistory((payload.items ?? []).map(mapPlan))
  }, [endpoints.getPlan])

  const loadPlan = useCallback(
    async (date = plannedDate) => {
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
    [endpoints.getPlan, plannedDate, t],
  )

  useEffect(() => {
    void loadCleaners().catch(() => {
      setError(t('cleaningPlan.missingCleaners'))
    })
  }, [loadCleaners, t])

  useEffect(() => {
    void loadPlan(plannedDate)
  }, [loadPlan, plannedDate])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

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

  const qualityCount = rows.filter((row) => row.qualityReview).length

  return (
    <>
      <section className="card">
        <div className="page-header">
          <div className="page-header-leading">
            <h1 className="page-title">{t('cleaningPlan.title')}</h1>
            <p className="subtitle">{t('cleaningPlan.subtitle')}</p>
          </div>
          <div className="page-action-bar">
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                void loadPlan(plannedDate)
                void loadHistory()
                void loadCleaners()
              }}
            >
              {t('common.refresh')}
            </button>
          </div>
        </div>
        {message ? <p className="notice success">{message}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}
      </section>

      <section className="card filters-card">
        <div className="operations-date-presets">
          <button
            type="button"
            className={
              plannedDate === getTodayMadrid() ? 'btn-primary' : 'btn-secondary'
            }
            onClick={() => setPlannedDate(getTodayMadrid())}
          >
            {t('operations.today')}
          </button>
          <button
            type="button"
            className={
              plannedDate === getTomorrowMadrid()
                ? 'btn-primary'
                : 'btn-secondary'
            }
            onClick={() => setPlannedDate(getTomorrowMadrid())}
          >
            {t('operations.tomorrow')}
          </button>
        </div>
        <div className="filters-grid">
          <label>
            {t('cleaningPlan.day')}
            <input
              type="date"
              value={plannedDate}
              onChange={(event) => setPlannedDate(event.target.value)}
            />
          </label>
          <div className="cleaning-plan-status-wrap">
            <span className="cleaning-plan-status-label">
              {t('cleaningPlan.planStatus')}
            </span>
            <span
              className={`cleaning-status-tag ${
                isReady ? 'is-ready' : 'is-draft'
              }`}
            >
              {isReady ? t('cleaningPlan.ready') : t('cleaningPlan.draft')}
            </span>
          </div>
        </div>
        <div className="page-action-bar cleaning-plan-actions">
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
                disabled={isSaving || isLoading || rows.length === 0}
                onClick={() => void savePlan('ready')}
              >
                {t('cleaningPlan.markReady')}
              </button>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('cleaningPlan.visitsTitle')}</h2>
            <p className="card-subtitle">
              {t('cleaningPlan.visitsSubtitle', {
                count: rows.length,
                quality: qualityCount,
              })}
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('cleaningPlan.visit')}</th>
                <th>{t('cleaningPlan.type')}</th>
                <th>{t('cleaningPlan.cleaner')}</th>
                <th>{t('cleaningPlan.startTime')}</th>
                <th>{t('cleaningPlan.qualityReview')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5}>{t('common.loading')}</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5}>{t('cleaningPlan.emptyVisits')}</td>
                </tr>
              ) : (
                rows.map((row) => {
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
                          <strong>{row.title || row.visitId}</strong>
                          {row.visitStatus ? (
                            <span className="card-meta">{row.visitStatus}</span>
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
                            <option value="">
                              {t('cleaningPlan.noTypes')}
                            </option>
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
                          aria-label={t('cleaningPlan.qualityReview')}
                        />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('cleaningPlan.historyTitle')}</h2>
            <p className="card-subtitle">{t('cleaningPlan.historySubtitle')}</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('cleaningPlan.day')}</th>
                <th>{t('cleaningPlan.planStatus')}</th>
                <th>{t('cleaningPlan.cleanings')}</th>
                <th>{t('cleaningPlan.qualityReviews')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td colSpan={5}>{t('cleaningPlan.emptyHistory')}</td>
                </tr>
              ) : (
                history.map((plan) => {
                  const items = plan.items ?? []
                  const quality = items.filter((item) => item.qualityReview).length
                  return (
                    <tr key={plan.id}>
                      <td>{plan.plannedDate || plan.id}</td>
                      <td>
                        <span
                          className={`cleaning-status-tag ${
                            plan.status === 'READY' ? 'is-ready' : 'is-draft'
                          }`}
                        >
                          {plan.status === 'READY'
                            ? t('cleaningPlan.ready')
                            : t('cleaningPlan.draft')}
                        </span>
                      </td>
                      <td>{items.length}</td>
                      <td>{quality}</td>
                      <td>
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() =>
                            setPlannedDate(plan.plannedDate || plan.id)
                          }
                        >
                          {plan.plannedDate === plannedDate
                            ? t('cleaningPlan.viewing')
                            : t('cleaningPlan.openDay')}
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
    </>
  )
}
