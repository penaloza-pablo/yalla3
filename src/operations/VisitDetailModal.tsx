import { useEffect, useMemo, useState, type TouchEvent, type WheelEvent } from 'react'
import { createPortal } from 'react-dom'
import { fetchUserAttributes } from 'aws-amplify/auth'
import { useTranslation } from 'react-i18next'
import {
  getReferenceList,
  getTasksByVisit,
  getVisitById,
  saveVisit,
} from './api'
import { getPropertyLabel, sortPropertyOptions } from './propertyHelpers'
import type {
  PropertyOption,
  TaskRecord,
  TeamRecord,
  UserRecord,
  VisitRecord,
  VisitTypeRecord,
} from './types'

type Props = {
  visitId: string
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
  onClose: () => void
  onVisitChanged?: () => void
}

type VisitForm = {
  id: string
  propertyId: string
  visitTypeId: string
  teamId: string
  assignedUserId: string
  scheduledDate: string
  scheduledStartTime: string
  scheduledEndTime: string
  priority: string
  title: string
  description: string
  estimatedDurationMinutes: string
  appliesToHourBank: boolean
}

const mapVisit = (item: Record<string, unknown>): VisitRecord => ({
  id: String(item.id ?? ''),
  propertyId: String(item.propertyId ?? ''),
  visitTypeId: String(item.visitTypeId ?? ''),
  teamId: String(item.teamId ?? ''),
  assignedUserId: String(item.assignedUserId ?? ''),
  scheduledDate: String(item.scheduledDate ?? ''),
  scheduledStartTime: String(item.scheduledStartTime ?? ''),
  scheduledEndTime: String(item.scheduledEndTime ?? ''),
  status: String(item.status ?? 'SCHEDULED').toUpperCase() as VisitRecord['status'],
  priority: String(item.priority ?? 'MEDIUM').toUpperCase(),
  title: String(item.title ?? ''),
  description: String(item.description ?? ''),
  estimatedDurationMinutes:
    typeof item.estimatedDurationMinutes === 'number'
      ? item.estimatedDurationMinutes
      : undefined,
  actualDurationHours:
    typeof item.actualDurationHours === 'number'
      ? item.actualDurationHours
      : undefined,
  appliesToHourBank: Boolean(item.appliesToHourBank),
  specialHours: Boolean(item.specialHours),
})

const mapTask = (item: Record<string, unknown>): TaskRecord => ({
  id: String(item.id ?? ''),
  propertyId: String(item.propertyId ?? ''),
  visitId: typeof item.visitId === 'string' ? item.visitId : undefined,
  teamId: String(item.teamId ?? ''),
  assignedUserId:
    typeof item.assignedUserId === 'string' ? item.assignedUserId : undefined,
  title: String(item.title ?? ''),
  description: String(item.description ?? ''),
  status: String(item.status ?? 'UNASSIGNED').toUpperCase() as TaskRecord['status'],
  priority: String(item.priority ?? 'MEDIUM').toUpperCase(),
  dueDate: typeof item.dueDate === 'string' ? item.dueDate : undefined,
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
})

const mapTeam = (item: Record<string, unknown>): TeamRecord => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? item.email ?? item.id ?? ''),
})

const mapUser = (item: Record<string, unknown>): UserRecord => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? item.email ?? item.id ?? ''),
  email: typeof item.email === 'string' ? item.email : undefined,
  teamId: typeof item.teamId === 'string' ? item.teamId : undefined,
})

const mapVisitType = (item: Record<string, unknown>): VisitTypeRecord => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? item.id ?? ''),
  defaultTeamId:
    typeof item.defaultTeamId === 'string' ? item.defaultTeamId : undefined,
  defaultDurationMinutes:
    typeof item.defaultDurationMinutes === 'number'
      ? item.defaultDurationMinutes
      : undefined,
  appliesToHourBank: Boolean(item.appliesToHourBank),
})

