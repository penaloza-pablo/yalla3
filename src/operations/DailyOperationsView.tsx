import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MobileBodyPortal } from '../MobileBodyPortal'
import {
  fetchJson,
  getReferenceList,
  getTasksByVisit,
  getUnassignedPool,
  getVisitById,
  getVisitTemplatesForProperty,
  getVisitsByDateRange,
  getBookingsForDay,
  canRefreshVisitFromGuesty,
  refreshVisitFromGuesty,
  saveTask,
  saveVisit,
} from './api'
import { OperationsAgendaView } from './OperationsAgendaView'
import { OperationsDayView, type DayBookingEvent } from './OperationsDayView'
import { OperationsKanbanView } from './OperationsKanbanView'
import { TodayView, clearTodaySummaryCache } from '../today/TodayView'
import { buildMtlDisplayRows } from './mtlPropertyHelpers'
import {
  AGENDA_DAY_COUNT,
  formatAgendaDayLabel,
  getAgendaDateRange,
  isTerminalVisit,
} from './operationsViewHelpers'
import { filterPropertySelectOptions, getPropertyLabel, sortPropertyOptions } from './propertyHelpers'
import { sortVisitTypes } from './visitTypeHelpers'
import { CLEANING_VISIT_TYPE_ID, requiresCompleteVisitWizard, resolveTeamIdForVisitType } from './visitTypeIds'
import { VisitTemplatesPanel, type VisitTemplatesPanelHandle } from './VisitTemplatesPanel'
import { VisitUseTemplateControls } from './VisitUseTemplateControls'
import { displayTaskTitle } from './taskTitleDisplay'
import { isSpanishLocale } from '../i18n/display'
import { ACTION_KEYS } from '../../amplify/functions/shared/rbac-catalog'
import { usePermissions } from '../rbac/PermissionsProvider'
import {
  buildApplyTemplateVisitPayload,
  templateTasksToDrafts,
} from './visitTemplateHelpers'
import {
  addDaysToDateString,
  formatDayMonthLabel,
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

type OpsMode = 'dashboard' | 'unassigned' | 'templates'
type DashboardViewMode = 'dashboard' | 'kanban' | 'agenda' | 'day'

type BookingEventKind = 'check-in' | 'check-out'

type OpsFilters = {
  teamIds: string[]
  statuses: VisitStatus[]
  propertyIds: string[]
  userIds: string[]
  bookingEvents: BookingEventKind[]
}

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  getCurrentUserEmail: () => Promise<string>
  propertyOptions: PropertyOption[]
  mode?: OpsMode
  onNavigate?: (page: string, options?: { inventoryStatuses?: string[] }) => void
  searchQuery?: string
  onSearchQueryChange?: (value: string) => void
  isMobileSearchOpen?: boolean
  onToggleMobileSearch?: () => void
}

const ALL_VISIT_STATUSES: VisitStatus[] = [
  'SCHEDULED',
  'OVERDUE',
  'COMPLETED',
  'CANCELLED',
]
const DEFAULT_STATUS_FILTER: VisitStatus[] = [
  'SCHEDULED',
  'OVERDUE',
  'COMPLETED',
]

const DEFAULT_BOOKING_EVENTS: BookingEventKind[] = ['check-in']

const emptyOpsFilters = (): OpsFilters => ({
  teamIds: [],
  statuses: [...DEFAULT_STATUS_FILTER],
  propertyIds: [],
  userIds: [],
  bookingEvents: [...DEFAULT_BOOKING_EVENTS],
})

const listsMatch = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value) => right.includes(value))

const toggleListValue = (values: string[], value: string) =>
  values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value]

const VISIT_COLUMN_DEFS: {
  key: VisitStatus | 'DONE'
  labelKey: string
  statuses: VisitStatus[]
}[] = [
  { key: 'SCHEDULED', labelKey: 'operations.scheduled', statuses: ['SCHEDULED'] },
  { key: 'OVERDUE', labelKey: 'operations.overdue', statuses: ['OVERDUE'] },
  {
    key: 'DONE',
    labelKey: 'operations.completedCancelled',
    statuses: ['COMPLETED', 'CANCELLED'],
  },
]

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

type CleaningPlanDayLookup = {
  status: 'READY' | 'DRAFT'
  typeNameByVisitId: Record<string, string>
  cleanerIdByVisitId: Record<string, string>
}

const cleaningTypeNameFromPlanRow = (item: Record<string, unknown>) => {
  const types = Array.isArray(item.cleaningTypes) ? item.cleaningTypes : []
  const typeId = String(item.cleaningTypeId ?? '').trim()
  const matched = types.find((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>
    return String(row.id ?? '').trim() === typeId
  }) as Record<string, unknown> | undefined
  const fromTypes = String(matched?.name ?? '').trim()
  if (fromTypes) {
    return fromTypes
  }
  return String(item.cleaningTypeName ?? '').trim()
}

