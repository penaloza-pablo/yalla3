import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchJson,
  getReferenceList,
  getTasksByVisit,
  getUnassignedPool,
  getVisitById,
  getVisitTemplates,
  getVisitsByDateRange,
  saveTask,
  saveVisit,
} from './api'
import { OperationsAgendaView } from './OperationsAgendaView'
import { OperationsDayView } from './OperationsDayView'
import { OperationsKanbanView } from './OperationsKanbanView'
import { buildMtlDisplayRows } from './mtlPropertyHelpers'
import {
  AGENDA_DAY_COUNT,
  formatAgendaDayLabel,
  getAgendaDateRange,
  isTerminalVisit,
} from './operationsViewHelpers'
import { getPropertyLabel, sortPropertyOptions } from './propertyHelpers'
import { sortVisitTypes } from './visitTypeHelpers'
import { VisitTemplatesPanel } from './VisitTemplatesPanel'
import {
  mapVisitTemplate,
  templateTasksToDrafts,
} from './visitTemplateHelpers'
import {
  addDaysToDateString,
  formatTaskCreatedDate,
  getTodayMadrid,
  getTomorrowMadrid,
  normalizeDateRange,
} from './dateHelpers'
import type {
  PropertyOption,
  TaskRecord,
  TeamRecord,
  UserRecord,
  VisitDraftTask,
  VisitRecord,
  VisitStatus,
  VisitTemplateRecord,
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

const mapProperty = (item: Record<string, unknown>): PropertyOption => {
  const mtlPrincipalId = String(
    item.MTL_PRINCIPALID ??
      item.mtlPrincipalId ??
      item.MTL_PRINCIPAL_ID ??
      '',
  ).trim()

  return {
    id: String(item.id ?? ''),
    nickname: String(item.nickname ?? item.Nickname ?? item.title ?? item.id ?? ''),
    title: String(item.title ?? ''),
    listingNickname: String(
      item.ListingNickname ?? item.listingNickname ?? item.nickname ?? '',
    ),
    type: String(item.type ?? item.Type ?? '').trim() || undefined,
    mtlPrincipalId: mtlPrincipalId || undefined,
  }
}

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
  specialHours: Boolean(item.specialHours),
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
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
})

