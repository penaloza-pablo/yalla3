import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getReferenceList,
  getTasksByVisit,
  getVisitById,
} from './api'
import { getPropertyLabel } from './propertyHelpers'
import type {
  PropertyOption,
  TaskRecord,
  VisitRecord,
  VisitTypeRecord,
} from './types'

type Props = {
  visitId: string
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
  onClose: () => void
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

const mapNamed = (item: Record<string, unknown>) => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? item.email ?? item.id ?? ''),
})

const mapVisitType = (item: Record<string, unknown>): VisitTypeRecord => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? item.id ?? ''),
})

export function VisitDetailModal({
  visitId,
  getEndpoint,
  propertyOptions,
  onClose,
}: Props) {
  const { t } = useTranslation()
  const [visit, setVisit] = useState<VisitRecord | null>(null)
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [teamById, setTeamById] = useState<Map<string, string>>(new Map())
  const [userById, setUserById] = useState<Map<string, string>>(new Map())
  const [visitTypeById, setVisitTypeById] = useState<Map<string, string>>(
    new Map(),
  )
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const endpoints = useMemo(
    () => ({
      visits: getEndpoint('getVisitsUrl', import.meta.env.VITE_GET_VISITS_URL),
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
        setTeamById(
          new Map(
            (teamsPayload.items ?? []).map((entry) => {
              const named = mapNamed(entry)
              return [named.id, named.name]
            }),
          ),
        )
        setUserById(
          new Map(
            (usersPayload.items ?? []).map((entry) => {
              const named = mapNamed(entry)
              return [named.id, named.name]
            }),
          ),
        )
        setVisitTypeById(
          new Map(
            (typesPayload.items ?? []).map((entry) => {
              const type = mapVisitType(entry)
              return [type.id, type.name]
            }),
          ),
        )
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

  return (
    <div
      className="modal-overlay is-stacked"
      role="dialog"
      aria-modal="true"
      aria-labelledby="visit-detail-title"
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
                  <strong>{t('operations.description')}:</strong>{' '}
                  {visit.description}
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
      </div>
    </div>
  )
}
