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
  addHoursToTimeString,
  formatAgendaDayLabel,
  getAgendaDateRange,
  isTerminalVisit,
  visitScheduleWriteFields,
} from './operationsViewHelpers'
import { filterPropertySelectOptions, getPropertyLabel, sortPropertyOptions } from './propertyHelpers'
import {
  resolveYallaPropertyLabel,
  yallaAliasForListingId,
} from '../../amplify/functions/shared/property-identity'
import { sortVisitTypes } from './visitTypeHelpers'
import { appendUrgentTaskTitles } from '../../amplify/functions/shared/visit-title'
import { isCleaningVisitType, isMaintenanceVisitType, requiresCompleteVisitWizard, resolveTeamIdForVisitType } from './visitTypeIds'
import { VisitTemplatesPanel, type VisitTemplatesPanelHandle } from './VisitTemplatesPanel'
import { VisitUseTemplateControls } from './VisitUseTemplateControls'
import { CollapsibleVisitTasks } from './CollapsibleVisitTasks'
import { DismissibleNotice } from './DismissibleNotice'
import { VisitTaskList } from './VisitTaskList'
import { isManagementTeam } from './teamColors'
import { displayTaskTitle } from './taskTitleDisplay'
import { ACTION_KEYS } from '../../amplify/functions/shared/rbac-catalog'
import { isEarlyCheckInEnabled } from '../../amplify/functions/shared/bookings-planner'
import { usePermissions } from '../rbac/PermissionsProvider'
import { useConfirm } from '../design/ConfirmDialog'
import type { TodayViewMode } from '../nav/todayViews'
import {
  buildApplyTemplateVisitPayload,
  emptyDraftTask,
  taskRecordToDraft,
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
import { isResolvedTaskStatus } from './types'
import { YlIcon } from '../design/icons'

type OpsMode = 'dashboard' | 'unassigned' | 'templates'

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
  dashboardViewMode?: TodayViewMode
  onDashboardViewModeChange?: (mode: TodayViewMode) => void
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

const DEFAULT_BOOKING_EVENTS: BookingEventKind[] = ['check-in', 'check-out']

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
  startTimeByVisitId: Record<string, string>
  durationHoursByVisitId: Record<string, number>
}

type MaintenancePlanDayLookup = {
  status: 'READY' | 'DRAFT'
  agentIdByVisitId: Record<string, string>
  visitIds: string[]
}

const durationHoursFromPlanRow = (item: Record<string, unknown>) => {
  const direct = Number(item.durationHours)
  if (Number.isFinite(direct) && direct > 0) {
    return direct
  }
  const types = Array.isArray(item.cleaningTypes) ? item.cleaningTypes : []
  const typeId = String(item.cleaningTypeId ?? '').trim()
  const matched = types.find((entry) => {
    const row = (entry ?? {}) as Record<string, unknown>
    return String(row.id ?? '').trim() === typeId
  }) as Record<string, unknown> | undefined
  const fromType = Number(matched?.durationHours)
  return Number.isFinite(fromType) && fromType > 0 ? fromType : 0
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
  const id = String(item.id ?? '')
  const nicknameRaw = String(item.nickname ?? item.Nickname ?? '')
  const listingNickname = String(
    item.ListingNickname ?? item.listingNickname ?? '',
  )
  const title = String(item.title ?? '')

  return {
    id,
    nickname: resolveYallaPropertyLabel({
      id,
      nickname: nicknameRaw,
      listingNickname,
      title,
    }),
    title,
    listingNickname,
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

const asRecordDisplay = (item: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
  }
  return ''
}

const nightsBetweenDates = (checkIn: string, checkOut: string) => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)
  ) {
    return ''
  }
  const start = Date.parse(`${checkIn}T00:00:00`)
  const end = Date.parse(`${checkOut}T00:00:00`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return ''
  }
  return String(Math.round((end - start) / 86_400_000))
}

