import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { YlIcon } from '../design/icons'
import { fetchJson, saveVisit } from './api'
import { saveCase, type CaseDetail } from './casesApi'
import { getTodayMadrid } from './dateHelpers'
import { getPropertyLabel, isFinanceGroupProperty } from './propertyHelpers'
import type { PropertyOption, TeamRecord, VisitRecord, VisitTypeRecord } from './types'
import {
  isMaintenanceVisitType,
  MAINTENANCE_VISIT_TYPE_ID,
  resolveTeamIdForVisitType,
} from './visitTypeIds'

const MAINTENANCE_TEAM_ID = 'team_maintenance'

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

const formatMoney = (value: number, locale: string) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(value)

const mapVisit = (item: Record<string, unknown>): VisitRecord =>
  ({
    id: String(item.id ?? ''),
    propertyId: String(item.propertyId ?? ''),
    visitTypeId: String(item.visitTypeId ?? ''),
    teamId: String(item.teamId ?? ''),
    title: String(item.title ?? ''),
    scheduledDate: String(item.scheduledDate ?? ''),
    scheduledStartTime: String(item.scheduledStartTime ?? ''),
    status: String(item.status ?? 'SCHEDULED'),
  }) as VisitRecord

type Props = {
  detail: CaseDetail
  canEdit: boolean
  propertyOptions: PropertyOption[]
  endpoints: {
    upsertCase?: string
    upsertVisit?: string
    visits?: string
    teams?: string
    visitTypes?: string
  }
  onClose: () => void
  onChanged: () => Promise<void>
}