const emptyVisitForm = () => ({
  id: '',
  propertyId: '',
  visitTypeId: '',
  teamId: '',
  assignedUserId: '',
  scheduledDate: getTodayMadrid(),
  scheduledStartTime: '11:00',
  scheduledEndTime: '12:00',
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

const asRecordString = (item: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

const resolveBookingPropertyId = (
  listingId: string,
  listingNickname: string,
  properties: PropertyOption[],
) => {
  if (listingId) {
    const byId = properties.find((property) => property.id === listingId)
    if (byId) {
      return byId.id
    }
  }
  const nick = listingNickname.trim().toLowerCase()
  if (!nick) {
    return listingId
  }
  const byNickname = properties.find((property) => {
    const labels = [
      property.listingNickname,
      property.nickname,
      property.title,
    ]
      .join(' ')
      .toLowerCase()
    return (
      property.listingNickname.toLowerCase() === nick ||
      property.nickname.toLowerCase() === nick ||
      labels.includes(nick)
    )
  })
  return byNickname?.id || listingId
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
  guestyTaskId:
    typeof item.guestyTaskId === 'string' ? item.guestyTaskId : undefined,
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
  titleEs:
    typeof item.titleEs === 'string' && item.titleEs.trim()
      ? item.titleEs
      : undefined,
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
  mode = 'dashboard',
  onNavigate,
  searchQuery = '',
  onSearchQueryChange,
  isMobileSearchOpen = false,
  onToggleMobileSearch,
}: Props) {
  const { t, i18n } = useTranslation()
  const { can } = usePermissions()
  const visitColumns = useMemo(
    () =>
      VISIT_COLUMN_DEFS.map((column) => ({
        ...column,
        label: t(column.labelKey),
      })),
    [t],
  )
  const templatesPanelRef = useRef<VisitTemplatesPanelHandle>(null)
  const cleaningPlanInflight = useRef(new Set<string>())
  const [cleaningPlansByDate, setCleaningPlansByDate] = useState<
    Record<string, CleaningPlanDayLookup>
  >({})
  const [cleanerNameById, setCleanerNameById] = useState<Map<string, string>>(
    () => new Map(),
  )
  const [dashboardViewMode, setDashboardViewMode] =
    useState<DashboardViewMode>('dashboard')
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0)
  const [templateFilterCount, setTemplateFilterCount] = useState(0)
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filters, setFilters] = useState<OpsFilters>(emptyOpsFilters)
  const [filterDraft, setFilterDraft] = useState<OpsFilters>(emptyOpsFilters)
  const [dayViewDate, setDayViewDate] = useState(getTodayMadrid())
  const [agendaAnchorDate, setAgendaAnchorDate] = useState(getTodayMadrid())
  const [filterDateFrom, setFilterDateFrom] = useState(getTodayMadrid())
  const [filterDateTo, setFilterDateTo] = useState(getTodayMadrid())

  const [visits, setVisits] = useState<VisitRecord[]>([])
  const [dayBookings, setDayBookings] = useState<DayBookingEvent[]>([])
  const [poolTasks, setPoolTasks] = useState<TaskRecord[]>([])
  const [visitTasks, setVisitTasks] = useState<TaskRecord[]>([])
  const [teams, setTeams] = useState<TeamRecord[]>([])
  const [users, setUsers] = useState<UserRecord[]>([])
  const [visitTypes, setVisitTypes] = useState<VisitTypeRecord[]>([])
  const [propertyOptions, setPropertyOptions] = useState<PropertyOption[]>(
    propertyOptionsProp,
  )

  const [selectedVisitId, setSelectedVisitId] = useState<string | null>(null)
  const [isVisitMoreInfoOpen, setIsVisitMoreInfoOpen] = useState(false)
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
  const [openVisitTemplates, setOpenVisitTemplates] = useState<VisitTemplateRecord[]>(
    [],
  )
  const [openVisitTemplateId, setOpenVisitTemplateId] = useState('')
  const [isApplyingVisitTemplate, setIsApplyingVisitTemplate] = useState(false)

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
  const [isRefreshingFromGuesty, setIsRefreshingFromGuesty] = useState(false)
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
      bookings: getEndpoint(
        'getBookingsUrl',
        import.meta.env.VITE_GET_BOOKINGS_URL,
      ),
      cleaningPlan: getEndpoint(
        'getCleaningPlanUrl',
        import.meta.env.VITE_GET_CLEANING_PLAN_URL,
      ),
      cleaners: getEndpoint(
        'getCleanersUrl',
        import.meta.env.VITE_GET_CLEANERS_URL,
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
  const filterPropertyOptions = useMemo(
    () => filterPropertySelectOptions(propertyOptions),
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
    if (dashboardViewMode === 'day' || dashboardViewMode === 'dashboard') {
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
      if (filters.teamIds.length > 0 && !filters.teamIds.includes(visit.teamId)) {
        return false
      }
      if (
        filters.statuses.length > 0 &&
        !filters.statuses.includes(visit.status)
      ) {
        return false
      }
      if (
        filters.propertyIds.length > 0 &&
        !filters.propertyIds.includes(visit.propertyId)
      ) {
        return false
      }
      if (
        filters.userIds.length > 0 &&
        !filters.userIds.includes(visit.assignedUserId ?? '')
      ) {
        return false
      }
      return true
    })
  }, [visits, filters])

  const activeFilterCount = useMemo(() => {
    const statusCount = listsMatch(filters.statuses, DEFAULT_STATUS_FILTER)
      ? 0
      : 1
    const bookingCount = listsMatch(filters.bookingEvents, DEFAULT_BOOKING_EVENTS)
      ? 0
      : 1
    return (
      filters.teamIds.length +
      filters.propertyIds.length +
      filters.userIds.length +
      statusCount +
      bookingCount
    )
  }, [filters])

  const isMultiDayRange = filterDateFrom !== filterDateTo

  const visitsByColumn = useMemo(() => {
    const map = new Map<string, VisitRecord[]>()
    visitColumns.forEach((column) => map.set(column.key, []))
    filteredVisits.forEach((visit) => {
      const column = visitColumns.find((entry) =>
        entry.statuses.includes(visit.status),
      )
      if (column) {
        map.get(column.key)?.push(visit)
      }
    })
    visitColumns.forEach((column) => {
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

  const cleaningTypeBadge = useMemo(() => {
    if (
      !selectedVisit ||
      selectedVisit.visitTypeId !== CLEANING_VISIT_TYPE_ID
    ) {
      return null
    }
    const plan = cleaningPlansByDate[selectedVisit.scheduledDate]
    if (!plan) {
      return null
    }
    if (plan.status === 'READY') {
      const assignedName = plan.typeNameByVisitId[selectedVisit.id]?.trim()
      if (assignedName) {
        return { pending: false, label: assignedName }
      }
    }
    return {
      pending: true,
      label: t('operations.cleaningTypePending'),
    }
  }, [cleaningPlansByDate, selectedVisit, t])

  const cleanerBadge = useMemo(() => {
    if (
      !selectedVisit ||
      selectedVisit.visitTypeId !== CLEANING_VISIT_TYPE_ID
    ) {
      return null
    }
    const cleanerId =
      cleaningPlansByDate[selectedVisit.scheduledDate]?.cleanerIdByVisitId?.[
        selectedVisit.id
      ]?.trim() ?? ''
    if (!cleanerId) {
      return null
    }
    return cleanerNameById.get(cleanerId)?.trim() || null
  }, [cleanerNameById, cleaningPlansByDate, selectedVisit])

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
      setError(t('operations.missingVisitsEndpoint'))
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
        loadError instanceof Error ? loadError.message : t('operations.unableLoadVisits'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [endpoints.visits, visitQueryRange])

  const loadDayBookings = useCallback(async () => {
    if (!endpoints.bookings || dashboardViewMode !== 'day') {
      setDayBookings([])
      return
    }
    if (filters.bookingEvents.length === 0) {
      setDayBookings([])
      return
    }
    try {
      const payload = await getBookingsForDay(
        endpoints.bookings,
        dayViewDate,
        'confirmed',
      )
      const events: DayBookingEvent[] = []
      for (const item of payload.items ?? []) {
        const record = item as Record<string, unknown>
        const reservationId = asRecordString(record, [
          'ReservationID',
          'reservationId',
          'id',
        ])
        const listingId = asRecordString(record, ['ListingID', 'listingId'])
        const listingNickname = asRecordString(record, [
          'ListingNickname',
          'listingNickname',
        ])
        const guestName = asRecordString(record, ['GuestName', 'guestName'])
        const checkInDate = asRecordString(record, ['CheckInDate', 'checkInDate'])
        const checkOutDate = asRecordString(record, [
          'CheckOutDate',
          'checkOutDate',
        ])
        const propertyId = resolveBookingPropertyId(
          listingId,
          listingNickname,
          propertyOptions,
        )
        if (!propertyId) {
          continue
        }
        if (
          filters.bookingEvents.includes('check-in') &&
          checkInDate === dayViewDate
        ) {
          events.push({
            id: `${reservationId || listingId}-in`,
            kind: 'check-in',
            propertyId,
            guestName: guestName || listingNickname || reservationId,
          })
        }
        if (
          filters.bookingEvents.includes('check-out') &&
          checkOutDate === dayViewDate
        ) {
          events.push({
            id: `${reservationId || listingId}-out`,
            kind: 'check-out',
            propertyId,
            guestName: guestName || listingNickname || reservationId,
          })
        }
      }
      setDayBookings(events)
    } catch {
      setDayBookings([])
    }
  }, [
    dashboardViewMode,
    dayViewDate,
    endpoints.bookings,
    filters.bookingEvents,
    propertyOptions,
  ])

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
        loadError instanceof Error ? loadError.message : t('operations.unableLoadTasks'),
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
    setPropertyOptions((current) => {
      const previousById = new Map(current.map((item) => [item.id, item]))
      return propertyOptionsProp.map((property) => ({
        ...property,
        mtlPrincipalId:
          property.mtlPrincipalId?.trim() ||
          previousById.get(property.id)?.mtlPrincipalId,
      }))
    })
  }, [propertyOptionsProp])

  useEffect(() => {
    if (mode === 'dashboard' && dashboardViewMode !== 'dashboard') {
      void loadVisits()
    }
    if (mode === 'unassigned') {
      void loadPool()
    }
  }, [mode, loadVisits, loadPool, dashboardViewMode, dayViewDate])

  useEffect(() => {
    if (mode === 'dashboard') {
      void loadDayBookings()
    } else {
      setDayBookings([])
    }
  }, [mode, loadDayBookings])

  useEffect(() => {
    setIsVisitMoreInfoOpen(false)
    if (selectedVisitId) {
      void loadVisitTasks(selectedVisitId)
    } else {
      setVisitTasks([])
    }
  }, [selectedVisitId, loadVisitTasks])

  useEffect(() => {
    const endpoint = endpoints.cleaners
    if (!endpoint) {
      return
    }
    let cancelled = false
    void fetchJson<{ items?: Record<string, unknown>[] }>(
      `${endpoint}?includeInactive=true`,
    )
      .then((payload) => {
        if (cancelled) {
          return
        }
        setCleanerNameById(
          new Map(
            (payload.items ?? [])
              .map((item) => {
                const id = String(item.id ?? '').trim()
                const name = String(item.name ?? '').trim()
                return [id, name] as const
              })
              .filter((entry) => entry[0] && entry[1]),
          ),
        )
      })
      .catch(() => {
        if (!cancelled) {
          setCleanerNameById(new Map())
        }
      })
    return () => {
      cancelled = true
    }
  }, [endpoints.cleaners])

  useEffect(() => {
    if (mode !== 'dashboard' || !selectedVisit) {
      return
    }
    if (selectedVisit.visitTypeId !== CLEANING_VISIT_TYPE_ID) {
      return
    }
    const date = selectedVisit.scheduledDate.trim()
    const endpoint = endpoints.cleaningPlan
    if (!date || !endpoint) {
      return
    }
    if (cleaningPlansByDate[date] || cleaningPlanInflight.current.has(date)) {
      return
    }
    cleaningPlanInflight.current.add(date)
    void fetchJson<{
      status?: string
      rows?: Record<string, unknown>[]
    }>(`${endpoint}?date=${encodeURIComponent(date)}`)
      .then((payload) => {
        const typeNameByVisitId: Record<string, string> = {}
        const cleanerIdByVisitId: Record<string, string> = {}
        for (const row of payload.rows ?? []) {
          const visitId = String(row.visitId ?? '').trim()
          const name = cleaningTypeNameFromPlanRow(row)
          if (visitId && name) {
            typeNameByVisitId[visitId] = name
          }
          const cleanerId = String(row.cleanerId ?? '').trim()
          if (visitId && cleanerId) {
            cleanerIdByVisitId[visitId] = cleanerId
          }
        }
        setCleaningPlansByDate((current) => ({
          ...current,
          [date]: {
            status:
              String(payload.status ?? 'DRAFT').toUpperCase() === 'READY'
                ? 'READY'
                : 'DRAFT',
            typeNameByVisitId,
            cleanerIdByVisitId,
          },
        }))
      })
      .catch(() => {
        setCleaningPlansByDate((current) => ({
          ...current,
          [date]: {
            status: 'DRAFT',
            typeNameByVisitId: {},
            cleanerIdByVisitId: {},
          },
        }))
      })
      .finally(() => {
        cleaningPlanInflight.current.delete(date)
      })
  }, [
    cleaningPlansByDate,
    endpoints.cleaningPlan,
    mode,
    selectedVisit,
  ])

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

  const applyTemplateToSelectedVisit = async () => {
    if (!selectedVisit || !openVisitTemplateId || !endpoints.upsertVisit) {
      return
    }
    if (
      selectedVisit.status === 'COMPLETED' ||
      selectedVisit.status === 'CANCELLED'
    ) {
      return
    }
    const template = openVisitTemplates.find(
      (entry) => entry.id === openVisitTemplateId,
    )
    if (!template) {
      return
    }
    setIsApplyingVisitTemplate(true)
    setError(null)
    try {
      const response = await saveVisit(
        endpoints.upsertVisit,
        buildApplyTemplateVisitPayload(selectedVisit, template),
      )
      const savedItem = response.item as Record<string, unknown> | undefined
      if (savedItem) {
        const mapped = mapVisit(savedItem)
        setVisits((current) =>
          current.map((visit) => (visit.id === mapped.id ? mapped : visit)),
        )
      }
      await loadVisitTasks(selectedVisit.id)
      setOpenVisitTemplateId('')
      const createdCount = Array.isArray(
        (response as { createdTasks?: unknown[] }).createdTasks,
      )
        ? (response as { createdTasks: unknown[] }).createdTasks.length
        : template.tasks.length
      setMessage(t('operations.templateApplied', { count: createdCount }))
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : t('operations.unableApplyTemplate'),
      )
    } finally {
      setIsApplyingVisitTemplate(false)
    }
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
      teamId: resolveTeamIdForVisitType(visitType, teams, current.teamId),
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
        titleEs: draft.titleEs?.trim() || undefined,
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
          ? t('operations.visitSavedWithTasks', {
              count: createdTasks || tasksToCreate.length,
            })
          : t('operations.visitSaved'),
      )
      clearTodaySummaryCache()
      setDashboardRefreshKey((current) => current + 1)
      if (!mapped || !isCreatingVisit) {
        await loadVisits()
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('operations.unableSaveVisit'))
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
    if (!selectedVisit) return
    if (visitHasOpenTasks) {
      setError(
        'Complete or dismiss all tasks before completing the visit.',
      )
      return
    }
    if (!requiresCompleteVisitWizard(selectedVisit.visitTypeId)) {
      void updateVisitStatus(selectedVisit, 'COMPLETED')
      return
    }
    setError(null)
    setCompleteVisitForm({
      hours: '1',
      poolOfHours: selectedVisit.appliesToHourBank ?? false,
      specialHours: selectedVisit.specialHours ?? false,
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
      clearTodaySummaryCache()
      setDashboardRefreshKey((current) => current + 1)
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

  const refreshSelectedVisitFromGuesty = async () => {
    if (!selectedVisit) return
    if (!endpoints.upsertVisit) {
      setError(t('operations.missingWriteVisit'))
      return
    }
    setIsRefreshingFromGuesty(true)
    setError(null)
    try {
      const response = await refreshVisitFromGuesty(
        endpoints.upsertVisit,
        selectedVisit.id,
      )
      const item = response.item as Record<string, unknown> | undefined
      if (item) {
        const mapped = mapVisit(item)
        setVisits((current) =>
          current.map((entry) => (entry.id === mapped.id ? mapped : entry)),
        )
      } else {
        await loadVisits()
      }
      setMessage(
        response.changed
          ? t('operations.visitRefreshed')
          : t('operations.visitAlreadyInSync'),
      )
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : t('operations.unableRefreshFromGuesty'),
      )
    } finally {
      setIsRefreshingFromGuesty(false)
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
      setMessage(t('operations.taskSaved'))
      await loadPool()
      if (taskForm.visitId || selectedVisitId) {
        await loadVisitTasks(taskForm.visitId || selectedVisitId || '')
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('operations.unableSaveTask'))
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
    setMessage(t('operations.taskCompleted'))
    await loadPool()
    if (selectedVisitId) await loadVisitTasks(selectedVisitId)
  }

  const dismissTask = async (task: TaskRecord) => {
    if (!endpoints.upsertTask) return
    await saveTask(endpoints.upsertTask, { id: task.id, action: 'dismiss' })
    setMessage(t('operations.taskDismissed'))
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
    const templatesEndpoint = endpoints.visitTemplates
    if (
      !isVisitFormOpen ||
      !isCreatingVisit ||
      !visitForm.propertyId ||
      !templatesEndpoint
    ) {
      setPropertyTemplates([])
      return
    }
    void getVisitTemplatesForProperty(templatesEndpoint, visitForm.propertyId)
      .then((items) => {
        setPropertyTemplates(items)
      })
      .catch((loadError) => {
        setPropertyTemplates([])
        setError(
          loadError instanceof Error
            ? loadError.message
            : t('operations.unableLoadTemplates'),
        )
      })
  }, [
    endpoints.visitTemplates,
    isCreatingVisit,
    isVisitFormOpen,
    t,
    visitForm.propertyId,
  ])

  useEffect(() => {
    const propertyId = selectedVisit?.propertyId
    const templatesEndpoint = endpoints.visitTemplates
    const canApply =
      Boolean(propertyId) &&
      isVisitMoreInfoOpen &&
      selectedVisit?.status !== 'COMPLETED' &&
      selectedVisit?.status !== 'CANCELLED' &&
      Boolean(templatesEndpoint)

    if (!canApply || !propertyId || !templatesEndpoint) {
      setOpenVisitTemplates([])
      setOpenVisitTemplateId('')
      return
    }

    let cancelled = false
    void getVisitTemplatesForProperty(templatesEndpoint, propertyId)
      .then((items) => {
        if (!cancelled) {
          setOpenVisitTemplates(items)
        }
      })
      .catch((loadError) => {
        if (cancelled) {
          return
        }
        setOpenVisitTemplates([])
        setError(
          loadError instanceof Error
            ? loadError.message
            : t('operations.unableLoadTemplates'),
        )
      })

    return () => {
      cancelled = true
    }
  }, [
    endpoints.visitTemplates,
    isVisitMoreInfoOpen,
    selectedVisit?.propertyId,
    selectedVisit?.status,
    t,
  ])

  useEffect(() => {
    if (!isAssignVisitOpen || !assignTaskId || !endpoints.visits) {
      return
    }
    const task = poolTasks.find((entry) => entry.id === assignTaskId)
    if (!task?.propertyId) {
      return
    }
    const today = getTodayMadrid()
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
              visit.status !== 'CANCELLED' &&
              visit.scheduledDate >= today,
          )
          .sort(
            (a, b) =>
              a.scheduledDate.localeCompare(b.scheduledDate) ||
              a.scheduledStartTime.localeCompare(b.scheduledStartTime),
          )
        setAssignVisitOptions(options)
      })
      .catch(() => setAssignVisitOptions([]))
  }, [isAssignVisitOpen, assignTaskId, endpoints.visits, poolTasks])

  const pageTitle =
    mode === 'unassigned'
      ? t('pages.Unassigned tasks')
      : mode === 'templates'
        ? t('pages.Visit templates')
        : t('pages.Daily Operations')
  const pageEyebrow =
    mode === 'unassigned'
      ? t('operations.eyebrowUnassigned')
      : mode === 'templates'
        ? t('operations.eyebrowTemplates')
        : t('operations.eyebrow')
  const pageSubtitle =
    mode === 'unassigned'
      ? t('operations.subtitleUnassigned')
      : mode === 'templates'
        ? t('operations.subtitleTemplates')
        : t('operations.subtitlePage')
  const statusLabel = (status: VisitStatus) => {
    if (status === 'SCHEDULED') return t('operations.scheduled')
    if (status === 'OVERDUE') return t('operations.overdue')
    if (status === 'COMPLETED') return t('operations.completed')
    return t('operations.cancelled')
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{pageEyebrow}</p>
          <div className="page-title-row">
            <h1 className="page-title">{pageTitle}</h1>
            {mode === 'dashboard' && dashboardViewMode === 'dashboard' ? (
              <div className="operations-day-date-controls">
                <span className="operations-dashboard-date-label">
                  {formatAgendaDayLabel(getTodayMadrid())}
                </span>
                <label className="btn-ghost operations-day-calendar-btn">
                  <svg aria-hidden="true" viewBox="0 0 20 20" width="22" height="22">
                    <path
                      d="M6 2h2v2h4V2h2v2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2zm10 6H4v8h12V8z"
                      fill="currentColor"
                    />
                  </svg>
                  <input
                    className="operations-day-date-input"
                    type="date"
                    value={getTodayMadrid()}
                    onChange={(event) => goToDayView(event.target.value)}
                    aria-label={t('operations.chooseDate')}
                  />
                </label>
                <button
                  type="button"
                  className="btn-ghost operations-day-next-btn"
                  aria-label={t('operations.nextDay')}
                  title={t('operations.nextDay')}
                  onClick={() =>
                    goToDayView(addDaysToDateString(getTodayMadrid(), 1))
                  }
                >
                  <span aria-hidden="true">&gt;</span>
                </button>
              </div>
            ) : null}
          </div>
          {mode === 'dashboard' ? null : (
            <p className="subtitle">{pageSubtitle}</p>
          )}
        </div>
        <MobileBodyPortal>
          <div
            className={`page-action-bar ${
              mode === 'templates' && isMobileSearchOpen ? 'is-search-open' : ''
            }`}
          >
            {mode === 'templates' && onSearchQueryChange ? (
              <input
                className="search-input"
                placeholder={t('operations.searchTemplates')}
                type="search"
                aria-label={t('operations.searchTemplates')}
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
              />
            ) : null}
            <div className="header-actions">
              {mode === 'templates' && onToggleMobileSearch ? (
                <button
                  className={`btn-ghost btn-search-toggle ${
                    isMobileSearchOpen ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label={
                    isMobileSearchOpen
                      ? t('common.hideSearch')
                      : t('common.showSearch')
                  }
                  aria-expanded={isMobileSearchOpen}
                  onClick={onToggleMobileSearch}
                >
                  {isMobileSearchOpen ? (
                    <span aria-hidden="true">✕</span>
                  ) : (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      width="16"
                      height="16"
                    >
                      <path
                        d="M8.5 3a5.5 5.5 0 0 1 4.38 8.82l3.65 3.65-1.41 1.41-3.65-3.65A5.5 5.5 0 1 1 8.5 3zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"
                        fill="currentColor"
                      />
                    </svg>
                  )}
                </button>
              ) : null}
              {mode === 'dashboard' ? (
                <>
                  <button
                    className="btn-ghost"
                    type="button"
                    aria-label={
                      dashboardViewMode === 'dashboard'
                        ? t('operations.openDayView')
                        : t('operations.openDashboard')
                    }
                    title={
                      dashboardViewMode === 'dashboard'
                        ? t('operations.openDayView')
                        : t('operations.openDashboard')
                    }
                    onClick={() =>
                      setDashboardViewMode(
                        dashboardViewMode === 'dashboard'
                          ? 'day'
                          : 'dashboard',
                      )
                    }
                  >
                    {dashboardViewMode === 'dashboard' ? (
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
                    ) : (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        width="16"
                        height="16"
                      >
                        <path
                          d="M3 3h6v6H3V3zm8 0h6v6h-6V3zM3 11h6v6H3v-6zm8 0h6v6h-6v-6z"
                          fill="currentColor"
                        />
                      </svg>
                    )}
                  </button>
                  <button
                    className={`btn-ghost ${
                      isViewMenuOpen || dashboardViewMode !== 'dashboard'
                        ? 'is-active'
                        : ''
                    }`}
                    type="button"
                    aria-label={t('operations.changeView')}
                    aria-expanded={isViewMenuOpen}
                    onClick={() => setIsViewMenuOpen(true)}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      width="16"
                      height="16"
                    >
                      <path
                        d="M10 4C5.2 4 1.4 7.4.5 10c.9 2.6 4.7 6 9.5 6s8.6-3.4 9.5-6c-.9-2.6-4.7-6-9.5-6zm0 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm0-2.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                </>
              ) : null}
              {mode !== 'dashboard' || can(ACTION_KEYS.dailyOpsCreate) ? (
              <button
                className="btn-ghost"
                type="button"
                onClick={() => {
                  if (mode === 'unassigned') {
                    setTaskForm({ ...emptyTaskForm(), propertyId: '', visitId: '' })
                    setIsTaskFormOpen(true)
                    return
                  }
                  if (mode === 'templates') {
                    templatesPanelRef.current?.openCreate()
                    return
                  }
                  openCreateVisit()
                }}
                aria-label={
                  mode === 'unassigned'
                    ? t('operations.createTask')
                    : mode === 'templates'
                      ? t('operations.createTemplate')
                      : t('operations.createVisit')
                }
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  width="16"
                  height="16"
                >
                  <path d="M9 4h2v5h5v2h-5v5H9v-5H4V9h5V4z" fill="currentColor" />
                </svg>
              </button>
              ) : null}
              {mode === 'dashboard' ? (
                <button
                  className={`btn-ghost btn-filter ${
                    isFilterOpen ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label={t('common.filters')}
                  onClick={() => {
                    setFilterDraft({
                      teamIds: [...filters.teamIds],
                      statuses: [...filters.statuses],
                      propertyIds: [...filters.propertyIds],
                      userIds: [...filters.userIds],
                      bookingEvents: [...filters.bookingEvents],
                    })
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
                  {activeFilterCount > 0 ? (
                    <span className="filter-badge">{activeFilterCount}</span>
                  ) : null}
                </button>
              ) : null}
              {mode === 'templates' ? (
                <button
                  className={`btn-ghost btn-filter ${
                    templateFilterCount > 0 ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label={t('common.filters')}
                  onClick={() => templatesPanelRef.current?.openFilters()}
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
                  {templateFilterCount > 0 ? (
                    <span className="filter-badge">{templateFilterCount}</span>
                  ) : null}
                </button>
              ) : null}
              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  if (mode === 'unassigned') {
                    void loadPool()
                    return
                  }
                  if (mode === 'templates') {
                    void templatesPanelRef.current?.refresh()
                    return
                  }
                  if (dashboardViewMode === 'dashboard') {
                    setDashboardRefreshKey((current) => current + 1)
                    return
                  }
                  void loadVisits()
                }}
                aria-label={t('operations.refresh')}
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

      {message ? <p className="notice success">{message}</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      {mode === 'dashboard' ? (
        <>
          {dashboardViewMode !== 'day' && dashboardViewMode !== 'dashboard' ? (
          <section className="card filters-card">
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
                  {t('operations.today')}
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
                  {t('operations.tomorrow')}
                </button>
              </div>
            ) : (
              <p className="subtitle operations-view-hint">
                {t('operations.agendaHint', {
                  from: formatAgendaDayLabel(visitQueryRange.from),
                  to: formatAgendaDayLabel(visitQueryRange.to),
                })}
              </p>
            )}

            {dashboardViewMode === 'kanban' ? (
              <div className="filters-grid">
                <label>
                  {t('operations.from')}
                  <input
                    type="date"
                    value={filterDateFrom}
                    max={filterDateTo}
                    onChange={(event) => setFilterDateFrom(event.target.value)}
                  />
                </label>
                <label>
                  {t('operations.to')}
                  <input
                    type="date"
                    value={filterDateTo}
                    min={filterDateFrom}
                    onChange={(event) => setFilterDateTo(event.target.value)}
                  />
                </label>
              </div>
            ) : null}
          </section>
          ) : null}

          {isLoading && dashboardViewMode !== 'dashboard' ? (
            <p className="subtitle">Loading visits…</p>
          ) : null}

          {dashboardViewMode === 'dashboard' ? (
            <TodayView
              embedded
              refreshKey={dashboardRefreshKey}
              getEndpoint={getEndpoint}
              onNavigate={(page, options) => {
                if (page === 'Daily Operations') {
                  setDashboardViewMode('day')
                  return
                }
                onNavigate?.(page, options)
              }}
            />
          ) : dashboardViewMode === 'kanban' ? (
            <OperationsKanbanView
              columns={visitColumns}
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
              bookings={dayBookings}
              propertyById={propertyById}
              teamById={teamById}
              syncingVisitIds={syncingVisitIds}
              onDayDateChange={setDayViewDate}
              onVisitClick={setSelectedVisitId}
              onVisitTimeChange={handleVisitTimeChange}
            />
          )}
        </>
      ) : mode === 'unassigned' ? (
        <section className="card">
          <div className="page-header">
            <h2 className="section-title">{t('operations.tasksNotOnVisit')}</h2>
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
                      <td>{displayTaskTitle(i18n.language, task.title, task.titleEs)}</td>
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
          ref={templatesPanelRef}
          hideSectionHeader
          getVisitTemplatesEndpoint={endpoints.visitTemplates}
          upsertVisitTemplateEndpoint={endpoints.upsertVisitTemplate}
          propertyOptions={propertyOptions}
          teams={teams}
          users={users}
          visitTypes={visitTypes}
          searchQuery={searchQuery}
          onFilterCountChange={setTemplateFilterCount}
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

      {isViewMenuOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsViewMenuOpen(false)}
        >
          <div
            className="modal operations-view-picker-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('operations.changeView')}</h3>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsViewMenuOpen(false)}
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </div>
            <div className="modal-body operations-view-picker">
              {(
                [
                  { id: 'dashboard', label: t('operations.dashboard') },
                  { id: 'day', label: t('operations.day') },
                  { id: 'kanban', label: t('operations.kanban') },
                  { id: 'agenda', label: t('operations.agenda') },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={
                    dashboardViewMode === option.id ? 'btn-primary' : 'btn-secondary'
                  }
                  onClick={() => {
                    setDashboardViewMode(option.id)
                    setIsViewMenuOpen(false)
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {isFilterOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('common.filters')}</h3>
                <p className="modal-subtitle">{t('operations.filterSubtitle')}</p>
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
              <div className="filter-grid">
                <div className="filter-group">
                  <p className="filter-title">{t('operations.team')}</p>
                  <div className="filter-options filter-options-scroll">
                    {teams.map((team) => {
                      const isChecked = filterDraft.teamIds.includes(team.id)
                      return (
                        <label className="filter-option" key={team.id}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() =>
                              setFilterDraft((current) => ({
                                ...current,
                                teamIds: toggleListValue(current.teamIds, team.id),
                              }))
                            }
                          />
                          <span>{team.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div className="filter-group">
                  <p className="filter-title">{t('operations.status')}</p>
                  <div className="filter-options">
                    {ALL_VISIT_STATUSES.map((status) => {
                      const isChecked = filterDraft.statuses.includes(status)
                      return (
                        <label className="filter-option" key={status}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() =>
                              setFilterDraft((current) => ({
                                ...current,
                                statuses: toggleListValue(
                                  current.statuses,
                                  status,
                                ) as VisitStatus[],
                              }))
                            }
                          />
                          <span>{statusLabel(status)}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div className="filter-group">
                  <p className="filter-title">{t('operations.property')}</p>
                  <div className="filter-options filter-options-scroll">
                    {filterPropertyOptions.map((property) => {
                      const isChecked = filterDraft.propertyIds.includes(
                        property.id,
                      )
                      return (
                        <label className="filter-option" key={property.id}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() =>
                              setFilterDraft((current) => ({
                                ...current,
                                propertyIds: toggleListValue(
                                  current.propertyIds,
                                  property.id,
                                ),
                              }))
                            }
                          />
                          <span>{getPropertyLabel(property)}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div className="filter-group">
                  <p className="filter-title">{t('operations.assignedUser')}</p>
                  <div className="filter-options filter-options-scroll">
                    {users.map((user) => {
                      const isChecked = filterDraft.userIds.includes(user.id)
                      return (
                        <label className="filter-option" key={user.id}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() =>
                              setFilterDraft((current) => ({
                                ...current,
                                userIds: toggleListValue(current.userIds, user.id),
                              }))
                            }
                          />
                          <span>{user.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
                {dashboardViewMode === 'day' ? (
                  <div className="filter-group">
                    <p className="filter-title">{t('operations.bookings')}</p>
                    <div className="filter-options">
                      {(
                        [
                          {
                            id: 'check-in' as const,
                            label: t('operations.checkIns'),
                          },
                          {
                            id: 'check-out' as const,
                            label: t('operations.checkOuts'),
                          },
                        ]
                      ).map((option) => {
                        const isChecked = filterDraft.bookingEvents.includes(
                          option.id,
                        )
                        return (
                          <label className="filter-option" key={option.id}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() =>
                                setFilterDraft((current) => ({
                                  ...current,
                                  bookingEvents: toggleListValue(
                                    current.bookingEvents,
                                    option.id,
                                  ) as BookingEventKind[],
                                }))
                              }
                            />
                            <span>{option.label}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setFilterDraft(emptyOpsFilters())}
              >
                {t('common.clear')}
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  setFilters({
                    teamIds: [...filterDraft.teamIds],
                    statuses: [...filterDraft.statuses],
                    propertyIds: [...filterDraft.propertyIds],
                    userIds: [...filterDraft.userIds],
                    bookingEvents: [...filterDraft.bookingEvents],
                  })
                  setIsFilterOpen(false)
                }}
              >
                {t('common.applyFilters')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedVisit && mode === 'dashboard' ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal operations-detail-modal modal-scrollable">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{selectedVisit.title}</h3>
                <div className="operations-visit-badges">
                  <span
                    className={`status operations-visit-status ${
                      selectedVisit.status === 'OVERDUE'
                        ? 'status-warning'
                        : selectedVisit.status === 'COMPLETED'
                          ? 'status-success'
                          : selectedVisit.status === 'CANCELLED'
                            ? 'status-neutral'
                            : 'status-info'
                    }`}
                  >
                    {statusLabel(selectedVisit.status)}
                  </span>
                  {cleaningTypeBadge ? (
                    <span
                      className={`status operations-visit-status operations-cleaning-type-badge${
                        cleaningTypeBadge.pending ? ' is-pending' : ''
                      }`}
                    >
                      {cleaningTypeBadge.label}
                    </span>
                  ) : null}
                  {cleanerBadge ? (
                    <span
                      className="status operations-visit-status operations-cleaner-badge"
                      aria-label={t('cleaningPlan.cleaner')}
                    >
                      {cleanerBadge}
                    </span>
                  ) : null}
                </div>
                <p className="modal-subtitle">{selectedVisit.id}</p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setSelectedVisitId(null)}
                aria-label={t('operations.closeVisitDetail')}
              >
                ✕
              </button>
            </div>
            <div className="modal-body operations-detail-body">
              {message ? <p className="notice success">{message}</p> : null}
              {error ? <p className="notice error">{error}</p> : null}
              <div className="operations-detail-fields">
                <span className="operations-detail-plain">
                  {propertyById.get(selectedVisit.propertyId) ??
                    selectedVisit.propertyId}
                </span>
                <span className="operations-detail-plain">
                  {formatDayMonthLabel(selectedVisit.scheduledDate)}{' '}
                  {selectedVisit.scheduledStartTime} –{' '}
                  {selectedVisit.scheduledEndTime}
                </span>
                {selectedVisit.description ? (
                  <div className="operations-detail-field">
                    <span className="operations-detail-label">
                      {t('operations.description')}
                    </span>
                    <span className="operations-detail-value">
                      {selectedVisit.description}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="operations-detail-actions">
                {can(ACTION_KEYS.visitMoreInfo) ? (
                <button
                  type="button"
                  className={`btn-icon btn-icon-ghost operations-more-info-btn${
                    isVisitMoreInfoOpen ? ' is-active' : ''
                  }`}
                  aria-label={t('operations.moreInfo')}
                  aria-expanded={isVisitMoreInfoOpen}
                  title={t('operations.moreInfo')}
                  onClick={() => setIsVisitMoreInfoOpen((current) => !current)}
                >
                  i
                </button>
                ) : null}
                <button
                  type="button"
                  className="btn-icon btn-icon-ghost"
                  aria-label={t('operations.editVisit')}
                  title={t('operations.editVisit')}
                  onClick={() => openEditVisit(selectedVisit)}
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                  >
                    <path
                      d="M4 13.5V16h2.5L14.9 7.6l-2.5-2.5L4 13.5zm11.7-8.2a.7.7 0 0 0 0-1l-1.5-1.5a.7.7 0 0 0-1 0l-1.2 1.2 2.5 2.5 1.2-1.2z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
                {selectedVisit.status !== 'COMPLETED' &&
                selectedVisit.status !== 'CANCELLED' ? (
                  <>
                    <button
                      type="button"
                      className="btn-icon btn-icon-ghost"
                      disabled={visitHasOpenTasks}
                      aria-label={t('operations.completeVisit')}
                      title={
                        visitHasOpenTasks
                          ? t('operations.completeTasksFirst')
                          : t('operations.completeVisit')
                      }
                      onClick={openCompleteVisitModal}
                    >
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        width="16"
                        height="16"
                      >
                        <path
                          d="M7.8 13.4 4.6 10.2l1.4-1.4 1.8 1.8 6-6 1.4 1.4-7.4 7.4z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="btn-icon btn-icon-ghost"
                      aria-label={t('operations.createTask')}
                      title={t('operations.createTask')}
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
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        width="16"
                        height="16"
                      >
                        <path
                          d="M9 4h2v5h5v2h-5v5H9v-5H4V9h5V4z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  </>
                ) : null}
              </div>

              {isVisitMoreInfoOpen ? (
                <section
                  className="operations-more-info"
                  aria-label={t('operations.moreInfo')}
                >
                  <h4 className="section-title">{t('operations.moreInfo')}</h4>
                  <div className="operations-detail-fields">
                    <div className="operations-detail-field">
                      <span className="operations-detail-label">
                        {t('operations.assignedUser')}
                      </span>
                      <span className="operations-detail-value">
                        {userById.get(selectedVisit.assignedUserId) ||
                          selectedVisit.assignedUserId ||
                          '—'}
                      </span>
                    </div>
                    <div className="operations-detail-field">
                      <span className="operations-detail-label">
                        {t('operations.team')}
                      </span>
                      <span className="operations-detail-value">
                        {teamById.get(selectedVisit.teamId) ?? selectedVisit.teamId}
                      </span>
                    </div>
                    <div className="operations-detail-field">
                      <span className="operations-detail-label">
                        {t('operations.visitType')}
                      </span>
                      <span className="operations-detail-value">
                        {visitTypeById.get(selectedVisit.visitTypeId) ??
                          selectedVisit.visitTypeId}
                      </span>
                    </div>
                  </div>
                  {selectedVisit.status !== 'COMPLETED' &&
                  selectedVisit.status !== 'CANCELLED' ? (
                    <VisitUseTemplateControls
                      templates={openVisitTemplates}
                      selectedId={openVisitTemplateId}
                      onSelectId={setOpenVisitTemplateId}
                      onApply={() => void applyTemplateToSelectedVisit()}
                      applying={isApplyingVisitTemplate}
                    />
                  ) : null}
                  <div className="operations-more-info-actions">
                    {canRefreshVisitFromGuesty(selectedVisit) ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={isRefreshingFromGuesty}
                        onClick={() => void refreshSelectedVisitFromGuesty()}
                      >
                        {isRefreshingFromGuesty
                          ? t('operations.refreshingFromGuesty')
                          : t('operations.refreshFromGuesty')}
                      </button>
                    ) : null}
                    {selectedVisit.status !== 'COMPLETED' &&
                    selectedVisit.status !== 'CANCELLED' ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={openCancelVisitModal}
                      >
                        {t('operations.cancelVisit')}
                      </button>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <h4 className="section-title">{t('operations.tasks')}</h4>
              {visitTasks.length === 0 ? (
                <p className="operations-empty-tasks">
                  {t('operations.emptyTasksHint')}
                </p>
              ) : (
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
                        <span className="operations-task-title">
                          {displayTaskTitle(
                            i18n.language,
                            task.title,
                            task.titleEs,
                          )}
                        </span>
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
                          aria-label={t('operations.completeTask')}
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
                            aria-label={t('operations.dismissTask')}
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
              )}
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
                {visitForm.id ? t('operations.editVisit') : t('operations.createVisit')}
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
                  {t('operations.useTemplate')}
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
                    <option value="">{t('operations.noTemplate')}</option>
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
                        placeholder={t('operations.taskTitle')}
                        value={displayTaskTitle(
                          i18n.language,
                          task.title,
                          task.titleEs,
                        )}
                        onChange={(event) => {
                          const value = event.target.value
                          const spanish = isSpanishLocale(i18n.language)
                          setDraftVisitTasks((current) =>
                            current.map((entry, entryIndex) =>
                              entryIndex === index
                                ? spanish
                                  ? { ...entry, titleEs: value }
                                  : { ...entry, title: value }
                                : entry,
                            ),
                          )
                        }}
                      />
                      <input
                        placeholder={t('operations.description')}
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
                {isSavingVisitWithTasks ? t('operations.saving') : t('operations.saveVisit')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isTaskFormOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">{taskForm.id ? t('operations.editTask') : t('operations.createTask')}</h3>
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
                {visitTasks.length === 0
                  ? t('operations.cancelVisitNoTasks')
                  : t('operations.cancelVisitTasksPrompt', {
                      count: visitTasks.length,
                    })}
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
                Only open visits for today or future dates with matching property
                and team are listed.
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
