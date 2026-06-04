import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchJson,
  getReferenceList,
  getTasksByVisit,
  getUnassignedPool,
  getVisitById,
  getVisitsByDateRange,
  saveTask,
  saveVisit,
} from './api'
import {
  getTodayMadrid,
  getTomorrowMadrid,
  normalizeDateRange,
} from './dateHelpers'
import type {
  PropertyOption,
  TaskRecord,
  TeamRecord,
  UserRecord,
  VisitRecord,
  VisitStatus,
  VisitTypeRecord,
} from './types'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  getCurrentUserEmail: () => Promise<string>
  propertyOptions: PropertyOption[]
}

const VISIT_COLUMNS: { key: VisitStatus | 'DONE'; label: string; statuses: VisitStatus[] }[] = [
  { key: 'SCHEDULED', label: 'Scheduled', statuses: ['SCHEDULED'] },
  { key: 'OVERDUE', label: 'Overdue', statuses: ['OVERDUE'] },
  {
    key: 'DONE',
    label: 'Completed & Cancelled',
    statuses: ['COMPLETED', 'CANCELLED'],
  },
]

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

const emptyVisitForm = () => ({
  id: '',
  propertyId: '',
  visitTypeId: '',
  teamId: '',
  assignedUserId: '',
  scheduledDate: getTodayMadrid(),
  scheduledStartTime: '09:00',
  scheduledEndTime: '10:00',
  priority: 'MEDIUM',
  title: '',
  description: '',
  estimatedDurationMinutes: '',
  appliesToHourBank: false,
})

const emptyTaskForm = () => ({
  id: '',
  propertyId: '',
  visitId: '',
  teamId: '',
  assignedUserId: '',
  title: '',
  description: '',
  priority: 'MEDIUM',
  dueDate: '',
})

const mapProperty = (item: Record<string, unknown>): PropertyOption => ({
  id: String(item.id ?? ''),
  nickname: String(item.nickname ?? item.Nickname ?? item.title ?? item.id ?? ''),
  title: String(item.title ?? ''),
  listingNickname: String(
    item.ListingNickname ?? item.listingNickname ?? item.nickname ?? '',
  ),
})

const mapTeam = (item: Record<string, unknown>): TeamRecord => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? item.id ?? ''),
  description: typeof item.description === 'string' ? item.description : undefined,
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
  description: typeof item.description === 'string' ? item.description : undefined,
  defaultTeamId:
    typeof item.defaultTeamId === 'string' ? item.defaultTeamId : undefined,
  defaultDurationMinutes:
    typeof item.defaultDurationMinutes === 'number'
      ? item.defaultDurationMinutes
      : undefined,
  appliesToHourBank: Boolean(item.appliesToHourBank),
})

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
  taskCountTotal:
    typeof item.taskCountTotal === 'number'
      ? item.taskCountTotal
      : typeof item.taskCount === 'number'
        ? item.taskCount
        : 0,
  taskCountCompleted:
    typeof item.taskCountCompleted === 'number' ? item.taskCountCompleted : 0,
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
})