const formFromVisit = (visit: VisitRecord): VisitForm => ({
  id: visit.id,
  propertyId: visit.propertyId,
  visitTypeId: visit.visitTypeId,
  teamId: visit.teamId,
  assignedUserId: visit.assignedUserId,
  scheduledDate: visit.scheduledDate,
  scheduledStartTime: visit.scheduledStartTime,
  scheduledEndTime: visit.scheduledEndTime,
  priority: visit.priority,
  title: visit.title,
  description: visit.description,
  estimatedDurationMinutes: visit.estimatedDurationMinutes
    ? String(visit.estimatedDurationMinutes)
    : '',
  appliesToHourBank: visit.appliesToHourBank,
})

const getCurrentUserEmail = async () => {
  try {
    const attributes = await fetchUserAttributes()
    return attributes.email ?? attributes.preferred_username ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export function VisitDetailModal({
  visitId,
  getEndpoint,
  propertyOptions,
  onClose,
  onVisitChanged,
}: Props) {
  const { t } = useTranslation()
  const [visit, setVisit] = useState<VisitRecord | null>(null)
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [teams, setTeams] = useState<TeamRecord[]>([])
  const [users, setUsers] = useState<UserRecord[]>([])
  const [visitTypes, setVisitTypes] = useState<VisitTypeRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isCompleteOpen, setIsCompleteOpen] = useState(false)
  const [isCancelOpen, setIsCancelOpen] = useState(false)
  const [visitForm, setVisitForm] = useState<VisitForm | null>(null)
  const [completeForm, setCompleteForm] = useState({
    hours: '1',
    poolOfHours: false,
    specialHours: false,
  })
  const [cancelForm, setCancelForm] = useState({
    taskAction: 'release' as 'release' | 'cancel',
    cancelConfirmed: false,
  })

  const endpoints = useMemo(
    () => ({
      visits: getEndpoint('getVisitsUrl', import.meta.env.VITE_GET_VISITS_URL),
      upsertVisit: getEndpoint(
        'upsertVisitUrl',
        import.meta.env.VITE_UPSERT_VISIT_URL,
      ),
      tasks: getEndpoint('getTasksUrl', import.meta.env.VITE_GET_TASKS_URL),
      teams: getEndpoint('getTeamsUrl', import.meta.env.VITE_GET_TEAMS_URL),
      users: getEndpoint('getUsersUrl', import.meta.env.VITE_GET_USERS_URL),
      visitTypes: getEndpoint(
        'getVisitTypesUrl',
        import.meta.env.VITE_GET_VISIT_TYPES_URL,
      ),
    }),
    [getEndpoint],
  )

  const propertyById = useMemo(
    () =>
      new Map(
        propertyOptions.map((property) => [property.id, getPropertyLabel(property)]),
      ),
    [propertyOptions],
  )
  const sortedProperties = useMemo(
    () => sortPropertyOptions(propertyOptions),
    [propertyOptions],
  )
  const teamById = useMemo(
    () => new Map(teams.map((team) => [team.id, team.name])),
    [teams],
  )
  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user.name])),
    [users],
  )
  const visitTypeById = useMemo(
    () => new Map(visitTypes.map((type) => [type.id, type.name])),
    [visitTypes],
  )
  const teamUsers = useMemo(() => {
    if (!visitForm?.teamId) {
      return users
    }
    return users.filter((user) => user.teamId === visitForm.teamId)
  }, [users, visitForm?.teamId])
  const visitHasOpenTasks = tasks.some(
    (task) =>
      task.status !== 'COMPLETED' &&
      task.status !== 'DISMISS' &&
      task.status !== 'CANCELLED',
  )
  const tasksToRelease = tasks.filter(
    (task) => task.status === 'PENDING' || task.status === 'BLOCKED',
  )
  const canChangeStatus =
    visit && visit.status !== 'COMPLETED' && visit.status !== 'CANCELLED'

  const reloadVisit = async () => {
    if (!endpoints.visits) {
      return
    }
    const [visitPayload, tasksPayload] = await Promise.all([
      getVisitById(endpoints.visits, visitId),
      endpoints.tasks
        ? getTasksByVisit(endpoints.tasks, visitId).catch(() => ({
            items: [] as TaskRecord[],
          }))
        : Promise.resolve({ items: [] as TaskRecord[] }),
    ])
    const item = visitPayload.item as Record<string, unknown> | undefined
    if (item) {
      setVisit(mapVisit(item))
    }
    setTasks(((tasksPayload.items ?? []) as Record<string, unknown>[]).map(mapTask))
  }

  useEffect(() => {
    let cancelled = false

    const loadVisit = async () => {
      if (!endpoints.visits) {
        setError(t('operations.missingVisitsEndpoint'))
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      setError('')
      try {
        const [visitPayload, tasksPayload, teamsPayload, usersPayload, typesPayload] =
          await Promise.all([
            getVisitById(endpoints.visits, visitId),
            endpoints.tasks
              ? getTasksByVisit(endpoints.tasks, visitId).catch(() => ({
                  items: [] as TaskRecord[],
                }))
              : Promise.resolve({ items: [] as TaskRecord[] }),
            endpoints.teams
              ? getReferenceList(endpoints.teams).catch(() => ({ items: [] }))
              : Promise.resolve({ items: [] }),
            endpoints.users
              ? getReferenceList(endpoints.users).catch(() => ({ items: [] }))
              : Promise.resolve({ items: [] }),
            endpoints.visitTypes
              ? getReferenceList(endpoints.visitTypes).catch(() => ({ items: [] }))
              : Promise.resolve({ items: [] }),
          ])

        if (cancelled) {
          return
        }

        const item = visitPayload.item as Record<string, unknown> | undefined
        if (!item) {
          setVisit(null)
          setError(t('cleaningPlan.loadVisitError'))
          return
        }

        setVisit(mapVisit(item))
        setTasks(
          ((tasksPayload.items ?? []) as Record<string, unknown>[]).map(mapTask),
        )
        setTeams((teamsPayload.items ?? []).map(mapTeam))
        setUsers((usersPayload.items ?? []).map(mapUser))
        setVisitTypes((typesPayload.items ?? []).map(mapVisitType))
      } catch (loadError) {
        if (!cancelled) {
          setVisit(null)
          setError(
            loadError instanceof Error
              ? loadError.message
              : t('cleaningPlan.loadVisitError'),
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadVisit()
    return () => {
      cancelled = true
    }
  }, [endpoints, t, visitId])

  useEffect(() => {
    const { body } = document
    const scrollY = window.scrollY
    const previous = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    }
    body.style.overflow = 'hidden'
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    return () => {
      body.style.overflow = previous.overflow
      body.style.position = previous.position
      body.style.top = previous.top
      body.style.left = previous.left
      body.style.right = previous.right
      body.style.width = previous.width
      window.scrollTo(0, scrollY)
    }
  }, [])

  const trapBackgroundScroll = (
    event: WheelEvent<HTMLDivElement> | TouchEvent<HTMLDivElement>,
  ) => {
    const target = event.target as HTMLElement | null
    if (!target?.closest('.modal-body')) {
      event.preventDefault()
    }
  }

  const notifyChanged = () => {
    onVisitChanged?.()
  }

  const updateVisitStatus = async (
    status: VisitRecord['status'],
    extra?: Record<string, unknown>,
    successMessage?: string,
  ) => {
    if (!visit) {
      return false
    }
    if (!endpoints.upsertVisit) {
      setError(t('operations.missingWriteVisit'))
      return false
    }
    setIsSaving(true)
    setError('')
    try {
      const closedBy = await getCurrentUserEmail()
      await saveVisit(endpoints.upsertVisit, {
        id: visit.id,
        status,
        closedBy,
        ...extra,
      })
      setMessage(successMessage ?? t('operations.visitSaved'))
      await reloadVisit()
      notifyChanged()
      return true
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t('operations.unableUpdateVisit'),
      )
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const openEdit = () => {
    if (!visit) {
      return
    }
    setVisitForm(formFromVisit(visit))
    setIsEditOpen(true)
  }

  const submitEdit = async () => {
    if (!visitForm || !endpoints.upsertVisit) {
      setError(t('operations.missingWriteVisit'))
      return
    }
    const property = propertyOptions.find((item) => item.id === visitForm.propertyId)
    const visitType = visitTypes.find((item) => item.id === visitForm.visitTypeId)
    const title =
      visitForm.title.trim() ||
      `${visitType?.name ?? 'Visit'} - ${
        property ? getPropertyLabel(property) : 'Property'
      }`
    setIsSaving(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {
        id: visitForm.id,
        propertyId: visitForm.propertyId,
        visitTypeId: visitForm.visitTypeId,
        teamId: visitForm.teamId,
        assignedUserId: visitForm.assignedUserId,
        scheduledDate: visitForm.scheduledDate,
        scheduledStartTime: visitForm.scheduledStartTime,
        scheduledEndTime: visitForm.scheduledEndTime,
        priority: visitForm.priority || 'MEDIUM',
        title,
        description: visitForm.description,
        appliesToHourBank: visitForm.appliesToHourBank,
      }
      if (visitForm.estimatedDurationMinutes) {
        payload.estimatedDurationMinutes = Number(visitForm.estimatedDurationMinutes)
      }
      const response = await saveVisit(endpoints.upsertVisit, payload)
      const item = response.item as Record<string, unknown> | undefined
      if (item) {
        setVisit(mapVisit(item))
      } else {
        await reloadVisit()
      }
      setIsEditOpen(false)
      setMessage(t('operations.visitSaved'))
      notifyChanged()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t('operations.unableSaveVisit'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const openComplete = () => {
    if (visitHasOpenTasks) {
      setError(t('operations.completeTasksFirst'))
      return
    }
    setCompleteForm({
      hours: visit?.actualDurationHours ? String(visit.actualDurationHours) : '1',
      poolOfHours: visit?.appliesToHourBank ?? false,
      specialHours: visit?.specialHours ?? false,
    })
    setIsCompleteOpen(true)
  }

  const submitComplete = async () => {
    const hours = Number(completeForm.hours)
    if (!Number.isFinite(hours) || hours <= 0) {
      setError(t('operations.enterValidHours'))
      return
    }
    if (visitHasOpenTasks) {
      setError(t('operations.completeTasksFirst'))
      return
    }
    const ok = await updateVisitStatus(
      'COMPLETED',
      {
        actualDurationHours: hours,
        appliesToHourBank: completeForm.poolOfHours,
        specialHours: completeForm.specialHours,
      },
      t('operations.visitCompleted'),
    )
    if (ok) {
      setIsCompleteOpen(false)
    }
  }

  const openCancel = () => {
    setCancelForm({ taskAction: 'release', cancelConfirmed: false })
    setIsCancelOpen(true)
  }

  const submitCancel = async () => {
    if (cancelForm.taskAction === 'cancel' && !cancelForm.cancelConfirmed) {
      setError(t('operations.cancelVisitConfirmNeeded'))
      return
    }
    const cancelTaskAction = tasks.length > 0 ? cancelForm.taskAction : undefined
    const ok = await updateVisitStatus(
      'CANCELLED',
      cancelTaskAction ? { cancelTaskAction } : undefined,
      t('operations.visitCancelled'),
    )
    if (ok) {
      setIsCancelOpen(false)
      onClose()
    }
  }

  const detail = (
    <div
      className="modal-overlay is-stacked"
      role="dialog"
      aria-modal="true"
      aria-labelledby="visit-detail-title"
      onWheel={trapBackgroundScroll}
      onTouchMove={trapBackgroundScroll}
    >
      <div className="modal operations-detail-modal modal-scrollable">
        <div className="modal-header">
          <div>
            <h3 className="modal-title" id="visit-detail-title">
              {visit?.title || t('cleaningPlan.visit')}
            </h3>
            <p className="modal-subtitle">{visit?.id || visitId}</p>
          </div>
          <button
            className="btn-icon"
            type="button"
            onClick={onClose}
            aria-label={t('operations.closeVisitDetail')}
          >
            ✕
          </button>
        </div>
        <div className="modal-body operations-detail-body">
          {message ? <p className="notice success">{message}</p> : null}
          {isLoading ? <p>{t('common.loading')}</p> : null}
          {error ? <p className="notice error">{error}</p> : null}
          {visit ? (
            <>
              <p>
                <strong>{t('operations.property')}:</strong>{' '}
                {propertyById.get(visit.propertyId) ?? visit.propertyId}
              </p>
              <p>
                <strong>{t('operations.visitType')}:</strong>{' '}
                {visitTypeById.get(visit.visitTypeId) ?? visit.visitTypeId}
              </p>
              <p>
                <strong>{t('operations.schedule')}:</strong> {visit.scheduledDate}{' '}
                {visit.scheduledStartTime} – {visit.scheduledEndTime}
              </p>
              <p>
                <strong>{t('operations.team')}:</strong>{' '}
                {teamById.get(visit.teamId) ?? visit.teamId}
              </p>
              <p>
                <strong>{t('operations.assignedUser')}:</strong>{' '}
                {userById.get(visit.assignedUserId) || visit.assignedUserId || '—'}
              </p>
              <p>
                <strong>{t('operations.status')}:</strong> {visit.status}
              </p>
              {visit.description ? (
                <p>
                  <strong>{t('operations.description')}:</strong> {visit.description}
                </p>
              ) : null}

              <h4 className="section-title">{t('operations.tasks')}</h4>
              {tasks.length === 0 ? (
                <p className="card-meta">{t('cleaningPlan.emptyVisitTasks')}</p>
              ) : (
                <ul className="operations-task-list">
                  {tasks.map((task) => (
                    <li key={task.id}>
                      <div className="operations-task-content">
                        <span className="operations-task-title">{task.title}</span>
                        {task.priority === 'URGENT' ? (
                          <span className="status status-danger">
                            {t('operations.priorityUrgent')}
                          </span>
                        ) : null}
                        <span className="card-meta">{task.status}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>
        {visit ? (
          <div className="modal-footer operations-detail-actions">
            <button type="button" className="btn-secondary" onClick={openEdit}>
              {t('operations.editVisit')}
            </button>
            {canChangeStatus ? (
              <>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={visitHasOpenTasks || isSaving}
                  title={
                    visitHasOpenTasks ? t('operations.completeTasksFirst') : undefined
                  }
                  onClick={openComplete}
                >
                  {t('operations.completeVisit')}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={isSaving}
                  onClick={openCancel}
                >
                  {t('operations.cancelVisit')}
                </button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )

  const editModal =
    isEditOpen && visitForm ? (
      <div
        className="modal-overlay is-stacked"
        role="dialog"
        aria-modal="true"
        onWheel={trapBackgroundScroll}
        onTouchMove={trapBackgroundScroll}
      >
        <div className="modal modal-scrollable">
          <div className="modal-header">
            <h3 className="modal-title">{t('operations.editVisit')}</h3>
            <button
              className="btn-icon"
              type="button"
              onClick={() => setIsEditOpen(false)}
              aria-label={t('common.close')}
            >
              ✕
            </button>
          </div>
          <div className="modal-body form-grid">
            <label>
              {t('operations.property')}
              <select
                value={visitForm.propertyId}
                onChange={(event) =>
                  setVisitForm((current) =>
                    current
                      ? { ...current, propertyId: event.target.value }
                      : current,
                  )
                }
              >
                <option value="">{t('cleaningBilling.selectProperty')}</option>
                {sortedProperties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {getPropertyLabel(property)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('operations.visitType')}
              <select
                value={visitForm.visitTypeId}
                onChange={(event) => {
                  const visitTypeId = event.target.value
                  const visitType = visitTypes.find((item) => item.id === visitTypeId)
                  const property = propertyOptions.find(
                    (item) => item.id === visitForm.propertyId,
                  )
                  setVisitForm((current) =>
                    current
                      ? {
                          ...current,
                          visitTypeId,
                          teamId: visitType?.defaultTeamId ?? current.teamId,
                          estimatedDurationMinutes: visitType?.defaultDurationMinutes
                            ? String(visitType.defaultDurationMinutes)
                            : current.estimatedDurationMinutes,
                          appliesToHourBank:
                            visitType?.appliesToHourBank ?? current.appliesToHourBank,
                          title:
                            current.title.trim() ||
                            `${visitType?.name ?? 'Visit'} - ${
                              property ? getPropertyLabel(property) : 'Property'
                            }`,
                        }
                      : current,
                  )
                }}
              >
                <option value="">{t('common.select')}</option>
                {visitTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('operations.team')}
              <select
                value={visitForm.teamId}
                onChange={(event) =>
                  setVisitForm((current) =>
                    current
                      ? {
                          ...current,
                          teamId: event.target.value,
                          assignedUserId: '',
                        }
                      : current,
                  )
                }
              >
                <option value="">{t('common.select')}</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('operations.assignedUser')}
              <select
                value={visitForm.assignedUserId}
                onChange={(event) =>
                  setVisitForm((current) =>
                    current
                      ? { ...current, assignedUserId: event.target.value }
                      : current,
                  )
                }
              >
                <option value="">{t('operations.unassigned')}</option>
                {teamUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('common.date')}
              <input
                type="date"
                value={visitForm.scheduledDate}
                onChange={(event) =>
                  setVisitForm((current) =>
                    current
                      ? { ...current, scheduledDate: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            <label>
              {t('operations.schedule')}
              <input
                type="time"
                value={visitForm.scheduledStartTime}
                onChange={(event) =>
                  setVisitForm((current) =>
                    current
                      ? { ...current, scheduledStartTime: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            <label>
              {t('operations.schedule')}
              <input
                type="time"
                value={visitForm.scheduledEndTime}
                onChange={(event) =>
                  setVisitForm((current) =>
                    current
                      ? { ...current, scheduledEndTime: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            <label>
              {t('common.name')}
              <input
                value={visitForm.title}
                onChange={(event) =>
                  setVisitForm((current) =>
                    current ? { ...current, title: event.target.value } : current,
                  )
                }
              />
            </label>
            <label className="full-width">
              {t('operations.description')}
              <textarea
                value={visitForm.description}
                onChange={(event) =>
                  setVisitForm((current) =>
                    current
                      ? { ...current, description: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={visitForm.appliesToHourBank}
                onChange={(event) =>
                  setVisitForm((current) =>
                    current
                      ? { ...current, appliesToHourBank: event.target.checked }
                      : current,
                  )
                }
              />
              {t('operations.poolOfHours')}
            </label>
          </div>
          <div className="modal-footer">
            <button
              className="btn-secondary"
              type="button"
              onClick={() => setIsEditOpen(false)}
            >
              {t('common.cancel')}
            </button>
            <button
              className="btn-primary"
              type="button"
              disabled={isSaving}
              onClick={() => void submitEdit()}
            >
              {t('operations.saveVisit')}
            </button>
          </div>
        </div>
      </div>
    ) : null

  const completeModal = isCompleteOpen ? (
    <div
      className="modal-overlay is-stacked"
      role="dialog"
      aria-modal="true"
      onWheel={trapBackgroundScroll}
      onTouchMove={trapBackgroundScroll}
    >
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">{t('operations.completeVisit')}</h3>
          <button
            className="btn-icon"
            type="button"
            onClick={() => setIsCompleteOpen(false)}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>
        <div className="modal-body form-grid">
          <label>
            {t('operations.hours')}
            <input
              type="number"
              min="0.25"
              step="0.25"
              value={completeForm.hours}
              onChange={(event) =>
                setCompleteForm((current) => ({
                  ...current,
                  hours: event.target.value,
                }))
              }
            />
          </label>
          <label className="checkbox-row full-width">
            <input
              type="checkbox"
              checked={completeForm.poolOfHours}
              onChange={(event) =>
                setCompleteForm((current) => ({
                  ...current,
                  poolOfHours: event.target.checked,
                }))
              }
            />
            {t('operations.poolOfHours')}
          </label>
          <label className="checkbox-row full-width">
            <input
              type="checkbox"
              checked={completeForm.specialHours}
              onChange={(event) =>
                setCompleteForm((current) => ({
                  ...current,
                  specialHours: event.target.checked,
                }))
              }
            />
            {t('operations.specialHours')}
          </label>
        </div>
        <div className="modal-footer">
          <button
            className="btn-primary"
            type="button"
            disabled={isSaving}
            onClick={() => void submitComplete()}
          >
            {t('operations.completeVisit')}
          </button>
        </div>
      </div>
    </div>
  ) : null

  const cancelModal = isCancelOpen ? (
    <div
      className="modal-overlay is-stacked"
      role="dialog"
      aria-modal="true"
      onWheel={trapBackgroundScroll}
      onTouchMove={trapBackgroundScroll}
    >
      <div className="modal">
        <div className="modal-header">
          <h3 className="modal-title">{t('operations.cancelVisit')}</h3>
          <button
            className="btn-icon"
            type="button"
            onClick={() => setIsCancelOpen(false)}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p>
            {t('operations.cancelVisitTasksPrompt', { count: tasks.length })}
          </p>
          {tasks.length > 0 ? (
            <div className="cancel-visit-options">
              <label className="cancel-visit-option">
                <input
                  type="radio"
                  name="cancelTaskAction"
                  checked={cancelForm.taskAction === 'release'}
                  onChange={() =>
                    setCancelForm({ taskAction: 'release', cancelConfirmed: false })
                  }
                />
                <span>
                  {t('operations.cancelVisitRelease', {
                    count: tasksToRelease.length,
                  })}
                </span>
              </label>
              <label className="cancel-visit-option">
                <input
                  type="radio"
                  name="cancelTaskAction"
                  checked={cancelForm.taskAction === 'cancel'}
                  onChange={() =>
                    setCancelForm((current) => ({
                      ...current,
                      taskAction: 'cancel',
                    }))
                  }
                />
                <span>
                  {t('operations.cancelVisitMarkCancelled', {
                    count: tasksToRelease.length,
                  })}
                </span>
              </label>
              {cancelForm.taskAction === 'cancel' ? (
                <label className="checkbox-row cancel-visit-delete-confirm">
                  <input
                    type="checkbox"
                    checked={cancelForm.cancelConfirmed}
                    onChange={(event) =>
                      setCancelForm((current) => ({
                        ...current,
                        cancelConfirmed: event.target.checked,
                      }))
                    }
                  />
                  {t('operations.cancelVisitConfirm')}
                </label>
              ) : null}
            </div>
          ) : (
            <p className="subtitle">{t('operations.cancelVisitNoTasks')}</p>
          )}
        </div>
        <div className="modal-footer">
          <button
            className="btn-secondary"
            type="button"
            onClick={() => setIsCancelOpen(false)}
          >
            {t('operations.keepVisit')}
          </button>
          <button
            className="btn-primary"
            type="button"
            disabled={
              isSaving ||
              (tasks.length > 0 &&
                cancelForm.taskAction === 'cancel' &&
                !cancelForm.cancelConfirmed)
            }
            onClick={() => void submitCancel()}
          >
            {t('operations.cancelVisit')}
          </button>
        </div>
      </div>
    </div>
  ) : null

  const tree = (
    <>
      {detail}
      {editModal}
      {completeModal}
      {cancelModal}
    </>
  )

  if (typeof document === 'undefined') {
    return tree
  }
  return createPortal(tree, document.body)
}