const asRecordBoolean = (item: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (item[key] === true) {
      return true
    }
  }
  return false
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
  const alias = yallaAliasForListingId(listingId)
  const nick = (alias || listingNickname).trim().toLowerCase()
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
  comments: String(item.comments ?? ''),
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
  descriptionEs:
    typeof item.descriptionEs === 'string' && item.descriptionEs.trim()
      ? item.descriptionEs
      : undefined,
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
  dashboardViewMode: dashboardViewModeProp,
  onDashboardViewModeChange,
}: Props) {
  const { t, i18n } = useTranslation()
  const { can } = usePermissions()
  const confirmAction = useConfirm()
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
  const maintenancePlanInflight = useRef(new Set<string>())
  const [cleaningPlansByDate, setCleaningPlansByDate] = useState<
    Record<string, CleaningPlanDayLookup>
  >({})
  const [maintenancePlansByDate, setMaintenancePlansByDate] = useState<
    Record<string, MaintenancePlanDayLookup>
  >({})
  const [cleanerNameById, setCleanerNameById] = useState<Map<string, string>>(
    () => new Map(),
  )
  const [agentNameById, setAgentNameById] = useState<Map<string, string>>(
    () => new Map(),
  )
  const [internalDashboardViewMode, setInternalDashboardViewMode] =
    useState<TodayViewMode>('dashboard')
  const dashboardViewMode = dashboardViewModeProp ?? internalDashboardViewMode
  const setDashboardViewMode = (mode: TodayViewMode) => {
    onDashboardViewModeChange?.(mode)
    if (dashboardViewModeProp === undefined) {
      setInternalDashboardViewMode(mode)
    }
  }
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0)
  const [templateFilterCount, setTemplateFilterCount] = useState(0)
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
  const [editVisitTaskIds, setEditVisitTaskIds] = useState<string[]>([])
  const [editingDraftIndex, setEditingDraftIndex] = useState<number | null>(null)
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
  const [commentsDraft, setCommentsDraft] = useState('')

  const isCreatingVisit = !visitForm.id
  const isCreatingTask = !taskForm.id
  const canCreateTasks = can(ACTION_KEYS.createTasks)

  const visitHasOpenTasks = useMemo(
    () => visitTasks.some((task) => !isResolvedTaskStatus(task.status)),
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
      upsertPlannerFields: getEndpoint(
        'upsertBookingPlannerFieldsUrl',
        import.meta.env.VITE_UPSERT_BOOKING_PLANNER_FIELDS_URL,
      ),
      cleaningPlan: getEndpoint(
        'getCleaningPlanUrl',
        import.meta.env.VITE_GET_CLEANING_PLAN_URL,
      ),
      cleaners: getEndpoint(
        'getCleanersUrl',
        import.meta.env.VITE_GET_CLEANERS_URL,
      ),
      maintenancePlan: getEndpoint(
        'getMaintenancePlanUrl',
        import.meta.env.VITE_GET_MAINTENANCE_PLAN_URL,
      ),
      maintenanceAgents: getEndpoint(
        'getMaintenanceAgentsUrl',
        import.meta.env.VITE_GET_MAINTENANCE_AGENTS_URL,
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
  const propertiesById = useMemo(
    () => new Map(propertyOptions.map((property) => [property.id, property])),
    [propertyOptions],
  )
  const sortedVisitTypes = useMemo(() => sortVisitTypes(visitTypes), [visitTypes])

  const visitTypeById = useMemo(
    () => new Map(visitTypes.map((type) => [type.id, type.name])),
    [visitTypes],
  )

  const overlayVisitWithCleaningPlan = useCallback(
    (visit: VisitRecord) => {
      const plan = cleaningPlansByDate[visit.scheduledDate]
      if (!plan) {
        return visit
      }
      const plannedStart = plan.startTimeByVisitId[visit.id]?.trim()
      const durationHours = plan.durationHoursByVisitId[visit.id] ?? 0
      const shouldApplyStart = plan.status === 'READY' && Boolean(plannedStart)
      const shouldApplyDuration = durationHours > 0
      if (!shouldApplyStart && !shouldApplyDuration) {
        return visit
      }
      const startTime = shouldApplyStart
        ? plannedStart
        : visit.scheduledStartTime
      if (!startTime) {
        return visit
      }
      const endTime = shouldApplyDuration
        ? addHoursToTimeString(startTime, durationHours)
        : visit.scheduledEndTime
      return {
        ...visit,
        scheduledStartTime: startTime,
        scheduledEndTime: endTime || visit.scheduledEndTime,
        estimatedDurationMinutes: shouldApplyDuration
          ? Math.round(durationHours * 60)
          : visit.estimatedDurationMinutes,
      }
    },
    [cleaningPlansByDate],
  )

  const filteredVisits = useMemo(() => {
    return visits
      .map(overlayVisitWithCleaningPlan)
      .filter((visit) => {
      if (filters.teamIds.length === 0) {
        if (isManagementTeam(visit.teamId, teamById)) {
          return false
        }
      } else if (!filters.teamIds.includes(visit.teamId)) {
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
  }, [visits, filters, teamById, overlayVisitWithCleaningPlan])

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

  const selectedVisit = useMemo(() => {
    const match = visits.find((visit) => visit.id === selectedVisitId)
    return match ? overlayVisitWithCleaningPlan(match) : null
  }, [visits, selectedVisitId, overlayVisitWithCleaningPlan])

  const cleaningTypeBadge = useMemo(() => {
    if (
      !selectedVisit ||
      !isCleaningVisitType(selectedVisit.visitTypeId)
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
      !isCleaningVisitType(selectedVisit.visitTypeId)
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

  const maintenanceAssigneeBadge = useMemo(() => {
    if (
      !selectedVisit ||
      isCleaningVisitType(selectedVisit.visitTypeId)
    ) {
      return null
    }
    const plan = maintenancePlansByDate[selectedVisit.scheduledDate]
    const isOnPlan = Boolean(plan?.visitIds.includes(selectedVisit.id))
    const agentId = plan?.agentIdByVisitId?.[selectedVisit.id]?.trim() ?? ''
    if (!isMaintenanceVisitType(selectedVisit.visitTypeId) && !isOnPlan) {
      return null
    }
    if (plan?.status === 'READY' && agentId) {
      const name = agentNameById.get(agentId)?.trim()
      if (name) {
        return { pending: false, label: name }
      }
    }
    if (isMaintenanceVisitType(selectedVisit.visitTypeId) || isOnPlan) {
      return {
        pending: true,
        label: t('operations.cleaningTypePending'),
      }
    }
    return null
  }, [agentNameById, maintenancePlansByDate, selectedVisit, t])

  const loadReferenceData = useCallback(async () => {
    if (!endpoints.teams || !endpoints.users || !endpoints.visitTypes) {
      setError(t('operations.missingOperationsEndpoints'))
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
      setError(t('operations.unableLoadVisits'))
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
            reservationId,
            guestName: guestName || listingNickname || reservationId,
            guests: asRecordDisplay(record, ['Guests', 'guests', 'GuestCount']),
            nights:
              asRecordDisplay(record, ['Nights', 'nights']) ||
              nightsBetweenDates(checkInDate, checkOutDate),
            giftCard: asRecordDisplay(record, ['GiftCard', 'giftCard']),
            linen: asRecordDisplay(record, ['Linen', 'linen']),
            earlyCheckIn:
              asRecordBoolean(record, ['EarlyCheckInOn', 'earlyCheckInOn']) ||
              isEarlyCheckInEnabled(
                asRecordString(record, ['EarlyCheckIn', 'earlyCheckIn']),
              ),
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
            reservationId,
            guestName: guestName || listingNickname || reservationId,
            guests: asRecordDisplay(record, ['Guests', 'guests', 'GuestCount']),
            nights:
              asRecordDisplay(record, ['Nights', 'nights']) ||
              nightsBetweenDates(checkInDate, checkOutDate),
            giftCard: asRecordDisplay(record, ['GiftCard', 'giftCard']),
            linen: asRecordDisplay(record, ['Linen', 'linen']),
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

  const handleEarlyCheckInChange = useCallback(
    async (booking: DayBookingEvent, enabled: boolean) => {
      const reservationId = booking.reservationId?.trim()
      if (!reservationId || !endpoints.upsertPlannerFields) {
        return
      }
      setDayBookings((current) =>
        current.map((entry) =>
          entry.id === booking.id ? { ...entry, earlyCheckIn: enabled } : entry,
        ),
      )
      try {
        await fetchJson(endpoints.upsertPlannerFields, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            reservationId,
            earlyCheckInOn: enabled,
          }),
        })
      } catch (saveError) {
        setDayBookings((current) =>
          current.map((entry) =>
            entry.id === booking.id
              ? { ...entry, earlyCheckIn: booking.earlyCheckIn }
              : entry,
          ),
        )
        setError(t('operations.unableSaveEarlyCheckIn'))
      }
    },
    [endpoints.upsertPlannerFields, t],
  )

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
      setError(t('operations.unableLoadTasks'))
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
      const next = propertyOptionsProp.map((property) => ({
        ...property,
        nickname: resolveYallaPropertyLabel(property),
        mtlPrincipalId:
          property.mtlPrincipalId?.trim() ||
          previousById.get(property.id)?.mtlPrincipalId,
      }))
      if (
        current.length === next.length &&
        current.every(
          (item, index) =>
            item.id === next[index]?.id &&
            item.nickname === next[index]?.nickname &&
            item.listingNickname === next[index]?.listingNickname &&
            item.mtlPrincipalId === next[index]?.mtlPrincipalId,
        )
      ) {
        return current
      }
      return next
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
    setCommentsDraft(selectedVisit?.comments ?? '')
  }, [selectedVisit?.id, selectedVisit?.comments])

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
    const endpoint = endpoints.maintenanceAgents
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
        setAgentNameById(
          new Map(
            (payload.items ?? [])
              .map((item) => {
                const id = String(item.id ?? item.userId ?? '').trim()
                const name = String(item.name ?? '').trim()
                return [id, name] as const
              })
              .filter((entry) => entry[0] && entry[1]),
          ),
        )
      })
      .catch(() => {
        if (!cancelled) {
          setAgentNameById(new Map())
        }
      })
    return () => {
      cancelled = true
    }
  }, [endpoints.maintenanceAgents])

  useEffect(() => {
    if (mode !== 'dashboard') {
      return
    }
    const endpoint = endpoints.cleaningPlan
    if (!endpoint) {
      return
    }
    const dates = [
      ...new Set(
        [
          ...visitQueryRange.dates,
          selectedVisit && isCleaningVisitType(selectedVisit.visitTypeId)
            ? selectedVisit.scheduledDate.trim()
            : '',
        ].filter(Boolean),
      ),
    ]
    for (const date of dates) {
      if (cleaningPlansByDate[date] || cleaningPlanInflight.current.has(date)) {
        continue
      }
      cleaningPlanInflight.current.add(date)
      void fetchJson<{
        status?: string
        rows?: Record<string, unknown>[]
      }>(`${endpoint}?date=${encodeURIComponent(date)}`)
        .then((payload) => {
          const typeNameByVisitId: Record<string, string> = {}
          const cleanerIdByVisitId: Record<string, string> = {}
          const startTimeByVisitId: Record<string, string> = {}
          const durationHoursByVisitId: Record<string, number> = {}
          for (const row of payload.rows ?? []) {
            const visitId = String(row.visitId ?? '').trim()
            if (!visitId) {
              continue
            }
            const name = cleaningTypeNameFromPlanRow(row)
            if (name) {
              typeNameByVisitId[visitId] = name
            }
            const cleanerId = String(row.cleanerId ?? '').trim()
            if (cleanerId) {
              cleanerIdByVisitId[visitId] = cleanerId
            }
            const startTime = String(row.startTime ?? '').trim()
            if (startTime) {
              startTimeByVisitId[visitId] = startTime
            }
            const durationHours = durationHoursFromPlanRow(row)
            if (durationHours > 0) {
              durationHoursByVisitId[visitId] = durationHours
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
              startTimeByVisitId,
              durationHoursByVisitId,
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
              startTimeByVisitId: {},
              durationHoursByVisitId: {},
            },
          }))
        })
        .finally(() => {
          cleaningPlanInflight.current.delete(date)
        })
    }
  }, [
    cleaningPlansByDate,
    endpoints.cleaningPlan,
    mode,
    selectedVisit,
    visitQueryRange.dates,
  ])

  useEffect(() => {
    if (mode !== 'dashboard' || !selectedVisit) {
      return
    }
    if (isCleaningVisitType(selectedVisit.visitTypeId)) {
      return
    }
    const date = selectedVisit.scheduledDate.trim()
    const endpoint = endpoints.maintenancePlan
    if (!date || !endpoint) {
      return
    }
    if (
      maintenancePlansByDate[date] ||
      maintenancePlanInflight.current.has(date)
    ) {
      return
    }
    maintenancePlanInflight.current.add(date)
    void fetchJson<{
      status?: string
      rows?: Record<string, unknown>[]
    }>(`${endpoint}?date=${encodeURIComponent(date)}`)
      .then((payload) => {
        const agentIdByVisitId: Record<string, string> = {}
        const visitIds: string[] = []
        for (const row of payload.rows ?? []) {
          const visitId = String(row.visitId ?? '').trim()
          if (!visitId) {
            continue
          }
          visitIds.push(visitId)
          const agentId = String(row.agentId ?? '').trim()
          if (agentId) {
            agentIdByVisitId[visitId] = agentId
          }
        }
        setMaintenancePlansByDate((current) => ({
          ...current,
          [date]: {
            status:
              String(payload.status ?? 'DRAFT').toUpperCase() === 'READY'
                ? 'READY'
                : 'DRAFT',
            agentIdByVisitId,
            visitIds,
          },
        }))
      })
      .catch(() => {
        setMaintenancePlansByDate((current) => ({
          ...current,
          [date]: {
            status: 'DRAFT',
            agentIdByVisitId: {},
            visitIds: [],
          },
        }))
      })
      .finally(() => {
        maintenancePlanInflight.current.delete(date)
      })
  }, [
    endpoints.maintenancePlan,
    maintenancePlansByDate,
    mode,
    selectedVisit,
  ])

  const openCreateVisit = () => {
    setVisitForm(emptyVisitForm())
    setSelectedTemplateId('')
    setDraftVisitTasks([])
    setEditVisitTaskIds([])
    setEditingDraftIndex(null)
    setPropertyTemplates([])
    setIsVisitFormOpen(true)
  }

  const openFilters = () => {
    setFilterDraft({
      teamIds: [...filters.teamIds],
      statuses: [...filters.statuses],
      propertyIds: [...filters.propertyIds],
      userIds: [...filters.userIds],
      bookingEvents: [...filters.bookingEvents],
    })
    setIsFilterOpen(true)
  }

  const openCreateVisitAtCell = (propertyId: string, scheduledDate: string) => {
    setVisitForm({
      ...emptyVisitForm(),
      propertyId,
      scheduledDate,
    })
    setSelectedTemplateId('')
    setDraftVisitTasks([])
    setEditVisitTaskIds([])
    setEditingDraftIndex(null)
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
    setEditingDraftIndex(null)
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
    } catch (applyError) {
      setError(t('operations.unableApplyTemplate'))
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
    const editableTasks = visitTasks.filter(
      (task) => task.status !== 'CANCELLED' && task.status !== 'DISMISS',
    )
    setDraftVisitTasks(editableTasks.map(taskRecordToDraft))
    setEditVisitTaskIds(editableTasks.map((task) => task.id))
    setEditingDraftIndex(null)
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
          property ? getPropertyLabel(property) : 'Property'
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
        property ? getPropertyLabel(property) : 'Property'
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
      .filter(
        (draft) => !draft.id && (draft.title.trim() || draft.titleEs?.trim()),
      )
      .map((draft) => ({
        title: draft.title.trim() || draft.titleEs?.trim() || '',
        titleEs: draft.titleEs?.trim() || undefined,
        description: draft.description,
        descriptionEs: draft.descriptionEs?.trim() || undefined,
        priority: draft.urgent ? 'URGENT' : 'MEDIUM',
      }))
    payload.title = appendUrgentTaskTitles(
      title,
      [
        ...tasksToCreate.filter((task) => task.priority === 'URGENT').map((task) => task.title),
        ...pendingDraftTasks
          .filter((draft) => draft.id && draft.urgent)
          .map((draft) => draft.title.trim() || draft.titleEs?.trim() || ''),
      ].filter(Boolean),
    )

    if (tasksToCreate.length > 0 && (isCreatingVisit || canCreateTasks)) {
      payload.tasks = tasksToCreate
      if (!isCreatingVisit) {
        payload.appendTasks = true
      }
    }

    const hasBulkTasks =
      tasksToCreate.length > 0 && (isCreatingVisit || canCreateTasks)

    try {
      if (hasBulkTasks) {
        setIsSavingVisitWithTasks(true)
      }
      const response = await saveVisit(endpoints.upsertVisit, payload)
      const savedItem = response.item as Record<string, unknown> | undefined
      const mapped = savedItem ? mapVisit(savedItem) : null

      if (mapped && isCreatingVisit) {
        setVisits((current) => {
          const withoutDuplicate = current.filter((visit) => visit.id !== mapped.id)
          return [...withoutDuplicate, mapped]
        })
      }

      if (!isCreatingVisit && endpoints.upsertTask) {
        const keptIds = new Set(
          pendingDraftTasks
            .map((draft) => draft.id)
            .filter((id): id is string => Boolean(id)),
        )
        const idsToDelete = editVisitTaskIds.filter((id) => !keptIds.has(id))
        for (const taskId of idsToDelete) {
          await saveTask(endpoints.upsertTask, { id: taskId, action: 'delete' })
        }
        for (const draft of pendingDraftTasks) {
          if (!draft.id || !(draft.title.trim() || draft.titleEs?.trim())) {
            continue
          }
          await saveTask(endpoints.upsertTask, {
            id: draft.id,
            visitId: visitForm.id,
            title: draft.title.trim() || draft.titleEs?.trim() || '',
            titleEs: draft.titleEs?.trim() || undefined,
            description: draft.description,
            descriptionEs: draft.descriptionEs?.trim() || undefined,
            priority: draft.urgent ? 'URGENT' : 'MEDIUM',
            ...(draft.status ? { status: draft.status } : {}),
          })
        }
      }

      setIsVisitFormOpen(false)
      setSelectedTemplateId('')
      setDraftVisitTasks([])
      setEditVisitTaskIds([])
      clearTodaySummaryCache()
      setDashboardRefreshKey((current) => current + 1)
      if (!mapped || !isCreatingVisit) {
        await loadVisits()
      }
      if (!isCreatingVisit && selectedVisitId) {
        await loadVisitTasks(selectedVisitId)
      }
    } catch (saveError) {
      setError(t('operations.unableSaveVisit'))
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
    } catch (rescheduleError) {
      setVisits((current) =>
        current.map((entry) => (entry.id === visitId ? previous : entry)),
      )
      setError(t('operations.unableUpdateVisit'))
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
      setError(t('operations.unableUpdateVisit'))
    } finally {
      markVisitSyncing(visitId, false)
    }
  }

  const openCompleteVisitModal = () => {
    if (!selectedVisit) return
    if (visitHasOpenTasks) {
      setError(t('operations.completeTasksFirst'))
      return
    }
    if (!requiresCompleteVisitWizard(selectedVisit.visitTypeId)) {
      void updateVisitStatus(selectedVisit, 'COMPLETED', {
        comments: commentsDraft,
      })
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
      setError(t('operations.enterValidHours'))
      return
    }
    if (visitHasOpenTasks) {
      setError(t('operations.completeTasksFirst'))
      return
    }
    await updateVisitStatus(selectedVisit, 'COMPLETED', {
      actualDurationHours: hours,
      appliesToHourBank: completeVisitForm.poolOfHours,
      specialHours: completeVisitForm.specialHours,
      comments: commentsDraft,
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
      setError(t('operations.cancelVisitConfirmNeeded'))
      return
    }
    const cancelTaskAction =
      visitTasks.length > 0 ? cancelVisitForm.taskAction : undefined
    await updateVisitStatus(
      selectedVisit,
      'CANCELLED',
      cancelTaskAction ? { cancelTaskAction } : undefined,
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
  ) => {
    if (!endpoints.upsertVisit) return
    const closedBy = await getCurrentUserEmail()
    try {
      await saveVisit(endpoints.upsertVisit, {
        id: visit.id,
        status,
        closedBy,
        ...(status === 'COMPLETED' || status === 'CANCELLED'
          ? visitScheduleWriteFields(visit)
          : {}),
        ...extra,
      })
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
      setError(t('operations.unableUpdateVisit'))
    }
  }

  const persistVisitComments = async () => {
    if (!selectedVisit || !endpoints.upsertVisit) return
    if (
      selectedVisit.status === 'COMPLETED' ||
      selectedVisit.status === 'CANCELLED'
    ) {
      return
    }
    const nextComments = commentsDraft
    if (nextComments === (selectedVisit.comments ?? '')) return
    try {
      await saveVisit(endpoints.upsertVisit, {
        id: selectedVisit.id,
        comments: nextComments,
      })
      setVisits((current) =>
        current.map((entry) =>
          entry.id === selectedVisit.id
            ? { ...entry, comments: nextComments }
            : entry,
        ),
      )
    } catch (saveError) {
      setError(t('operations.unableUpdateVisit'))
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
    } catch (refreshError) {
      setError(t('operations.unableRefreshFromGuesty'))
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
      await loadPool()
      if (taskForm.visitId || selectedVisitId) {
        const visitId = taskForm.visitId || selectedVisitId || ''
        await loadVisitTasks(visitId)
        if (endpoints.visits && visitId) {
          const visitPayload = await getVisitById(endpoints.visits, visitId).catch(
            () => null,
          )
          const item = visitPayload?.item as Record<string, unknown> | undefined
          if (item) {
            const mapped = mapVisit(item)
            setVisits((current) =>
              current.map((entry) => (entry.id === mapped.id ? mapped : entry)),
            )
          }
        }
      }
    } catch (saveError) {
      setError(t('operations.unableSaveTask'))
    }
  }

  const deleteTask = async () => {
    if (!endpoints.upsertTask || !taskForm.id) return
    if (!(await confirmAction({
      title: t('common.delete'),
      message: t('operations.deleteTaskConfirm'),
      confirmLabel: t('common.delete'),
      destructive: true,
    }))) return
    try {
      await saveTask(endpoints.upsertTask, { id: taskForm.id, action: 'delete' })
      setIsTaskFormOpen(false)
      await loadPool()
    } catch (deleteError) {
      setError(t('operations.unableSaveTask'))
    }
  }

  const completeTask = async (task: TaskRecord) => {
    if (!endpoints.upsertTask) return
    try {
      const closedBy = await getCurrentUserEmail()
      await saveTask(endpoints.upsertTask, {
        id: task.id,
        status: 'COMPLETED',
        closedBy,
        visitId: task.visitId,
      })
      await loadPool()
      if (selectedVisitId) await loadVisitTasks(selectedVisitId)
    } catch {
      setError(t('operations.unableSaveTask'))
    }
  }

  const dismissTask = async (task: TaskRecord) => {
    if (!endpoints.upsertTask) return
    try {
      await saveTask(endpoints.upsertTask, { id: task.id, action: 'dismiss' })
      await loadPool()
      if (selectedVisitId) await loadVisitTasks(selectedVisitId)
    } catch {
      setError(t('operations.unableSaveTask'))
    }
  }

  const skipTask = async (task: TaskRecord) => {
    if (!endpoints.upsertTask) return
    try {
      await saveTask(endpoints.upsertTask, {
        id: task.id,
        action: 'skip',
        status: 'SKIPPED',
        visitId: task.visitId,
      })
      await loadPool()
      if (selectedVisitId) await loadVisitTasks(selectedVisitId)
    } catch {
      setError(t('operations.unableSaveTask'))
    }
  }

  const handleSkipTask = async (task: TaskRecord) => {
    setDismissingTaskId(task.id)
    try {
      await skipTask(task)
    } finally {
      setDismissingTaskId(null)
    }
  }

  const assignTaskToVisit = async () => {
    if (!endpoints.upsertTask || !assignTaskId || !assignVisitId) return
    try {
      await saveTask(endpoints.upsertTask, {
        id: assignTaskId,
        action: 'assign',
        assignVisitId,
      })
      setIsAssignVisitOpen(false)
      await loadPool()
      if (selectedVisitId) await loadVisitTasks(selectedVisitId)
      await loadVisits()
    } catch {
      setError(t('operations.unableSaveTask'))
    }
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
      .catch(() => {
        setPropertyTemplates([])
        setError(t('operations.unableLoadTemplates'))
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
      .catch(() => {
        if (cancelled) {
          return
        }
        setOpenVisitTemplates([])
        setError(t('operations.unableLoadTemplates'))
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
        : ''
  const pageSubtitle =
    mode === 'unassigned'
      ? t('operations.subtitleUnassigned')
      : mode === 'templates'
        ? t('operations.subtitleTemplates')
        : ''
  const statusLabel = (status: VisitStatus) => {
    if (status === 'SCHEDULED') return t('operations.statusScheduled')
    if (status === 'OVERDUE') return t('operations.overdue')
    if (status === 'COMPLETED') return t('operations.completed')
    return t('operations.cancelled')
  }

  const errorNotice = error ? (
    <DismissibleNotice
      dismissLabel={t('common.close')}
      onDismiss={() => setError(null)}
    >
      {error}
    </DismissibleNotice>
  ) : null

  const visitWorkModalOpen = Boolean(selectedVisitId)
  const stackedVisitModalOpen =
    isVisitFormOpen ||
    isCompleteVisitOpen ||
    isCancelVisitOpen ||
    isTaskFormOpen ||
    isAssignVisitOpen
  const isDayTimeline = mode === 'dashboard' && dashboardViewMode === 'day'

  return (
    <>
      {isDayTimeline ? null : (
      <header className={`page-header${mode === 'dashboard' ? ' page-header--no-title' : ''}`}>
        {mode !== 'dashboard' ? (
        <div className="page-header-leading">
          <div className="page-title-row">
            <h1 className="page-title">{pageTitle}</h1>
          </div>
          <p className="subtitle">{pageSubtitle}</p>
        </div>
        ) : null}
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
                    <YlIcon name="xmark" size={16} />
                  ) : (
                    <YlIcon name="magnifyingglass" size={16} />
                  )}
                </button>
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
                <YlIcon name="plus" size={16} />
              </button>
              ) : null}
              {mode === 'dashboard' ? (
                <button
                  className={`btn-ghost btn-filter ${
                    isFilterOpen ? 'is-active' : ''
                  }`}
                  type="button"
                  aria-label={t('common.filters')}
                  onClick={openFilters}
                >
                  <YlIcon name="line.3.horizontal.decrease" size={16} />
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
                  <YlIcon name="line.3.horizontal.decrease" size={16} />
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
                <YlIcon name="arrow.clockwise" size={16} />
              </button>
            </div>
          </div>
        </MobileBodyPortal>
      </header>
      )}

      {!visitWorkModalOpen && !stackedVisitModalOpen ? errorNotice : null}

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
            <p className="subtitle">{t('common.loading')}</p>
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
              propertiesById={propertiesById}
              teamById={teamById}
              syncingVisitIds={syncingVisitIds}
              onDayDateChange={setDayViewDate}
              onVisitClick={setSelectedVisitId}
              onVisitTimeChange={handleVisitTimeChange}
              onEarlyCheckInChange={handleEarlyCheckInChange}
              canCreateVisit={can(ACTION_KEYS.dailyOpsCreate)}
              onCreateVisit={openCreateVisit}
              onOpenFilters={openFilters}
              activeFilterCount={activeFilterCount}
              filtersActive={isFilterOpen}
            />
          )}
        </>
      ) : mode === 'unassigned' ? (
        <section className="card">
          <div className="page-header">
            <h2 className="section-title">{t('operations.tasksNotOnVisit')}</h2>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.title')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.property')}</th>
                  <th>{t('operations.team')}</th>
                  <th>{t('operations.priority')}</th>
                  <th>{t('operations.created')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {poolTasks.length === 0 ? (
                  <tr>
                    <td colSpan={7}>{t('operations.emptyUnassigned')}</td>
                  </tr>
                ) : (
                  poolTasks.map((task) => (
                    <tr key={task.id}>
                      <td data-label={t('common.title')}>{displayTaskTitle(i18n.language, task.title, task.titleEs)}</td>
                      <td data-label={t('common.status')}>{task.status}</td>
                      <td data-label={t('common.property')}>{propertyById.get(task.propertyId) ?? task.propertyId}</td>
                      <td data-label={t('operations.team')}>{teamById.get(task.teamId) ?? task.teamId}</td>
                      <td data-label={t('operations.priority')}>{task.priority}</td>
                      <td data-label={t('operations.created')}>{formatTaskCreatedDate(task.createdAt)}</td>
                      <td className="table-actions" data-label={t('common.actions')}>
                        <div className="action-buttons">
                        <button
                          type="button"
                          className="btn-icon btn-icon-ghost"
                          aria-label={t('operations.assignTask')}
                          title={t('operations.assignTask')}
                          onClick={() => {
                            setAssignTaskId(task.id)
                            setAssignVisitId('')
                            setIsAssignVisitOpen(true)
                          }}
                        >
                          <YlIcon name="square.and.arrow.up" size={16} />
                        </button>
                        {can(ACTION_KEYS.unassignedTasksEdit) ? (
                          <button
                            type="button"
                            className="btn-icon btn-icon-ghost"
                            aria-label={t('operations.editTask')}
                            title={t('operations.editTask')}
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
                            <YlIcon name="pencil" size={16} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn-icon btn-icon-ghost"
                          aria-label={t('operations.completeTask')}
                          title={t('operations.completeTask')}
                          onClick={() => void completeTask(task)}
                        >
                          <YlIcon name="checkmark" size={16} />
                        </button>
                        {task.status !== 'DISMISS' ? (
                          <button
                            type="button"
                            className="btn-icon btn-icon-ghost"
                            aria-label={t('operations.dismissTask')}
                            title={t('operations.dismissTask')}
                            onClick={() => void dismissTask(task)}
                          >
                            <YlIcon name="xmark" size={16} />
                          </button>
                        ) : null}
                        </div>
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
          onMessage={() => undefined}
          onError={(value) => {
            setError(value)
          }}
        />
      )}

      {isFilterOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-scrollable">
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
                <YlIcon name="xmark" size={16} />
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
        <div className="modal-overlay yl-visit-sheet" role="dialog" aria-modal="true">
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
                  {maintenanceAssigneeBadge ? (
                    <span
                      className={`status operations-visit-status operations-cleaning-type-badge${
                        maintenanceAssigneeBadge.pending ? ' is-pending' : ''
                      }`}
                    >
                      {maintenanceAssigneeBadge.label}
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setSelectedVisitId(null)}
                aria-label={t('operations.closeVisitDetail')}
              >
                <YlIcon name="xmark" size={16} />
              </button>
            </div>
            <div className="modal-body operations-detail-body">
              {visitWorkModalOpen && !stackedVisitModalOpen ? errorNotice : null}
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
                  <YlIcon name="info.circle" size={14} />
                </button>
                ) : null}
                <button
                  type="button"
                  className="btn-icon btn-icon-ghost"
                  aria-label={t('operations.editVisit')}
                  title={t('operations.editVisit')}
                  onClick={() => openEditVisit(selectedVisit)}
                >
                  <YlIcon name="pencil" size={16} />
                </button>
                {selectedVisit.status !== 'COMPLETED' &&
                selectedVisit.status !== 'CANCELLED' ? (
                  <>
                    <button
                      type="button"
                      className="btn-icon btn-icon-ghost operations-complete-visit-btn"
                      disabled={visitHasOpenTasks}
                      aria-label={t('operations.completeVisit')}
                      title={
                        visitHasOpenTasks
                          ? t('operations.completeTasksFirst')
                          : t('operations.completeVisit')
                      }
                      onClick={openCompleteVisitModal}
                    >
                      <YlIcon name="checkmark" size={16} />
                    </button>
                    {canCreateTasks ? (
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
                      <YlIcon name="plus" size={16} />
                    </button>
                    ) : null}
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
                        {t('operations.visitId')}
                      </span>
                      <span className="operations-detail-value">
                        {selectedVisit.id}
                      </span>
                    </div>
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

              <CollapsibleVisitTasks
                title={t('operations.tasks')}
                badgeCount={
                  visitTasks.filter((task) => !isResolvedTaskStatus(task.status))
                    .length
                }
                badgeLabel={t('operations.draftTasksCount', {
                  count: visitTasks.filter(
                    (task) => !isResolvedTaskStatus(task.status),
                  ).length,
                })}
              >
                <VisitTaskList
                  mode="work"
                  tasks={visitTasks}
                  emptyLabel={t('operations.emptyTasksHint')}
                  visitOverdue={selectedVisit.status === 'OVERDUE'}
                  visitClosed={
                    selectedVisit.status === 'COMPLETED' ||
                    selectedVisit.status === 'CANCELLED'
                  }
                  canAct={Boolean(endpoints.upsertTask)}
                  skippingId={dismissingTaskId ?? undefined}
                  onComplete={(task) => void completeTask(task)}
                  onSkip={(task) => void handleSkipTask(task)}
                />
              </CollapsibleVisitTasks>
              <label className="full-width operations-visit-comments">
                {t('operations.comments')}
                <textarea
                  className="visit-create-description"
                  rows={2}
                  value={commentsDraft}
                  placeholder={t('operations.comments')}
                  readOnly={
                    selectedVisit.status === 'COMPLETED' ||
                    selectedVisit.status === 'CANCELLED'
                  }
                  onChange={(event) => setCommentsDraft(event.target.value)}
                  onBlur={() => void persistVisitComments()}
                />
              </label>
            </div>
          </div>
        </div>
      ) : null}

      {isVisitFormOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-wide modal-scrollable">
            <div className="modal-header">
              <h3 className="modal-title">
                {visitForm.id ? t('operations.editVisit') : t('operations.createVisit')}
              </h3>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsVisitFormOpen(false)}
              >
                <YlIcon name="xmark" size={16} />
              </button>
            </div>
            <div className="modal-body form-grid">
              {isVisitFormOpen ? errorNotice : null}
              <label>
                {t('operations.property')}
                <select
                  value={visitForm.propertyId}
                  onChange={(event) => {
                    setSelectedTemplateId('')
                    if (isCreatingVisit) {
                      setDraftVisitTasks([])
                    }
                    setVisitForm((c) => ({
                      ...c,
                      propertyId: event.target.value,
                    }))
                  }}
                >
                  <option value="">{t('templateAutoAssign.selectProperty')}</option>
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
                {t('operations.visitType')}
                <select
                  value={visitForm.visitTypeId}
                  onChange={(event) => handleVisitTypeChange(event.target.value)}
                >
                  <option value="">{t('operations.selectType')}</option>
                  {sortedVisitTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('common.date')}
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
                {t('operations.start')}
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
                {t('operations.end')}
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
              {isCreatingVisit ? (
                <div className="form-field full-width">
                  <input
                    value={visitForm.title}
                    placeholder={t('operations.visitTitle')}
                    aria-label={t('operations.visitTitle')}
                    onChange={(event) =>
                      setVisitForm((c) => ({ ...c, title: event.target.value }))
                    }
                  />
                </div>
              ) : (
                <label>
                  {t('common.title')}
                  <input
                    value={visitForm.title}
                    onChange={(event) =>
                      setVisitForm((c) => ({ ...c, title: event.target.value }))
                    }
                  />
                </label>
              )}
              {isCreatingVisit ? (
                <div className="form-field full-width">
                  <textarea
                    className="visit-create-description"
                    rows={2}
                    value={visitForm.description}
                    placeholder={t('operations.description')}
                    aria-label={t('operations.description')}
                    onChange={(event) =>
                      setVisitForm((c) => ({
                        ...c,
                        description: event.target.value,
                      }))
                    }
                  />
                </div>
              ) : (
                <label className="full-width">
                  {t('operations.description')}
                  <textarea
                    value={visitForm.description}
                    onChange={(event) =>
                      setVisitForm((c) => ({
                        ...c,
                        description: event.target.value,
                      }))
                    }
                  />
                </label>
              )}
              <CollapsibleVisitTasks
                title={t('operations.tasks')}
                badgeCount={draftVisitTasks.length}
                badgeLabel={t('operations.draftTasksCount', {
                  count: draftVisitTasks.length,
                })}
                addLabel={canCreateTasks ? t('operations.addTask') : undefined}
                onAdd={
                  canCreateTasks
                    ? () => {
                        setDraftVisitTasks((current) => [
                          emptyDraftTask(),
                          ...current,
                        ])
                        setEditingDraftIndex(0)
                      }
                    : undefined
                }
              >
                <VisitTaskList
                  mode="design"
                  tasks={draftVisitTasks}
                  emptyLabel={t('operations.noDraftTasks')}
                  editingIndex={editingDraftIndex}
                  onEdit={setEditingDraftIndex}
                  onDelete={(index) => {
                    setDraftVisitTasks((current) =>
                      current.filter((_, entryIndex) => entryIndex !== index),
                    )
                    setEditingDraftIndex((current) => {
                      if (current === null) return null
                      if (current === index) return null
                      if (current > index) return current - 1
                      return current
                    })
                  }}
                  onChange={(index, patch) =>
                    setDraftVisitTasks((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, ...patch } : entry,
                      ),
                    )
                  }
                />
              </CollapsibleVisitTasks>
            </div>
            <div className="modal-footer">
              {isSavingVisitWithTasks ? (
                <p className="subtitle operations-saving-tasks-notice">
                  <span className="operations-sync-spinner" aria-hidden="true" />
                  {t('operations.savingVisitAndTasks')}
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
                <YlIcon name="xmark" size={16} />
              </button>
            </div>
            <div className="modal-body form-grid">
              {isTaskFormOpen ? errorNotice : null}
              {!taskForm.visitId ? (
                <>
                  <label>
                    {t('operations.property')}
                    <select
                      value={taskForm.propertyId}
                      onChange={(event) =>
                        setTaskForm((c) => ({
                          ...c,
                          propertyId: event.target.value,
                        }))
                      }
                    >
                      <option value="">{t('templateAutoAssign.selectProperty')}</option>
                      {sortedPropertyOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {getPropertyLabel(p)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('operations.team')}
                    <select
                      value={taskForm.teamId}
                      onChange={(event) =>
                        setTaskForm((c) => ({ ...c, teamId: event.target.value }))
                      }
                    >
                      <option value="">{t('operations.selectTeam')}</option>
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
                {t('common.title')}
                <input
                  value={taskForm.title}
                  onChange={(event) =>
                    setTaskForm((c) => ({ ...c, title: event.target.value }))
                  }
                />
              </label>
              <label className="full-width">
                {t('operations.description')}
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
                  {t('operations.urgent')}
                </label>
              ) : (
                <label>
                  {t('operations.priority')}
                  <select
                    value={taskForm.priority}
                    onChange={(event) =>
                      setTaskForm((c) => ({ ...c, priority: event.target.value }))
                    }
                  >
                    {PRIORITIES.map((priority) => (
                      <option key={priority} value={priority}>
                        {t(
                          `operations.priority${priority.charAt(0)}${priority.slice(1).toLowerCase()}`,
                        )}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!taskForm.visitId ? (
                <label>
                  {t('operations.dueDate')}
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
              {taskForm.id && mode === 'unassigned' && !taskForm.visitId ? (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void deleteTask()}
                >
                  {t('operations.deleteTask')}
                </button>
              ) : null}
              <button
                type="button"
                className="btn-primary"
                onClick={() => void submitTask()}
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCancelVisitOpen && selectedVisit ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">{t('operations.cancelVisit')}</h3>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsCancelVisitOpen(false)}
              >
                <YlIcon name="xmark" size={16} />
              </button>
            </div>
            <div className="modal-body">
              {isCancelVisitOpen ? errorNotice : null}
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
                      {t('operations.cancelVisitRelease', {
                        count: visitTasksToRelease.length,
                      })}
                      {visitTasks.length !== visitTasksToRelease.length
                        ? ` ${t('operations.cancelVisitCompletedStay')}`
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
                      {t('operations.cancelVisitMarkCancelled', {
                        count: visitTasksToRelease.length,
                      })}
                      {visitTasks.length !== visitTasksToRelease.length
                        ? ` ${t('operations.cancelVisitCompletedStayShort')}`
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
                      {t('operations.cancelVisitConfirm')}
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsCancelVisitOpen(false)}
              >
                {t('operations.keepVisit')}
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
                {t('operations.cancelVisit')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCompleteVisitOpen && selectedVisit ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">{t('operations.completeVisit')}</h3>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsCompleteVisitOpen(false)}
              >
                <YlIcon name="xmark" size={16} />
              </button>
            </div>
            <div className="modal-body form-grid">
              {isCompleteVisitOpen ? errorNotice : null}
              <label>
                {t('operations.hours')}
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
                {t('operations.poolOfHours')}
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
                {t('operations.specialHours')}
              </label>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void submitCompleteVisit()}
              >
                {t('operations.completeVisit')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAssignVisitOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">{t('operations.assignTaskToVisit')}</h3>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsAssignVisitOpen(false)}
              >
                <YlIcon name="xmark" size={16} />
              </button>
            </div>
            <div className="modal-body">
              {isAssignVisitOpen ? errorNotice : null}
              <label>
                {t('operations.visit')}
                <select
                  value={assignVisitId}
                  onChange={(event) => setAssignVisitId(event.target.value)}
                >
                  <option value="">{t('operations.selectVisit')}</option>
                  {assignVisitOptions.map((visit) => (
                    <option key={visit.id} value={visit.id}>
                      {visit.scheduledDate} {visit.scheduledStartTime} – {visit.title}
                    </option>
                  ))}
                </select>
              </label>
              <p className="modal-subtitle">
                {t('operations.assignVisitHelp')}
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void assignTaskToVisit()}
              >
                {t('operations.assignTask')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