export function DailyOperationsView({
  getEndpoint,
  getCurrentUserEmail,
  propertyOptions: propertyOptionsProp,
}: Props) {
  const [opsTab, setOpsTab] = useState<'dashboard' | 'pool' | 'templates'>(
    'dashboard',
  )
  const [dashboardViewMode, setDashboardViewMode] = useState<
    'kanban' | 'agenda' | 'day'
  >('kanban')
  const [dayViewDate, setDayViewDate] = useState(getTodayMadrid())
  const [agendaAnchorDate, setAgendaAnchorDate] = useState(getTodayMadrid())
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
  const [propertyTemplates, setPropertyTemplates] = useState<VisitTemplateRecord[]>(
    [],
  )
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [draftVisitTasks, setDraftVisitTasks] = useState<VisitDraftTask[]>([])

  const [isCompleteVisitOpen, setIsCompleteVisitOpen] = useState(false)
  const [completeVisitForm, setCompleteVisitForm] = useState({
    hours: '1',
    poolOfHours: false,
    specialHours: false,
  })
  const [dismissingTaskId, setDismissingTaskId] = useState<string | null>(null)
  const [isCancelVisitOpen, setIsCancelVisitOpen] = useState(false)
  const [cancelVisitForm, setCancelVisitForm] = useState({
    taskAction: 'release' as 'release' | 'cancel',
    cancelConfirmed: false,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [syncingVisitIds, setSyncingVisitIds] = useState<Set<string>>(new Set())
  const [isSavingVisitWithTasks, setIsSavingVisitWithTasks] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const isCreatingVisit = !visitForm.id
  const isCreatingTask = !taskForm.id

  const visitHasOpenTasks = useMemo(
    () =>
      visitTasks.some(
        (task) =>
          task.status !== 'COMPLETED' &&
          task.status !== 'DISMISS' &&
          task.status !== 'CANCELLED',
      ),
    [visitTasks],
  )

  const visitTasksToRelease = useMemo(
    () =>
      visitTasks.filter(
        (task) => task.status === 'PENDING' || task.status === 'BLOCKED',
      ),
    [visitTasks],
  )

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
      visitTemplates: getEndpoint(
        'getVisitTemplatesUrl',
        import.meta.env.VITE_GET_VISIT_TEMPLATES_URL,
      ),
      upsertVisitTemplate: getEndpoint(
        'upsertVisitTemplateUrl',
        import.meta.env.VITE_UPSERT_VISIT_TEMPLATE_URL,
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
  const sortedPropertyOptions = useMemo(
    () => sortPropertyOptions(propertyOptions),
    [propertyOptions],
  )

  const mtlDisplayRows = useMemo(
    () => buildMtlDisplayRows(propertyOptions),
    [propertyOptions],
  )

  const visitQueryRange = useMemo(() => {
    if (dashboardViewMode === 'agenda') {
      return getAgendaDateRange(agendaAnchorDate)
    }
    if (dashboardViewMode === 'day') {
      return { from: dayViewDate, to: dayViewDate, dates: [dayViewDate] }
    }
    const normalized = normalizeDateRange(filterDateFrom, filterDateTo)
    return {
      from: normalized.from,
      to: normalized.to,
      dates: normalized.dates,
    }
  }, [dashboardViewMode, dayViewDate, agendaAnchorDate, filterDateFrom, filterDateTo])

  const propertyById = useMemo(
    () =>
      new Map(
        propertyOptions.map((property) => [property.id, getPropertyLabel(property)]),
      ),
    [propertyOptions],
  )
  const sortedVisitTypes = useMemo(() => sortVisitTypes(visitTypes), [visitTypes])

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
    const { from, to } = visitQueryRange
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
  }, [endpoints.visits, visitQueryRange])

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
  }, [opsTab, loadVisits, loadPool, dashboardViewMode, dayViewDate])

  useEffect(() => {
    if (selectedVisitId) {
      void loadVisitTasks(selectedVisitId)
    } else {
      setVisitTasks([])
    }
  }, [selectedVisitId, loadVisitTasks])

  const openCreateVisit = () => {
    setVisitForm(emptyVisitForm())
    setSelectedTemplateId('')
    setDraftVisitTasks([])
    setPropertyTemplates([])
    setIsVisitFormOpen(true)
  }

  const openCreateVisitAtCell = (propertyId: string, scheduledDate: string) => {
    setVisitForm({
      ...emptyVisitForm(),
      propertyId,
      scheduledDate,
    })
    setSelectedTemplateId('')
    setDraftVisitTasks([])
    setPropertyTemplates([])
    setIsVisitFormOpen(true)
  }

  const goToDayView = (date: string) => {
    setDayViewDate(date)
    setDashboardViewMode('day')
  }

  const shiftAgendaDates = (deltaDays: number) => {
    setAgendaAnchorDate((current) => addDaysToDateString(current, deltaDays))
  }

  const applyVisitTemplate = (template: VisitTemplateRecord) => {
    setVisitForm((current) => ({
      ...current,
      propertyId: template.propertyId,
      visitTypeId: template.visitTypeId,
      teamId: template.teamId,
      assignedUserId: template.assignedUserId,
      scheduledStartTime: template.scheduledStartTime,
      scheduledEndTime: template.scheduledEndTime,
      title: template.title,
      description: template.description,
      estimatedDurationMinutes: template.estimatedDurationMinutes
        ? String(template.estimatedDurationMinutes)
        : '',
      priority: 'MEDIUM',
    }))
    setDraftVisitTasks(templateTasksToDrafts(template))
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
      priority: visitForm.priority || 'MEDIUM',
      title,
      description: visitForm.description,
      appliesToHourBank: isCreatingVisit
        ? (visitType?.appliesToHourBank ?? false)
        : visitForm.appliesToHourBank,
    }
    if (visitForm.estimatedDurationMinutes) {
      payload.estimatedDurationMinutes = Number(visitForm.estimatedDurationMinutes)
    }

    const pendingDraftTasks = [...draftVisitTasks]
    const tasksToCreate = pendingDraftTasks
      .filter((draft) => draft.title.trim())
      .map((draft) => ({
        title: draft.title.trim(),
        description: draft.description,
        priority: draft.urgent ? 'URGENT' : 'MEDIUM',
      }))

    if (isCreatingVisit && tasksToCreate.length > 0) {
      payload.tasks = tasksToCreate
    }

    const hasBulkTasks = isCreatingVisit && tasksToCreate.length > 0

    try {
      if (hasBulkTasks) {
        setIsSavingVisitWithTasks(true)
      }
      const response = await saveVisit(endpoints.upsertVisit, payload)
      const savedItem = response.item as Record<string, unknown> | undefined
      const mapped = savedItem ? mapVisit(savedItem) : null
      const createdTasks = Array.isArray(
        (response as { createdTasks?: unknown[] }).createdTasks,
      )
        ? (response as { createdTasks: unknown[] }).createdTasks.length
        : 0

      if (mapped && isCreatingVisit) {
        setVisits((current) => {
          const withoutDuplicate = current.filter((visit) => visit.id !== mapped.id)
          return [...withoutDuplicate, mapped]
        })
      }

      setIsVisitFormOpen(false)
      setSelectedTemplateId('')
      setDraftVisitTasks([])
      setMessage(
        hasBulkTasks
          ? `Visit saved with ${createdTasks || tasksToCreate.length} tasks.`
          : 'Visit saved.',
      )
      if (!mapped || !isCreatingVisit) {
        await loadVisits()
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save visit.')
    } finally {
      setIsSavingVisitWithTasks(false)
    }
  }

  const markVisitSyncing = (visitId: string, syncing: boolean) => {
    setSyncingVisitIds((current) => {
      const next = new Set(current)
      if (syncing) {
        next.add(visitId)
      } else {
        next.delete(visitId)
      }
      return next
    })
  }

  const handleVisitReschedule = async (visitId: string, newDate: string) => {
    if (!endpoints.upsertVisit) {
      return
    }
    const visit = visits.find((entry) => entry.id === visitId)
    if (!visit || visit.scheduledDate === newDate || isTerminalVisit(visit)) {
      return
    }

    const previous = { ...visit }
    setVisits((current) =>
      current.map((entry) =>
        entry.id === visitId ? { ...entry, scheduledDate: newDate } : entry,
      ),
    )
    markVisitSyncing(visitId, true)
    setError(null)

    try {
      const response = await saveVisit(endpoints.upsertVisit, {
        id: visitId,
        scheduledDate: newDate,
        syncTaskDueDates: true,
      })
      const savedItem = response.item as Record<string, unknown> | undefined
      const mapped = savedItem ? mapVisit(savedItem) : null
      if (mapped) {
        setVisits((current) =>
          current.map((entry) => (entry.id === visitId ? mapped : entry)),
        )
      }
      const tasksUpdated =
        typeof (response as { tasksUpdated?: number }).tasksUpdated === 'number'
          ? (response as { tasksUpdated: number }).tasksUpdated
          : 0
      if (tasksUpdated > 0) {
        setMessage(`Visit rescheduled. ${tasksUpdated} task due dates updated.`)
      }
    } catch (rescheduleError) {
      setVisits((current) =>
        current.map((entry) => (entry.id === visitId ? previous : entry)),
      )
      setError(
        rescheduleError instanceof Error
          ? rescheduleError.message
          : 'Unable to reschedule visit.',
      )
    } finally {
      markVisitSyncing(visitId, false)
    }
  }

  const handleVisitTimeChange = async (
    visitId: string,
    scheduledStartTime: string,
    scheduledEndTime: string,
  ) => {
    if (!endpoints.upsertVisit) {
      return
    }
    const visit = visits.find((entry) => entry.id === visitId)
    if (
      !visit ||
      (visit.scheduledStartTime === scheduledStartTime &&
        visit.scheduledEndTime === scheduledEndTime)
    ) {
      return
    }

    const previous = { ...visit }
    setVisits((current) =>
      current.map((entry) =>
        entry.id === visitId
          ? { ...entry, scheduledStartTime, scheduledEndTime }
          : entry,
      ),
    )
    markVisitSyncing(visitId, true)
    setError(null)

    try {
      const response = await saveVisit(endpoints.upsertVisit, {
        id: visitId,
        scheduledStartTime,
        scheduledEndTime,
      })
      const savedItem = response.item as Record<string, unknown> | undefined
      const mapped = savedItem ? mapVisit(savedItem) : null
      if (mapped) {
        setVisits((current) =>
          current.map((entry) => (entry.id === visitId ? mapped : entry)),
        )
      }
    } catch (timeChangeError) {
      setVisits((current) =>
        current.map((entry) => (entry.id === visitId ? previous : entry)),
      )
      setError(
        timeChangeError instanceof Error
          ? timeChangeError.message
          : 'Unable to update visit time.',
      )
    } finally {
      markVisitSyncing(visitId, false)
    }
  }

  const openCompleteVisitModal = () => {
    if (visitHasOpenTasks) {
      setError(
        'Complete or dismiss all tasks before completing the visit.',
      )
      return
    }
    setError(null)
    setCompleteVisitForm({
      hours: '1',
      poolOfHours: selectedVisit?.appliesToHourBank ?? false,
      specialHours: selectedVisit?.specialHours ?? false,
    })
    setIsCompleteVisitOpen(true)
  }

  const submitCompleteVisit = async () => {
    if (!selectedVisit) return
    const hours = Number(completeVisitForm.hours)
    if (!Number.isFinite(hours) || hours <= 0) {
      setError('Enter a valid number of hours.')
      return
    }
    if (visitHasOpenTasks) {
      setError(
        'Complete or dismiss all tasks before completing the visit.',
      )
      return
    }
    await updateVisitStatus(selectedVisit, 'COMPLETED', {
      actualDurationHours: hours,
      appliesToHourBank: completeVisitForm.poolOfHours,
      specialHours: completeVisitForm.specialHours,
    })
    setIsCompleteVisitOpen(false)
  }

  const openCancelVisitModal = () => {
    setError(null)
    setCancelVisitForm({ taskAction: 'release', cancelConfirmed: false })
    setIsCancelVisitOpen(true)
  }

  const submitCancelVisit = async () => {
    if (!selectedVisit) return
    if (cancelVisitForm.taskAction === 'cancel' && !cancelVisitForm.cancelConfirmed) {
      setError('Confirm that you want to mark open tasks as cancelled.')
      return
    }
    const cancelTaskAction =
      visitTasks.length > 0 ? cancelVisitForm.taskAction : undefined
    const successMessage =
      cancelTaskAction === 'cancel'
        ? visitTasksToRelease.length > 0
          ? 'Visit cancelled. Open tasks were marked as CANCELLED.'
          : 'Visit cancelled.'
        : visitTasksToRelease.length > 0
          ? 'Visit cancelled. Tasks moved to Tasks not on a visit.'
          : 'Visit cancelled.'
    await updateVisitStatus(
      selectedVisit,
      'CANCELLED',
      cancelTaskAction ? { cancelTaskAction } : undefined,
      successMessage,
    )
    setIsCancelVisitOpen(false)
    if (cancelTaskAction === 'release') {
      await loadPool()
    }
  }

  const updateVisitStatus = async (
    visit: VisitRecord,
    status: VisitRecord['status'],
    extra?: Record<string, unknown>,
    successMessage?: string,
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
      setMessage(successMessage ?? `Visit marked as ${status}.`)
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
    const visitDueDate =
      selectedVisit?.scheduledDate ||
      visits.find((visit) => visit.id === taskForm.visitId)?.scheduledDate
    const payload: Record<string, unknown> = {
      id: taskForm.id || undefined,
      propertyId: taskForm.propertyId,
      teamId: taskForm.teamId,
      assignedUserId: taskForm.assignedUserId || undefined,
      title: taskForm.title,
      description: taskForm.description,
      priority: taskForm.priority || 'MEDIUM',
      dueDate: taskForm.visitId
        ? visitDueDate || taskForm.dueDate || undefined
        : taskForm.dueDate || undefined,
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

  const handleDismissTask = async (task: TaskRecord) => {
    setDismissingTaskId(task.id)
    try {
      await dismissTask(task)
    } finally {
      setDismissingTaskId(null)
    }
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
    if (
      !isVisitFormOpen ||
      !isCreatingVisit ||
      !visitForm.propertyId ||
      !endpoints.visitTemplates
    ) {
      setPropertyTemplates([])
      return
    }
    void getVisitTemplates(endpoints.visitTemplates, {
      propertyId: visitForm.propertyId,
    })
      .then((payload) => {
        const items = (payload.items ?? []).map((entry) =>
          mapVisitTemplate(entry as unknown as Record<string, unknown>),
        )
        setPropertyTemplates(items.filter((template) => template.active))
      })
      .catch(() => setPropertyTemplates([]))
  }, [
    endpoints.visitTemplates,
    isCreatingVisit,
    isVisitFormOpen,
    visitForm.propertyId,
  ])

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
          <button
            type="button"
            className={opsTab === 'templates' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setOpsTab('templates')}
          >
            Templates
          </button>
        </div>

        {message ? <p className="notice success">{message}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}
      </section>

      {opsTab === 'dashboard' ? (
        <>
          <section className="card filters-card">
            <div className="operations-dashboard-views">
              <button
                type="button"
                className={
                  dashboardViewMode === 'kanban' ? 'btn-primary' : 'btn-secondary'
                }
                onClick={() => setDashboardViewMode('kanban')}
              >
                Kanban
              </button>
              <button
                type="button"
                className={
                  dashboardViewMode === 'agenda' ? 'btn-primary' : 'btn-secondary'
                }
                onClick={() => setDashboardViewMode('agenda')}
              >
                Agenda
              </button>
              <button
                type="button"
                className={
                  dashboardViewMode === 'day' ? 'btn-primary' : 'btn-secondary'
                }
                onClick={() => setDashboardViewMode('day')}
              >
                Day
              </button>
            </div>

            {dashboardViewMode === 'kanban' ? (
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
            ) : dashboardViewMode === 'agenda' ? (
              <p className="subtitle operations-view-hint">
                Showing {formatAgendaDayLabel(visitQueryRange.from)} –{' '}
                {formatAgendaDayLabel(visitQueryRange.to)}. Click a day header to
                open the day timeline.
              </p>
            ) : (
              <div className="filters-grid operations-day-date-filter">
                <label>
                  Day
                  <input
                    type="date"
                    value={dayViewDate}
                    onChange={(event) => setDayViewDate(event.target.value)}
                  />
                </label>
              </div>
            )}

            <div className="filters-grid">
              {dashboardViewMode === 'kanban' ? (
                <>
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
                </>
              ) : null}
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
                  {sortedPropertyOptions.map((property) => (
                    <option key={property.id} value={property.id}>
                      {getPropertyLabel(property)}
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

          {dashboardViewMode === 'kanban' ? (
            <OperationsKanbanView
              columns={VISIT_COLUMNS}
              visitsByColumn={visitsByColumn}
              isMultiDayRange={isMultiDayRange}
              propertyById={propertyById}
              visitTypeById={visitTypeById}
              teamById={teamById}
              userById={userById}
              onSelectVisit={setSelectedVisitId}
            />
          ) : dashboardViewMode === 'agenda' ? (
            <OperationsAgendaView
              dates={visitQueryRange.dates}
              displayRows={mtlDisplayRows}
              visits={filteredVisits}
              propertyById={propertyById}
              teamById={teamById}
              syncingVisitIds={syncingVisitIds}
              shiftDays={AGENDA_DAY_COUNT}
              onVisitClick={setSelectedVisitId}
              onDayHeaderClick={goToDayView}
              onEmptyCellClick={openCreateVisitAtCell}
              onVisitReschedule={handleVisitReschedule}
              onShiftDates={shiftAgendaDates}
            />
          ) : (
            <OperationsDayView
              dayViewDate={dayViewDate}
              displayRows={mtlDisplayRows}
              visits={filteredVisits.filter(
                (visit) => visit.scheduledDate === dayViewDate,
              )}
              propertyById={propertyById}
              teamById={teamById}
              syncingVisitIds={syncingVisitIds}
              onVisitClick={setSelectedVisitId}
              onVisitTimeChange={handleVisitTimeChange}
            />
          )}
        </>
      ) : opsTab === 'pool' ? (
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
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {poolTasks.length === 0 ? (
                  <tr>
                    <td colSpan={7}>No unassigned or dismissed tasks.</td>
                  </tr>
                ) : (
                  poolTasks.map((task) => (
                    <tr key={task.id}>
                      <td>{task.title}</td>
                      <td>{task.status}</td>
                      <td>{propertyById.get(task.propertyId) ?? task.propertyId}</td>
                      <td>{teamById.get(task.teamId) ?? task.teamId}</td>
                      <td>{task.priority}</td>
                      <td>{formatTaskCreatedDate(task.createdAt)}</td>
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
      ) : (
        <VisitTemplatesPanel
          getVisitTemplatesEndpoint={endpoints.visitTemplates}
          upsertVisitTemplateEndpoint={endpoints.upsertVisitTemplate}
          propertyOptions={propertyOptions}
          teams={teams}
          users={users}
          visitTypes={visitTypes}
          onMessage={(value) => {
            setError(null)
            setMessage(value)
          }}
          onError={(value) => {
            setMessage(null)
            setError(value)
          }}
        />
      )}

      {selectedVisit && opsTab === 'dashboard' ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal operations-detail-modal modal-scrollable">
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
                <strong>Status:</strong> {selectedVisit.status}
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
                      disabled={visitHasOpenTasks}
                      title={
                        visitHasOpenTasks
                          ? 'Complete or dismiss all tasks first'
                          : undefined
                      }
                      onClick={openCompleteVisitModal}
                    >
                      Complete visit
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={openCancelVisitModal}
                    >
                      Cancel visit
                    </button>
                  </>
                ) : null}
              </div>

              <h4 className="section-title">Tasks</h4>
              {selectedVisit.status !== 'COMPLETED' &&
              selectedVisit.status !== 'CANCELLED' ? (
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
                        dueDate: selectedVisit.scheduledDate,
                      })
                      setIsTaskFormOpen(true)
                    }}
                  >
                    Create task
                  </button>
                </div>
              ) : null}
              <ul className="operations-task-list">
                {visitTasks.map((task) => {
                  const isCompleted = task.status === 'COMPLETED'
                  const isCancelled = task.status === 'CANCELLED'
                  const canActOnTask =
                    task.status === 'PENDING' || task.status === 'BLOCKED'
                  const isDismissing = dismissingTaskId === task.id

                  return (
                    <li key={task.id}>
                      <div className="operations-task-content">
                        <span className="operations-task-title">{task.title}</span>
                        {task.priority === 'URGENT' ? (
                          <span className="status status-danger">Urgent</span>
                        ) : null}
                        {isCancelled ? (
                          <span className="status status-neutral">
                            Cancelled with visit
                          </span>
                        ) : null}
                        {selectedVisit.status === 'OVERDUE' && canActOnTask ? (
                          <span className="status status-warning">Overdue visit</span>
                        ) : null}
                      </div>
                      <div className="action-buttons">
                        <button
                          type="button"
                          className={`btn-icon btn-icon-ghost${
                            isCompleted ? ' is-task-complete' : ''
                          }`}
                          aria-label="Complete task"
                          disabled={isCompleted || isCancelled || !canActOnTask}
                          onClick={() => void completeTask(task)}
                        >
                          ✓
                        </button>
                        {canActOnTask ? (
                          <button
                            type="button"
                            className={`btn-icon btn-icon-ghost${
                              isDismissing ? ' is-task-dismiss-active' : ''
                            }`}
                            aria-label="Dismiss task"
                            disabled={isDismissing}
                            onClick={() => void handleDismissTask(task)}
                          >
                            ✕
                          </button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      {isVisitFormOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div
            className={`modal${isCreatingVisit ? ' modal-wide modal-scrollable' : ''}`}
          >
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
                  onChange={(event) => {
                    setSelectedTemplateId('')
                    setDraftVisitTasks([])
                    setVisitForm((c) => ({
                      ...c,
                      propertyId: event.target.value,
                    }))
                  }}
                >
                  <option value="">Select property</option>
                  {sortedPropertyOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {getPropertyLabel(p)}
                    </option>
                  ))}
                </select>
              </label>
              {isCreatingVisit && visitForm.propertyId ? (
                <label>
                  Use template
                  <select
                    value={selectedTemplateId}
                    onChange={(event) => {
                      const templateId = event.target.value
                      setSelectedTemplateId(templateId)
                      const template = propertyTemplates.find(
                        (entry) => entry.id === templateId,
                      )
                      if (template) {
                        applyVisitTemplate(template)
                      } else {
                        setDraftVisitTasks([])
                      }
                    }}
                  >
                    <option value="">No template</option>
                    {propertyTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                Visit type
                <select
                  value={visitForm.visitTypeId}
                  onChange={(event) => handleVisitTypeChange(event.target.value)}
                >
                  <option value="">Select type</option>
                  {sortedVisitTypes.map((type) => (
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
              {!isCreatingVisit ? (
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
              ) : null}
              {isCreatingVisit ? (
                <div className="full-width visit-draft-tasks">
                  <div className="visit-tasks-header">
                    <div>
                      <h4>Tasks</h4>
                      <p className="subtitle">
                        Optional. Tasks are created when you save the visit.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() =>
                        setDraftVisitTasks((current) => [
                          {
                            title: '',
                            description: '',
                            priority: 'MEDIUM',
                            urgent: false,
                          },
                          ...current,
                        ])
                      }
                    >
                      Add task
                    </button>
                  </div>
                  {draftVisitTasks.length === 0 ? (
                    <p className="subtitle">No tasks added yet.</p>
                  ) : null}
                  {draftVisitTasks.map((task, index) => (
                    <div key={`draft-${index}`} className="template-task-row">
                      <input
                        placeholder="Task title"
                        value={task.title}
                        onChange={(event) =>
                          setDraftVisitTasks((current) =>
                            current.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, title: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                      <input
                        placeholder="Description"
                        value={task.description}
                        onChange={(event) =>
                          setDraftVisitTasks((current) =>
                            current.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, description: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                      <label className="checkbox-row compact">
                        <input
                          type="checkbox"
                          checked={task.urgent}
                          onChange={(event) =>
                            setDraftVisitTasks((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, urgent: event.target.checked }
                                  : entry,
                              ),
                            )
                          }
                        />
                        Urgent
                      </label>
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() =>
                          setDraftVisitTasks((current) =>
                            current.filter(
                              (_, entryIndex) => entryIndex !== index,
                            ),
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              {isSavingVisitWithTasks ? (
                <p className="subtitle operations-saving-tasks-notice">
                  <span className="operations-sync-spinner" aria-hidden="true" />
                  Saving visit and tasks…
                </p>
              ) : null}
              <button
                type="button"
                className="btn-primary"
                disabled={isSavingVisitWithTasks}
                onClick={() => void submitVisit()}
              >
                {isSavingVisitWithTasks ? 'Saving…' : 'Save visit'}
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
                      {sortedPropertyOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {getPropertyLabel(p)}
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
              {isCreatingTask ? (
                <label className="checkbox-row full-width">
                  <input
                    type="checkbox"
                    checked={taskForm.priority === 'URGENT'}
                    onChange={(event) =>
                      setTaskForm((c) => ({
                        ...c,
                        priority: event.target.checked ? 'URGENT' : 'MEDIUM',
                      }))
                    }
                  />
                  Urgent
                </label>
              ) : (
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
              )}
              {!taskForm.visitId ? (
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
              ) : null}
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

      {isCancelVisitOpen && selectedVisit ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Cancel visit</h3>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsCancelVisitOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>
                This visit has {visitTasks.length} task
                {visitTasks.length === 1 ? '' : 's'}. What should happen to them?
              </p>
              {visitTasks.length > 0 ? (
                <div className="cancel-visit-options">
                  <label className="cancel-visit-option">
                    <input
                      type="radio"
                      name="cancelTaskAction"
                      checked={cancelVisitForm.taskAction === 'release'}
                      onChange={() =>
                        setCancelVisitForm({
                          taskAction: 'release',
                          cancelConfirmed: false,
                        })
                      }
                    />
                    <span>
                      Move {visitTasksToRelease.length} open task
                      {visitTasksToRelease.length === 1 ? '' : 's'} to{' '}
                      <strong>Tasks not on a visit</strong>
                      {visitTasks.length !== visitTasksToRelease.length
                        ? ' (completed and cancelled tasks stay on this visit)'
                        : ''}
                    </span>
                  </label>
                  <label className="cancel-visit-option">
                    <input
                      type="radio"
                      name="cancelTaskAction"
                      checked={cancelVisitForm.taskAction === 'cancel'}
                      onChange={() =>
                        setCancelVisitForm((current) => ({
                          ...current,
                          taskAction: 'cancel',
                        }))
                      }
                    />
                    <span>
                      Mark {visitTasksToRelease.length} open task
                      {visitTasksToRelease.length === 1 ? '' : 's'} as{' '}
                      <strong>CANCELLED</strong> and keep them on this visit
                      {visitTasks.length !== visitTasksToRelease.length
                        ? ' (completed tasks stay unchanged)'
                        : ''}
                    </span>
                  </label>
                  {cancelVisitForm.taskAction === 'cancel' ? (
                    <label className="checkbox-row cancel-visit-delete-confirm">
                      <input
                        type="checkbox"
                        checked={cancelVisitForm.cancelConfirmed}
                        onChange={(event) =>
                          setCancelVisitForm((current) => ({
                            ...current,
                            cancelConfirmed: event.target.checked,
                          }))
                        }
                      />
                      I understand open tasks will be marked as CANCELLED and
                      remain visible on this cancelled visit.
                    </label>
                  ) : null}
                </div>
              ) : (
                <p className="subtitle">This visit has no tasks to move or cancel.</p>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsCancelVisitOpen(false)}
              >
                Keep visit
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={
                  visitTasks.length > 0 &&
                  cancelVisitForm.taskAction === 'cancel' &&
                  !cancelVisitForm.cancelConfirmed
                }
                onClick={() => void submitCancelVisit()}
              >
                Cancel visit
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCompleteVisitOpen && selectedVisit ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Complete visit</h3>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsCompleteVisitOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body form-grid">
              <label>
                Hours
                <input
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={completeVisitForm.hours}
                  onChange={(event) =>
                    setCompleteVisitForm((current) => ({
                      ...current,
                      hours: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="checkbox-row full-width">
                <input
                  type="checkbox"
                  checked={completeVisitForm.poolOfHours}
                  onChange={(event) =>
                    setCompleteVisitForm((current) => ({
                      ...current,
                      poolOfHours: event.target.checked,
                    }))
                  }
                />
                Pool of hours
              </label>
              <label className="checkbox-row full-width">
                <input
                  type="checkbox"
                  checked={completeVisitForm.specialHours}
                  onChange={(event) =>
                    setCompleteVisitForm((current) => ({
                      ...current,
                      specialHours: event.target.checked,
                    }))
                  }
                />
                Special hours
              </label>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void submitCompleteVisit()}
              >
                Complete visit
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