export function CaseDetailModal({
  detail,
  canEdit,
  propertyOptions,
  endpoints,
  onClose,
  onChanged,
}: Props) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const item = detail.item
  const closed = item.status === 'CLOSED'
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [comment, setComment] = useState('')
  const [issue, setIssue] = useState('')
  const [issueDate, setIssueDate] = useState(getTodayMadrid())
  const [linkVisitId, setLinkVisitId] = useState('')
  const [visitOptions, setVisitOptions] = useState<VisitRecord[]>([])
  const [showVisitForm, setShowVisitForm] = useState(false)
  const [teams, setTeams] = useState<TeamRecord[]>([])
  const [visitTypes, setVisitTypes] = useState<VisitTypeRecord[]>([])
  const [expense, setExpense] = useState({
    description: '',
    amount: '',
    ivaRate: '0',
    date: getTodayMadrid(),
  })
  const scopeOptions = useMemo(
    () =>
      propertyOptions.filter(
        (property) =>
          detail.scopePropertyIds.includes(property.id) &&
          !isFinanceGroupProperty(property),
      ),
    [detail.scopePropertyIds, propertyOptions],
  )
  const [visitForm, setVisitForm] = useState({
    propertyId: scopeOptions[0]?.id ?? '',
    visitTypeId: MAINTENANCE_VISIT_TYPE_ID,
    teamId: MAINTENANCE_TEAM_ID,
    scheduledDate: getTodayMadrid(),
    scheduledStartTime: '10:00',
    scheduledEndTime: '11:00',
    title: item.title,
  })

  useEffect(() => {
    if (!endpoints.visits) return
    let cancelled = false
    void Promise.all(
      detail.scopePropertyIds.map((propertyId) =>
        fetchJson<{ items?: Record<string, unknown>[] }>(
          `${endpoints.visits}?propertyId=${encodeURIComponent(propertyId)}`,
        ).catch(() => ({ items: [] })),
      ),
    ).then((pages) => {
      if (cancelled) return
      const linked = new Set(detail.visits.map((visit) => visit.id))
      const options = pages
        .flatMap((page) => page.items ?? [])
        .map(mapVisit)
        .filter(
          (visit) =>
            !linked.has(visit.id) &&
            visit.status !== 'CANCELLED' &&
            (isMaintenanceVisitType(visit.visitTypeId) ||
              visit.teamId === MAINTENANCE_TEAM_ID),
        )
      setVisitOptions(options)
    })
    return () => {
      cancelled = true
    }
  }, [detail.scopePropertyIds, detail.visits, endpoints.visits])

  const run = async (work: () => Promise<void>) => {
    if (!endpoints.upsertCase) return false
    setSaving(true)
    setError(null)
    try {
      await work()
      await onChanged()
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('cases.saveError'))
      return false
    } finally {
      setSaving(false)
    }
  }

  const post = (payload: Record<string, unknown>) =>
    run(async () => {
      await saveCase(endpoints.upsertCase ?? '', { id: item.id, ...payload })
    })

  const loadVisitCatalogs = async () => {
    if (!endpoints.teams || !endpoints.visitTypes) return
    const [teamPayload, typePayload] = await Promise.all([
      fetchJson<{ items?: Record<string, unknown>[] }>(endpoints.teams),
      fetchJson<{ items?: Record<string, unknown>[] }>(endpoints.visitTypes),
    ])
    const nextTeams = (teamPayload.items ?? []).map((entry) => ({
      id: String(entry.id ?? ''),
      name: String(entry.name ?? entry.id ?? ''),
    }))
    const nextTypes = (typePayload.items ?? []).map((entry) => ({
      id: String(entry.id ?? ''),
      name: String(entry.name ?? entry.id ?? ''),
      defaultTeamId:
        typeof entry.defaultTeamId === 'string' ? entry.defaultTeamId : undefined,
      defaultDurationMinutes:
        typeof entry.defaultDurationMinutes === 'number'
          ? entry.defaultDurationMinutes
          : undefined,
      appliesToHourBank: Boolean(entry.appliesToHourBank),
    }))
    setTeams(nextTeams)
    setVisitTypes(nextTypes)
    const visitType = nextTypes.find((entry) => entry.id === MAINTENANCE_VISIT_TYPE_ID)
    setVisitForm((current) => ({
      ...current,
      teamId: resolveTeamIdForVisitType(visitType, nextTeams, MAINTENANCE_TEAM_ID),
    }))
  }

  const statusLabel =
    item.status === 'QUARANTINE'
      ? t('cases.columns.quarantine')
      : item.status === 'CLOSED'
        ? t('cases.columns.closed')
        : t('cases.columns.known')

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal operations-detail-modal modal-scrollable">
        <div className="modal-header">
          <div>
            <p className="eyebrow">{statusLabel}</p>
            <h3 className="modal-title">{item.title}</h3>
            <p className="modal-subtitle">
              {item.propertyName || item.propertyId}
              {' · '}
              {item.lastIssueAt
                ? t('cases.lastIssue', { date: formatDay(item.lastIssueAt, locale) })
                : t('cases.noIssueYet')}
            </p>
          </div>
          <button className="btn-icon" type="button" onClick={onClose}>
            <YlIcon name="xmark" size={16} />
          </button>
        </div>
        <div className="modal-body">
          {error ? <p className="cases-error">{error}</p> : null}
          {item.description ? <p>{item.description}</p> : null}
          <div className="cases-cost">
            <div>
              <p className="cases-meta">{t('cases.costVisits')}</p>
              <strong>{formatMoney(detail.cost.visits, locale)}</strong>
            </div>
            <div>
              <p className="cases-meta">{t('cases.costExpenses')}</p>
              <strong>{formatMoney(detail.cost.expenses, locale)}</strong>
            </div>
            <div>
              <p className="cases-meta">{t('cases.costTotal')}</p>
              <strong>{formatMoney(detail.cost.total, locale)}</strong>
            </div>
          </div>
          <p className="cases-meta">{t('cases.costNote')}</p>
          {canEdit ? (
            <div className="cases-card-actions">
              {item.status === 'KNOWN' ? (
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={saving}
                  onClick={() => void post({ action: 'status', status: 'QUARANTINE' })}
                >
                  {t('cases.moveToQuarantine')}
                </button>
              ) : null}
              {item.status === 'QUARANTINE' ? (
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={saving}
                  onClick={() => void post({ action: 'status', status: 'KNOWN' })}
                >
                  {t('cases.backToKnown')}
                </button>
              ) : null}
              {closed ? (
                <button
                  className="btn-primary"
                  type="button"
                  disabled={saving}
                  onClick={() => void post({ action: 'reactivate' })}
                >
                  {t('cases.reactivate')}
                </button>
              ) : null}
            </div>
          ) : null}
          {item.status === 'QUARANTINE' && item.quarantineStartedAt ? (
            <p className="cases-meta">
              {t('cases.closesOn', {
                date: formatDay(
                  new Date(
                    Date.parse(item.quarantineStartedAt) + 30 * 24 * 60 * 60 * 1000,
                  ).toISOString(),
                  locale,
                ),
              })}
            </p>
          ) : null}

          <section className="cases-section">
            <h4>{t('cases.activity')}</h4>
            {detail.events.length === 0 ? (
              <p className="cases-meta">{t('cases.noActivity')}</p>
            ) : (
              detail.events.map((event) => (
                <article
                  key={event.id}
                  className={`cases-event ${event.type === 'ISSUE' ? 'is-issue' : 'is-comment'}`}
                >
                  <p className="cases-meta">
                    {event.type === 'ISSUE' ? t('cases.issue') : t('cases.comment')}
                    {' · '}
                    {formatDay(event.createdAt, locale)}
                  </p>
                  <p>{event.body}</p>
                </article>
              ))
            )}
            {canEdit ? (
              <div className="cases-inline-form">
                <label>
                  {t('cases.comment')}
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                  />
                </label>
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={saving || !comment.trim()}
                  onClick={() =>
                    void post({ action: 'comment', body: comment }).then((ok) => {
                      if (ok) setComment('')
                    })
                  }
                >
                  {t('cases.addComment')}
                </button>
                {closed ? null : (
                  <>
                    <label>
                      {t('cases.issue')}
                      <textarea
                        value={issue}
                        onChange={(event) => setIssue(event.target.value)}
                      />
                    </label>
                    <label>
                      {t('cases.issueDate')}
                      <input
                        type="date"
                        value={issueDate}
                        onChange={(event) => setIssueDate(event.target.value)}
                      />
                    </label>
                    <p className="cases-meta">{t('cases.commentsNotIssues')}</p>
                    <button
                      className="btn-secondary"
                      type="button"
                      disabled={saving || !issue.trim()}
                      onClick={() =>
                        void post({
                          action: 'issue',
                          body: issue,
                          date: issueDate,
                        }).then((ok) => {
                          if (ok) setIssue('')
                        })
                      }
                    >
                      {t('cases.addIssue')}
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </section>

          <section className="cases-section">
            <h4>{t('cases.visits')}</h4>
            {detail.visits.length === 0 ? (
              <p className="cases-meta">{t('cases.noVisits')}</p>
            ) : (
              detail.visits.map((visit) => (
                <div className="cases-link-row" key={visit.id}>
                  <div>
                    <strong>{visit.title}</strong>
                    <p className="cases-meta">
                      {visit.scheduledDate}
                      {' · '}
                      {visit.includedInMaintenance && visit.price !== null
                        ? t('cases.visitIncluded', {
                            amount: formatMoney(visit.price, locale),
                          })
                        : t('cases.visitUnpriced')}
                    </p>
                  </div>
                  {canEdit && !closed ? (
                    <button
                      className="btn-ghost"
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        void post({ action: 'unlinkVisit', visitId: visit.id })
                      }
                    >
                      {t('cases.unlink')}
                    </button>
                  ) : null}
                </div>
              ))
            )}
            {canEdit && !closed ? (
              <div className="cases-inline-form">
                <label>
                  {t('cases.linkVisit')}
                  <select
                    value={linkVisitId}
                    onChange={(event) => setLinkVisitId(event.target.value)}
                  >
                    <option value="">{t('operations.selectVisit')}</option>
                    {visitOptions.map((visit) => (
                      <option key={visit.id} value={visit.id}>
                        {visit.scheduledDate} {visit.scheduledStartTime} – {visit.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={saving || !linkVisitId}
                  onClick={() =>
                    void post({ action: 'linkVisit', visitId: linkVisitId }).then((ok) => {
                      if (ok) setLinkVisitId('')
                    })
                  }
                >
                  {t('cases.linkVisit')}
                </button>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => {
                    setShowVisitForm((current) => !current)
                    void loadVisitCatalogs()
                  }}
                >
                  {t('cases.newVisit')}
                </button>
                {showVisitForm ? (
                  <>
                    <label>
                      {t('cases.property')}
                      <select
                        value={visitForm.propertyId}
                        onChange={(event) =>
                          setVisitForm((current) => ({
                            ...current,
                            propertyId: event.target.value,
                          }))
                        }
                      >
                        {scopeOptions.map((property) => (
                          <option key={property.id} value={property.id}>
                            {getPropertyLabel(property)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t('cases.visitType')}
                      <select
                        value={visitForm.visitTypeId}
                        onChange={(event) => {
                          const visitType = visitTypes.find(
                            (entry) => entry.id === event.target.value,
                          )
                          setVisitForm((current) => ({
                            ...current,
                            visitTypeId: event.target.value,
                            teamId: resolveTeamIdForVisitType(
                              visitType,
                              teams,
                              current.teamId,
                            ),
                          }))
                        }}
                      >
                        {visitTypes.map((visitType) => (
                          <option key={visitType.id} value={visitType.id}>
                            {visitType.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t('cases.team')}
                      <select
                        value={visitForm.teamId}
                        onChange={(event) =>
                          setVisitForm((current) => ({
                            ...current,
                            teamId: event.target.value,
                          }))
                        }
                      >
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t('cases.date')}
                      <input
                        type="date"
                        value={visitForm.scheduledDate}
                        onChange={(event) =>
                          setVisitForm((current) => ({
                            ...current,
                            scheduledDate: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      {t('cases.start')}
                      <input
                        type="time"
                        value={visitForm.scheduledStartTime}
                        onChange={(event) =>
                          setVisitForm((current) => ({
                            ...current,
                            scheduledStartTime: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      {t('cases.end')}
                      <input
                        type="time"
                        value={visitForm.scheduledEndTime}
                        onChange={(event) =>
                          setVisitForm((current) => ({
                            ...current,
                            scheduledEndTime: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      {t('cases.caseTitle')}
                      <input
                        value={visitForm.title}
                        onChange={(event) =>
                          setVisitForm((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      className="btn-primary"
                      type="button"
                      disabled={saving || !endpoints.upsertVisit || !visitForm.propertyId}
                      onClick={() =>
                        void run(async () => {
                          const response = await saveVisit(endpoints.upsertVisit ?? '', {
                            propertyId: visitForm.propertyId,
                            visitTypeId: visitForm.visitTypeId,
                            teamId: visitForm.teamId,
                            scheduledDate: visitForm.scheduledDate,
                            scheduledStartTime: visitForm.scheduledStartTime,
                            scheduledEndTime: visitForm.scheduledEndTime,
                            title: visitForm.title.trim() || item.title,
                            priority: 'MEDIUM',
                          })
                          const visitId = response.item?.id
                          if (!visitId) {
                            throw new Error(t('cases.saveError'))
                          }
                          await saveCase(endpoints.upsertCase ?? '', {
                            id: item.id,
                            action: 'linkVisit',
                            visitId,
                          })
                          setShowVisitForm(false)
                        })
                      }
                    >
                      {t('cases.createVisit')}
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="cases-section">
            <h4>{t('cases.expenses')}</h4>
            {detail.movements.length === 0 ? (
              <p className="cases-meta">{t('cases.noExpenses')}</p>
            ) : (
              detail.movements.map((movement) => (
                <div className="cases-link-row" key={movement.id}>
                  <div>
                    <strong>{movement.description}</strong>
                    <p className="cases-meta">
                      {movement.date} · {movement.status} ·{' '}
                      {formatMoney(movement.totalAmount, locale)}
                    </p>
                  </div>
                </div>
              ))
            )}
            {canEdit && !closed ? (
              <div className="cases-inline-form">
                <label>
                  {t('cases.expenseDescription')}
                  <input
                    value={expense.description}
                    onChange={(event) =>
                      setExpense((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {t('cases.amount')}
                  <input
                    inputMode="decimal"
                    value={expense.amount}
                    onChange={(event) =>
                      setExpense((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {t('cases.iva')}
                  <select
                    value={expense.ivaRate}
                    onChange={(event) =>
                      setExpense((current) => ({
                        ...current,
                        ivaRate: event.target.value,
                      }))
                    }
                  >
                    <option value="0">0%</option>
                    <option value="10">10%</option>
                    <option value="21">21%</option>
                  </select>
                </label>
                <label>
                  {t('cases.date')}
                  <input
                    type="date"
                    value={expense.date}
                    onChange={(event) =>
                      setExpense((current) => ({ ...current, date: event.target.value }))
                    }
                  />
                </label>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={saving || !expense.description.trim() || !expense.amount}
                  onClick={() =>
                    void post({
                      action: 'expense',
                      description: expense.description,
                      amount: Number(expense.amount.replace(',', '.')),
                      ivaRate: Number(expense.ivaRate),
                      date: expense.date,
                    }).then((ok) => {
                      if (ok) {
                        setExpense((current) => ({
                          ...current,
                          description: '',
                          amount: '',
                        }))
                      }
                    })
                  }
                >
                  {t('cases.addExpense')}
                </button>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