export function DailyOperationsView({
  getEndpoint,
  getCurrentUserEmail,
  propertyOptions: propertyOptionsProp,
}: Props) {
  const [opsTab, setOpsTab] = useState<'dashboard' | 'pool'>('dashboard')
  const [filterDateFrom, setFilterDateFrom] = useState(getTodayMadrid())
  const [filterDateTo, setFilterDateTo] = useState(getTodayMadrid())
  const [filterTeamId, setFilterTeamId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPropertyId, setFilterPropertyId] = useState('')
  const [filterUserId, setFilterUserId] = useState('')

  const [visits, setVisits] = useState<VisitRecord[]>([])
  const [poolTasks, setPoolTasks] = useState<TaskRecord[]>([])
  const [visitTasks, setVisitTasks] = useState<TaskRecord[]>([])
  const [teams, setTeams] = useState<TeamRecord[]>([])
  const [users, setUsers] = useState<UserRecord[]>([])
  const [visitTypes, setVisitTypes] = useState<VisitTypeRecord[]>([])
  const [propertyOptions, setPropertyOptions] = useState<PropertyOption[]>(
    propertyOptionsProp,
  )

  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null)
  const [isVisitFormOpen, setIsVisitFormOpen] = useState(false)
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false)
  const [isAssignVisitOpen, setIsAssignVisitOpen] = useState(false)
  const [assignTaskId, setAssignTaskId] = useState('')
  const [assignVisitId, setAssignVisitId] = useState('')
  const [visitForm, setVisitForm] = useState(emptyVisitForm())
  const [taskForm, setTaskForm] = useState(emptyTaskForm())

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const endpoints = useMemo(
    () => ({
      visits: getEndpoint('getVisitsUrl', import.meta.env.VITE_GET_VISITS_URL),
      upsertVisit: getEndpoint(
        'upsertVisitUrl',
        import.meta.env.VITE_UPSERT_VISIT_URL,
      ),
      tasks: getEndpoint('getTasksUrl', import.meta.env.VITE_GET_TASKS_URL),
      upsertTask: getEndpoint(
        'upsertTaskUrl',
        import.meta.env.VITE_UPSERT_TASK_URL,
      ),
      teams: getEndpoint('getTeamsUrl', import.meta.env.VITE_GET_TEAMS_URL),
      users: getEndpoint('getUsersUrl', import.meta.env.VITE_GET_USERS_URL),
      visitTypes: getEndpoint(
        'getVisitTypesUrl',
        import.meta.env.VITE_GET_VISIT_TYPES_URL,
      ),
      properties: getEndpoint(
        'getPropertiesUrl',
        import.meta.env.VITE_GET_PROPERTIES_URL,
      ),
    }),
    [getEndpoint],
  )

  const teamById = useMemo(
    () => new Map(teams.map((team) => [team.id, team.name])),
    [teams],
  )
  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user.name])),
    [users],
  )
  const propertyById = useMemo(
    () =>
      new Map(
        propertyOptions.map((property) => [
          property.id,
          property.listingNickname || property.nickname || property.title,
        ]),
      ),
    [propertyOptions],
  )
  const visitTypeById = useMemo(
    () => new Map(visitTypes.map((type) => [type.id, type.name])),
    [visitTypes],
  )

  const filteredVisits = useMemo(() => {
    return visits.filter((visit) => {
      if (filterTeamId && visit.teamId !== filterTeamId) return false
      if (filterStatus && visit.status !== filterStatus) return false
      if (filterPropertyId && visit.propertyId !== filterPropertyId) return false
      if (filterUserId && visit.assignedUserId !== filterUserId) return false
      return true
    })
  }, [visits, filterTeamId, filterStatus, filterPropertyId, filterUserId])

  const isMultiDayRange = filterDateFrom !== filterDateTo

  const visitsByColumn = useMemo(() => {
    const map = new Map<string, VisitRecord[]>()
    VISIT_COLUMNS.forEach((column) => map.set(column.key, []))
    filteredVisits.forEach((visit) => {
      const column = VISIT_COLUMNS.find((entry) =>
        entry.statuses.includes(visit.status),
      )
      if (column) {
        map.get(column.key)?.push(visit)
      }
    })
    VISIT_COLUMNS.forEach((column) => {
      const rows = map.get(column.key) ?? []
      rows.sort((a, b) => {
        const dateCompare = a.scheduledDate.localeCompare(b.scheduledDate)
        if (dateCompare !== 0) {
          return dateCompare
        }
        return a.scheduledStartTime.localeCompare(b.scheduledStartTime)
      })
    })
    return map
  }, [filteredVisits])

  const selectedVisit = useMemo(
    () => visits.find((visit) => visit.id === selectedVisitId) ?? null,
    [visits, selectedVisitId],
  )

  const teamUsers = useMemo(() => {
    if (!visitForm.teamId) return users
    return users.filter((user) => user.teamId === visitForm.teamId)
  }, [users, visitForm.teamId])

  const loadReferenceData = useCallback(async () => {
    if (!endpoints.teams || !endpoints.users || !endpoints.visitTypes) {
      setError(
        'Missing operations endpoints. Deploy backend and set VITE_GET_TEAMS_URL, VITE_GET_USERS_URL, VITE_GET_VISIT_TYPES_URL.',
      )
      return
    }
    const [teamsPayload, usersPayload, typesPayload] = await Promise.all([
      getReferenceList(endpoints.teams),
      getReferenceList(endpoints.users),
      getReferenceList(endpoints.visitTypes),
    ])
    setTeams((teamsPayload.items ?? []).map(mapTeam))
    setUsers((usersPayload.items ?? []).map(mapUser))
    setVisitTypes((typesPayload.items ?? []).map(mapVisitType))

    if (propertyOptionsProp.length === 0 && endpoints.properties) {
      const propertiesPayload = await fetchJson<{ items?: Record<string, unknown>[] }>(
        endpoints.properties,
      )
      const mapped = (propertiesPayload.items ?? [])
        .map(mapProperty)
        .filter((row) => row.id)
        .filter((row) => {
          const source = propertiesPayload.items?.find(
            (item) => String(item.id) === row.id,
          )
          return source?.active !== false
        })
      setPropertyOptions(mapped)
    }
  }, [endpoints, propertyOptionsProp.length])

  const loadVisits = useCallback(async () => {
    if (!endpoints.visits) {
      setError('Missing get visits endpoint (VITE_GET_VISITS_URL).')
      return
    }
    const { from, to } = normalizeDateRange(filterDateFrom, filterDateTo)
    setIsLoading(true)
    setError(null)
    try {
      const payload = await getVisitsByDateRange(endpoints.visits, from, to)
      setVisits((payload.items ?? []).map((entry) => mapVisit(entry)))
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Unable to load visits.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [endpoints.visits, filterDateFrom, filterDateTo])

  const applyTodayRange = () => {
    const today = getTodayMadrid()
    setFilterDateFrom(today)
    setFilterDateTo(today)
  }

  const applyTomorrowRange = () => {
    const tomorrow = getTomorrowMadrid()
    setFilterDateFrom(tomorrow)
    setFilterDateTo(tomorrow)
  }

  const loadPool = useCallback(async () => {
    if (!endpoints.tasks) return
    try {
      const payload = await getUnassignedPool(endpoints.tasks)
      setPoolTasks((payload.items ?? []).map((entry) => mapTask(entry)))
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : 'Unable to load tasks.',
      )
    }
  }, [endpoints.tasks])

  const loadVisitTasks = useCallback(
    async (visitId: string) => {
      if (!endpoints.tasks) return
      const payload = await getTasksByVisit(endpoints.tasks, visitId)
      setVisitTasks((payload.items ?? []).map((entry) => mapTask(entry)))
    },
    [endpoints.tasks],
  )

  useEffect(() => {
    void loadReferenceData()
  }, [loadReferenceData])

  useEffect(() => {
    setPropertyOptions(propertyOptionsProp)
  }, [propertyOptionsProp])

  useEffect(() => {
    if (opsTab === 'dashboard') {
      void loadVisits()
    } else {
      void loadPool()
    }
  }, [opsTab, loadVisits, loadPool])

  useEffect(() => {
    if (selectedVisitId) {
      void loadVisitTasks(selectedVisitId)
    } else {
      setVisitTasks([])
    }
  }, [selectedVisitId, loadVisitTasks])

  const openCreateVisit = () => {
    setVisitForm(emptyVisitForm())
    setIsVisitFormOpen(true)
  }

  const openEditVisit = (visit: VisitRecord) => {
    setVisitForm({
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
    setIsVisitFormOpen(true)
  }

  const handleVisitTypeChange = (visitTypeId: string) => {
    const visitType = visitTypes.find((entry) => entry.id === visitTypeId)
    const property = propertyOptions.find(
      (entry) => entry.id === visitForm.propertyId,
    )
    setVisitForm((current) => ({
      ...current,
      visitTypeId,
      teamId: visitType?.defaultTeamId ?? current.teamId,
      estimatedDurationMinutes: visitType?.defaultDurationMinutes
        ? String(visitType.defaultDurationMinutes)
        : current.estimatedDurationMinutes,
      appliesToHourBank: visitType?.appliesToHourBank ?? current.appliesToHourBank,
      title:
        current.title.trim() ||
        `${visitType?.name ?? 'Visit'} - ${
          property?.listingNickname || property?.nickname || 'Property'
        }`,
    }))
  }

  const submitVisit = async () => {
    if (!endpoints.upsertVisit) return
    const property = propertyOptions.find(
      (entry) => entry.id === visitForm.propertyId,
    )
    const visitType = visitTypes.find((entry) => entry.id === visitForm.visitTypeId)
    const title =
      visitForm.title.trim() ||
      `${visitType?.name ?? 'Visit'} - ${
        property?.listingNickname || property?.nickname || 'Property'
      }`

    const payload: Record<string, unknown> = {
      id: visitForm.id || undefined,
      propertyId: visitForm.propertyId,
      visitTypeId: visitForm.visitTypeId,
      teamId: visitForm.teamId,
      assignedUserId: visitForm.assignedUserId,
      scheduledDate: visitForm.scheduledDate,
      scheduledStartTime: visitForm.scheduledStartTime,
      scheduledEndTime: visitForm.scheduledEndTime,
      priority: visitForm.priority,
      title,
      description: visitForm.description,
      appliesToHourBank: visitForm.appliesToHourBank,
    }
    if (visitForm.estimatedDurationMinutes) {
      payload.estimatedDurationMinutes = Number(visitForm.estimatedDurationMinutes)
    }

    try {
      await saveVisit(endpoints.upsertVisit, payload)
      setIsVisitFormOpen(false)
      setMessage('Visit saved.')
      await loadVisits()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save visit.')
    }
  }

  const updateVisitStatus = async (
    visit: VisitRecord,
    status: VisitRecord['status'],
    extra?: Record<string, unknown>,
  ) => {
    if (!endpoints.upsertVisit) return
    const closedBy = await getCurrentUserEmail()
    try {
      await saveVisit(endpoints.upsertVisit, {
        id: visit.id,
        status,
        closedBy,
        ...extra,
      })
      setMessage(`Visit marked as ${status}.`)
      await loadVisits()
      if (selectedVisitId === visit.id && endpoints.visits) {
        const refreshed = await getVisitById(endpoints.visits, visit.id)
        if (refreshed.item) {
          const mapped = mapVisit(refreshed.item as Record<string, unknown>)
          setVisits((current) =>
            current.map((entry) => (entry.id === mapped.id ? mapped : entry)),
          )
        }
        await loadVisitTasks(visit.id)
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'Unable to update visit.',
      )
    }
  }

  const submitTask = async () => {
    if (!endpoints.upsertTask) return
    const payload: Record<string, unknown> = {
      id: taskForm.id || undefined,
      propertyId: taskForm.propertyId,
      teamId: taskForm.teamId,
      assignedUserId: taskForm.assignedUserId || undefined,
      title: taskForm.title,
      description: taskForm.description,
      priority: taskForm.priority,
      dueDate: taskForm.dueDate || undefined,
      visitId: taskForm.visitId || undefined,
    }
    try {
      await saveTask(endpoints.upsertTask, payload)
      setIsTaskFormOpen(false)
      setMessage('Task saved.')
      await loadPool()
      if (taskForm.visitId || selectedVisitId) {
        await loadVisitTasks(taskForm.visitId || selectedVisitId || '')
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save task.')
    }
  }

  const completeTask = async (task: TaskRecord) => {
    if (!endpoints.upsertTask) return
    const closedBy = await getCurrentUserEmail()
    await saveTask(endpoints.upsertTask, {
      id: task.id,
      status: 'COMPLETED',
      closedBy,
    })
    setMessage('Task completed.')
    await loadPool()
    if (selectedVisitId) await loadVisitTasks(selectedVisitId)
  }

  const dismissTask = async (task: TaskRecord) => {
    if (!endpoints.upsertTask) return
    await saveTask(endpoints.upsertTask, { id: task.id, action: 'dismiss' })
    setMessage('Task dismissed.')
    await loadPool()
    if (selectedVisitId) await loadVisitTasks(selectedVisitId)
  }

  const assignTaskToVisit = async () => {
    if (!endpoints.upsertTask || !assignTaskId || !assignVisitId) return
    await saveTask(endpoints.upsertTask, {
      id: assignTaskId,
      action: 'assign',
      assignVisitId,
    })
    setIsAssignVisitOpen(false)
    setMessage('Task assigned to visit.')
    await loadPool()
    if (selectedVisitId) await loadVisitTasks(selectedVisitId)
    await loadVisits()
  }

  const [assignVisitOptions, setAssignVisitOptions] = useState<VisitRecord[]>([])

  useEffect(() => {
    if (!isAssignVisitOpen || !assignTaskId || !endpoints.visits) {
      return
    }
    const task = poolTasks.find((entry) => entry.id === assignTaskId)
    if (!task?.propertyId) {
      return
    }
    void fetchJson<{ items?: Record<string, unknown>[] }>(
      `${endpoints.visits}?propertyId=${encodeURIComponent(task.propertyId)}`,
    )
      .then((payload) => {
        const options = (payload.items ?? [])
          .map((entry) => mapVisit(entry))
          .filter(
            (visit) =>
              visit.teamId === task.teamId &&
              visit.status !== 'COMPLETED' &&
              visit.status !== 'CANCELLED',
          )
        setAssignVisitOptions(options)
      })
      .catch(() => setAssignVisitOptions([]))
  }, [isAssignVisitOpen, assignTaskId, endpoints.visits, poolTasks])

  return (
    <>
      <section className="card">
        <div className="page-header">
          <div>
            <h1 className="page-title">Daily Operations Dashboard</h1>
            <p className="subtitle">
              Schedule visits, track overdue work, and manage tasks.
            </p>
          </div>
          <div className="header-actions">
            <button className="btn-secondary" type="button" onClick={openCreateVisit}>
              Create visit
            </button>
            <button
              className="btn-primary"
              type="button"
              onClick={() => {
                setOpsTab('dashboard')
                void loadVisits()
              }}
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="operations-tabs">
          <button
            type="button"
            className={opsTab === 'dashboard' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setOpsTab('dashboard')}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={opsTab === 'pool' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setOpsTab('pool')}
          >
            Tasks not on a visit
          </button>
        </div>

        {message ? <p className="notice success">{message}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}
      </section>

      {opsTab === 'dashboard' ? (
        <>
          <section className="card filters-card">
            <div className="operations-date-presets">
              <button
                type="button"
                className={
                  filterDateFrom === getTodayMadrid() &&
                  filterDateTo === getTodayMadrid()
                    ? 'btn-primary'
                    : 'btn-secondary'
                }
                onClick={applyTodayRange}
              >
                Today
              </button>
              <button
                type="button"
                className={
                  filterDateFrom === getTomorrowMadrid() &&
                  filterDateTo === getTomorrowMadrid()
                    ? 'btn-primary'
                    : 'btn-secondary'
                }
                onClick={applyTomorrowRange}
              >
                Tomorrow
              </button>
            </div>
            <div className="filters-grid">
              <label>
                From
                <input
                  type="date"
                  value={filterDateFrom}
                  max={filterDateTo}
                  onChange={(event) => setFilterDateFrom(event.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={filterDateTo}
                  min={filterDateFrom}
                  onChange={(event) => setFilterDateTo(event.target.value)}
                />
              </label>
              <label>
                Team
                <select
                  value={filterTeamId}
                  onChange={(event) => setFilterTeamId(event.target.value)}
                >
                  <option value="">All teams</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={filterStatus}
                  onChange={(event) => setFilterStatus(event.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="OVERDUE">Overdue</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </label>
              <label>
                Property
                <select
                  value={filterPropertyId}
                  onChange={(event) => setFilterPropertyId(event.target.value)}
                >
                  <option value="">All properties</option>
                  {propertyOptions.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.listingNickname || property.nickname}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assigned user
                <select
                  value={filterUserId}
                  onChange={(event) => setFilterUserId(event.target.value)}
                >
                  <option value="">All users</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {isLoading ? <p className="subtitle">Loading visits…</p> : null}

          <section className="operations-kanban">
            {VISIT_COLUMNS.map((column) => (
              <div className="operations-column" key={column.key}>
                <h3>{column.label}</h3>
                <div className="operations-column-body">
                  {(visitsByColumn.get(column.key) ?? []).map((visit) => (
                    <button
                      key={visit.id}
                      type="button"
                      className="operations-visit-card"
                      onClick={() => setSelectedVisitId(visit.id)}
                    >
                      <p className="operations-card-time">
                        {isMultiDayRange ? (
                          <span className="operations-card-date">
                            {visit.scheduledDate} ·{' '}
                          </span>
                        ) : null}
                        {visit.scheduledStartTime || '—'}
                        {visit.scheduledEndTime
                          ? ` – ${visit.scheduledEndTime}`
                          : ''}
                      </p>
                      <p className="operations-card-title">{visit.title}</p>
                      <p className="operations-card-meta">
                        {propertyById.get(visit.propertyId) ?? visit.propertyId}
                      </p>
                      <p className="operations-card-meta">
                        {visitTypeById.get(visit.visitTypeId) ?? visit.visitTypeId}
                      </p>
                      <p className="operations-card-meta">
                        {teamById.get(visit.teamId) ?? visit.teamId} ·{' '}
                        {userById.get(visit.assignedUserId) ||
                          visit.assignedUserId ||
                          'Unassigned'}
                      </p>
                      <p className="operations-card-tags">
                        <span className="tag">{visit.priority}</span>
                        <span className="tag">{visit.status}</span>
                        {(() => {
                          const taskTotal = visit.taskCountTotal ?? 0
                          const taskCompleted = visit.taskCountCompleted ?? 0
                          const allComplete =
                            taskTotal > 0 && taskCompleted === taskTotal
                          return (
                            <span
                              className={`tag tag-task-progress${
                                allComplete ? ' is-complete' : ''
                              }`}
                              title="Tasks completed"
                            >
                              <span className="tag-task-progress-icon" aria-hidden>
                                ✓
                              </span>
                              {taskTotal > 0
                                ? `${taskCompleted}/${taskTotal}`
                                : '0 tasks'}
                            </span>
                          )
                        })()}
                        {visit.appliesToHourBank ? (
                          <span className="tag">Hour bank</span>
                        ) : null}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </>
      ) : (
        <section className="card">
          <div className="page-header">
            <h2 className="section-title">Tasks not on a visit</h2>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => {
                setTaskForm({ ...emptyTaskForm(), propertyId: '', visitId: '' })
                setIsTaskFormOpen(true)
              }}
            >
              Create task
            </button>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Property</th>
                  <th>Team</th>
                  <th>Priority</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {poolTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No unassigned or dismissed tasks.</td>
                  </tr>
                ) : (
                  poolTasks.map((task) => (
                    <tr key={task.id}>
                      <td>{task.title}</td>
                      <td>{task.status}</td>
                      <td>{propertyById.get(task.propertyId) ?? task.propertyId}</td>
                      <td>{teamById.get(task.teamId) ?? task.teamId}</td>
                      <td>{task.priority}</td>
                      <td className="table-actions">
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => {
                            setAssignTaskId(task.id)
                            setAssignVisitId('')
                            setIsAssignVisitOpen(true)
                          }}
                        >
                          Assign
                        </button>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => {
                            setTaskForm({
                              ...emptyTaskForm(),
                              id: task.id,
                              propertyId: task.propertyId,
                              teamId: task.teamId,
                              assignedUserId: task.assignedUserId ?? '',
                              title: task.title,
                              description: task.description,
                              priority: task.priority,
                              dueDate: task.dueDate ?? '',
                            })
                            setIsTaskFormOpen(true)
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => void completeTask(task)}
                        >
                          Complete
                        </button>
                        {task.status !== 'DISMISS' ? (
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => void dismissTask(task)}
                          >
                            Dismiss
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selectedVisit && opsTab === 'dashboard' ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal operations-detail-modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{selectedVisit.title}</h3>
                <p className="modal-subtitle">{selectedVisit.id}</p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setSelectedVisitId(null)}
                aria-label="Close visit detail"
              >
                ✕
              </button>
            </div>
            <div className="modal-body operations-detail-body">
              <p>
                <strong>Property:</strong>{' '}
                {propertyById.get(selectedVisit.propertyId) ?? selectedVisit.propertyId}
              </p>
              <p>
                <strong>Visit type:</strong>{' '}
                {visitTypeById.get(selectedVisit.visitTypeId) ??
                  selectedVisit.visitTypeId}
              </p>
              <p>
                <strong>Schedule:</strong> {selectedVisit.scheduledDate}{' '}
                {selectedVisit.scheduledStartTime} – {selectedVisit.scheduledEndTime}
              </p>
              <p>
                <strong>Team:</strong>{' '}
                {teamById.get(selectedVisit.teamId) ?? selectedVisit.teamId}
              </p>
              <p>
                <strong>Assigned:</strong>{' '}
                {userById.get(selectedVisit.assignedUserId) ||
                  selectedVisit.assignedUserId ||
                  '—'}
              </p>
              <p>
                <strong>Status:</strong> {selectedVisit.status} ·{' '}
                <strong>Priority:</strong> {selectedVisit.priority}
              </p>
              {selectedVisit.description ? (
                <p>
                  <strong>Description:</strong> {selectedVisit.description}
                </p>
              ) : null}

              <div className="operations-detail-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => openEditVisit(selectedVisit)}
                >
                  Edit visit
                </button>
                {selectedVisit.status !== 'COMPLETED' &&
                selectedVisit.status !== 'CANCELLED' ? (
                  <>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => {
                        const hours = window.prompt(
                          'Actual duration (hours)',
                          '1',
                        )
                        if (hours === null) return
                        void updateVisitStatus(selectedVisit, 'COMPLETED', {
                          actualDurationHours: Number(hours),
                        })
                      }}
                    >
                      Complete visit
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        void updateVisitStatus(selectedVisit, 'CANCELLED')
                      }
                    >
                      Cancel visit
                    </button>
                  </>
                ) : null}
              </div>

              <h4 className="section-title">Tasks</h4>
              <div className="header-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setTaskForm({
                      ...emptyTaskForm(),
                      visitId: selectedVisit.id,
                      propertyId: selectedVisit.propertyId,
                      teamId: selectedVisit.teamId,
                      assignedUserId: selectedVisit.assignedUserId,
                    })
                    setIsTaskFormOpen(true)
                  }}
                >
                  Create task
                </button>
              </div>
              <ul className="operations-task-list">
                {visitTasks.map((task) => (
                  <li key={task.id}>
                    <span>
                      {task.title} · {task.status} · {task.priority}
                      {selectedVisit.status === 'OVERDUE' &&
                      (task.status === 'PENDING' || task.status === 'BLOCKED') ? (
                        <span className="tag warning">Overdue visit</span>
                      ) : null}
                    </span>
                    <span className="table-actions">
                      {task.status !== 'COMPLETED' ? (
                        <>
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => void completeTask(task)}
                          >
                            Complete
                          </button>
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() =>
                              void saveTask(endpoints.upsertTask!, {
                                id: task.id,
                                status: 'BLOCKED',
                              }).then(() => loadVisitTasks(selectedVisit.id))
                            }
                          >
                            Block
                          </button>
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => void dismissTask(task)}
                          >
                            Dismiss
                          </button>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {isVisitFormOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">
                {visitForm.id ? 'Edit visit' : 'Create visit'}
              </h3>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsVisitFormOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body form-grid">
              <label>
                Property
                <select
                  value={visitForm.propertyId}
                  onChange={(event) =>
                    setVisitForm((c) => ({ ...c, propertyId: event.target.value }))
                  }
                >
                  <option value="">Select property</option>
                  {propertyOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.listingNickname || p.nickname}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Visit type
                <select
                  value={visitForm.visitTypeId}
                  onChange={(event) => handleVisitTypeChange(event.target.value)}
                >
                  <option value="">Select type</option>
                  {visitTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Team
                <select
                  value={visitForm.teamId}
                  onChange={(event) =>
                    setVisitForm((c) => ({
                      ...c,
                      teamId: event.target.value,
                      assignedUserId: '',
                    }))
                  }
                >
                  <option value="">Select team</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assigned user
                <select
                  value={visitForm.assignedUserId}
                  onChange={(event) =>
                    setVisitForm((c) => ({
                      ...c,
                      assignedUserId: event.target.value,
                    }))
                  }
                >
                  <option value="">Unassigned</option>
                  {teamUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input
                  type="date"
                  required
                  value={visitForm.scheduledDate}
                  onChange={(event) =>
                    setVisitForm((c) => ({
                      ...c,
                      scheduledDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Start
                <input
                  type="time"
                  value={visitForm.scheduledStartTime}
                  onChange={(event) =>
                    setVisitForm((c) => ({
                      ...c,
                      scheduledStartTime: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                End
                <input
                  type="time"
                  value={visitForm.scheduledEndTime}
                  onChange={(event) =>
                    setVisitForm((c) => ({
                      ...c,
                      scheduledEndTime: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Priority
                <select
                  value={visitForm.priority}
                  onChange={(event) =>
                    setVisitForm((c) => ({ ...c, priority: event.target.value }))
                  }
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Title
                <input
                  value={visitForm.title}
                  onChange={(event) =>
                    setVisitForm((c) => ({ ...c, title: event.target.value }))
                  }
                />
              </label>
              <label className="full-width">
                Description
                <textarea
                  value={visitForm.description}
                  onChange={(event) =>
                    setVisitForm((c) => ({ ...c, description: event.target.value }))
                  }
                />
              </label>
              <label>
                Est. duration (min)
                <input
                  type="number"
                  value={visitForm.estimatedDurationMinutes}
                  onChange={(event) =>
                    setVisitForm((c) => ({
                      ...c,
                      estimatedDurationMinutes: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={visitForm.appliesToHourBank}
                  onChange={(event) =>
                    setVisitForm((c) => ({
                      ...c,
                      appliesToHourBank: event.target.checked,
                    }))
                  }
                />
                Applies to hour bank
              </label>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void submitVisit()}
              >
                Save visit
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isTaskFormOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">{taskForm.id ? 'Edit task' : 'Create task'}</h3>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsTaskFormOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body form-grid">
              {!taskForm.visitId ? (
                <>
                  <label>
                    Property
                    <select
                      value={taskForm.propertyId}
                      onChange={(event) =>
                        setTaskForm((c) => ({
                          ...c,
                          propertyId: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select property</option>
                      {propertyOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.listingNickname || p.nickname}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Team
                    <select
                      value={taskForm.teamId}
                      onChange={(event) =>
                        setTaskForm((c) => ({ ...c, teamId: event.target.value }))
                      }
                    >
                      <option value="">Select team</option>
                      {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
              <label className="full-width">
                Title
                <input
                  value={taskForm.title}
                  onChange={(event) =>
                    setTaskForm((c) => ({ ...c, title: event.target.value }))
                  }
                />
              </label>
              <label className="full-width">
                Description
                <textarea
                  value={taskForm.description}
                  onChange={(event) =>
                    setTaskForm((c) => ({ ...c, description: event.target.value }))
                  }
                />
              </label>
              <label>
                Priority
                <select
                  value={taskForm.priority}
                  onChange={(event) =>
                    setTaskForm((c) => ({ ...c, priority: event.target.value }))
                  }
                >
                  {PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Due date
                <input
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(event) =>
                    setTaskForm((c) => ({ ...c, dueDate: event.target.value }))
                  }
                />
              </label>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void submitTask()}
              >
                Save task
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAssignVisitOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Assign task to visit</h3>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsAssignVisitOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <label>
                Visit
                <select
                  value={assignVisitId}
                  onChange={(event) => setAssignVisitId(event.target.value)}
                >
                  <option value="">Select visit</option>
                  {assignVisitOptions.map((visit) => (
                    <option key={visit.id} value={visit.id}>
                      {visit.scheduledDate} {visit.scheduledStartTime} – {visit.title}
                    </option>
                  ))}
                </select>
              </label>
              <p className="modal-subtitle">
                Only visits with matching property and team are listed. Load visits
                from the dashboard date or create visits first.
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void assignTaskToVisit()}
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
