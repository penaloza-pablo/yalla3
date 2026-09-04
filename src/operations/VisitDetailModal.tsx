import { useEffect, useMemo, useState, type TouchEvent, type WheelEvent } from 'react'
import { createPortal } from 'react-dom'
import { fetchUserAttributes } from 'aws-amplify/auth'
import { useTranslation } from 'react-i18next'
import { ACTION_KEYS } from '../../amplify/functions/shared/rbac-catalog'
import { usePermissions } from '../rbac/PermissionsProvider'
import {
  fetchJson,
  getReferenceList,
  getTasksByVisit,
  getVisitById,
  getVisitTemplatesForProperty,
  refreshVisitFromGuesty,
  saveTask,
  saveVisit,
  canRefreshVisitFromGuesty,
} from './api'
import { formatDayMonthLabel } from './dateHelpers'
import { getPropertyLabel, sortPropertyOptions } from './propertyHelpers'
import { VisitUseTemplateControls } from './VisitUseTemplateControls'
import { displayTaskTitle } from './taskTitleDisplay'
import { buildApplyTemplateVisitPayload } from './visitTemplateHelpers'
import {
  CLEANING_VISIT_TYPE_ID,
  requiresCompleteVisitWizard,
  resolveTeamIdForVisitType,
} from './visitTypeIds'
import type {
  PropertyOption,
  TaskRecord,
  TeamRecord,
  UserRecord,
  VisitRecord,
  VisitStatus,
  VisitTemplateRecord,
  VisitTypeRecord,
} from './types'

type CleaningTypeBadge = {
  pending: boolean
  label: string
}

type Props = {
  visitId: string
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
  onClose: () => void
  onVisitChanged?: () => void
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

const cleanerNameFromPlanRow = (
  item: Record<string, unknown> | undefined,
  nameById: Map<string, string>,
) => {
  if (!item) {
    return ''
  }
  const cleanerId = String(item.cleanerId ?? '').trim()
  if (!cleanerId) {
    return ''
  }
  return nameById.get(cleanerId)?.trim() || String(item.cleanerName ?? '').trim()
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
  guestyTaskId:
    typeof item.guestyTaskId === 'string' ? item.guestyTaskId : undefined,
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
  const { t, i18n } = useTranslation()
  const { can } = usePermissions()
  const [visit, setVisit] = useState<VisitRecord | null>(null)
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [teams, setTeams] = useState<TeamRecord[]>([])
  const [users, setUsers] = useState<UserRecord[]>([])
  const [visitTypes, setVisitTypes] = useState<VisitTypeRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isCompleteOpen, setIsCompleteOpen] = useState(false)
  const [isCancelOpen, setIsCancelOpen] = useState(false)
  const [isMoreInfoOpen, setIsMoreInfoOpen] = useState(false)
  const [openVisitTemplates, setOpenVisitTemplates] = useState<VisitTemplateRecord[]>(
    [],
  )
  const [openVisitTemplateId, setOpenVisitTemplateId] = useState('')
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false)
  const [cleaningTypeBadge, setCleaningTypeBadge] =
    useState<CleaningTypeBadge | null>(null)
  const [cleanerBadge, setCleanerBadge] = useState<string | null>(null)
  const [dismissingTaskId, setDismissingTaskId] = useState('')
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
      upsertTask: getEndpoint(
        'upsertTaskUrl',
        import.meta.env.VITE_UPSERT_TASK_URL,
      ),
      cleaningPlan: getEndpoint(
        'getCleaningPlanUrl',
        import.meta.env.VITE_GET_CLEANING_PLAN_URL,
      ),
      cleaners: getEndpoint(
        'getCleanersUrl',
        import.meta.env.VITE_GET_CLEANERS_URL,
      ),
      visitTemplates: getEndpoint(
        'getVisitTemplatesUrl',
        import.meta.env.VITE_GET_VISIT_TEMPLATES_URL,
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
  const canRefreshFromGuesty = visit ? canRefreshVisitFromGuesty(visit) : false

  const statusLabel = (status: VisitStatus) => {
    if (status === 'SCHEDULED') return t('operations.scheduled')
    if (status === 'OVERDUE') return t('operations.overdue')
    if (status === 'COMPLETED') return t('operations.completed')
    return t('operations.cancelled')
  }

  const reloadTasks = async () => {
    if (!endpoints.tasks) {
      return
    }
    const tasksPayload = await getTasksByVisit(endpoints.tasks, visitId).catch(
      () => ({ items: [] as TaskRecord[] }),
    )
    setTasks(((tasksPayload.items ?? []) as Record<string, unknown>[]).map(mapTask))
  }

  const completeTask = async (task: TaskRecord) => {
    if (!endpoints.upsertTask) {
      return
    }
    const closedBy = await getCurrentUserEmail()
    await saveTask(endpoints.upsertTask, {
      id: task.id,
      status: 'COMPLETED',
      closedBy,
    })
    setMessage(t('operations.taskCompleted'))
    await reloadTasks()
    notifyChanged()
  }

  const handleDismissTask = async (task: TaskRecord) => {
    if (!endpoints.upsertTask) {
      return
    }
    setDismissingTaskId(task.id)
    try {
      await saveTask(endpoints.upsertTask, { id: task.id, action: 'dismiss' })
      setMessage(t('operations.taskDismissed'))
      await reloadTasks()
      notifyChanged()
    } finally {
      setDismissingTaskId('')
    }
  }

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
    setIsMoreInfoOpen(false)
    setCleaningTypeBadge(null)
    setMessage('')
    setOpenVisitTemplates([])
    setOpenVisitTemplateId('')
  }, [visitId])

  useEffect(() => {
    const propertyId = visit?.propertyId
    const templatesEndpoint = endpoints.visitTemplates
    const canApply =
      isMoreInfoOpen &&
      Boolean(propertyId) &&
      visit?.status !== 'COMPLETED' &&
      visit?.status !== 'CANCELLED' &&
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
    isMoreInfoOpen,
    t,
    visit?.propertyId,
    visit?.status,
  ])

  useEffect(() => {
    if (!visit || visit.visitTypeId !== CLEANING_VISIT_TYPE_ID) {
      setCleaningTypeBadge(null)
      setCleanerBadge(null)
      return
    }
    const date = visit.scheduledDate.trim()
    const endpoint = endpoints.cleaningPlan
    if (!date || !endpoint) {
      setCleaningTypeBadge(null)
      setCleanerBadge(null)
      return
    }
    let cancelled = false
    const cleanersUrl = endpoints.cleaners
      ? `${endpoints.cleaners}${
          endpoints.cleaners.includes('?') ? '&' : '?'
        }includeInactive=true`
      : ''
    void Promise.all([
      fetchJson<{
        status?: string
        rows?: Record<string, unknown>[]
      }>(`${endpoint}?date=${encodeURIComponent(date)}`),
      cleanersUrl
        ? fetchJson<{ items?: Record<string, unknown>[] }>(cleanersUrl).catch(
            () => ({ items: [] as Record<string, unknown>[] }),
          )
        : Promise.resolve({ items: [] as Record<string, unknown>[] }),
    ])
      .then(([payload, cleanersPayload]) => {
        if (cancelled) {
          return
        }
        const isReady =
          String(payload.status ?? 'DRAFT').toUpperCase() === 'READY'
        const row = (payload.rows ?? []).find(
          (item) => String(item.visitId ?? '').trim() === visit.id,
        )
        const name = row ? cleaningTypeNameFromPlanRow(row) : ''
        if (isReady && name) {
          setCleaningTypeBadge({ pending: false, label: name })
        } else {
          setCleaningTypeBadge({
            pending: true,
            label: t('operations.cleaningTypePending'),
          })
        }
        const nameById = new Map(
          (cleanersPayload.items ?? [])
            .map((item) => {
              const id = String(item.id ?? '').trim()
              const cleanerName = String(item.name ?? '').trim()
              return [id, cleanerName] as const
            })
            .filter((entry) => entry[0] && entry[1]),
        )
        const assignedCleaner = cleanerNameFromPlanRow(row, nameById)
        setCleanerBadge(assignedCleaner || null)
      })
      .catch(() => {
        if (!cancelled) {
          setCleaningTypeBadge({
            pending: true,
            label: t('operations.cleaningTypePending'),
          })
          setCleanerBadge(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [endpoints.cleaners, endpoints.cleaningPlan, t, visit])

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

  const applyTemplateToVisit = async () => {
    if (!visit || !openVisitTemplateId || !endpoints.upsertVisit) {
      return
    }
    if (visit.status === 'COMPLETED' || visit.status === 'CANCELLED') {
      return
    }
    const template = openVisitTemplates.find(
      (entry) => entry.id === openVisitTemplateId,
    )
    if (!template) {
      return
    }
    setIsApplyingTemplate(true)
    setError('')
    try {
      const response = await saveVisit(
        endpoints.upsertVisit,
        buildApplyTemplateVisitPayload(visit, template),
      )
      const savedItem = response.item as Record<string, unknown> | undefined
      if (savedItem) {
        setVisit(mapVisit(savedItem))
      } else {
        await reloadVisit()
      }
      await reloadTasks()
      setOpenVisitTemplateId('')
      const createdCount = Array.isArray(
        (response as { createdTasks?: unknown[] }).createdTasks,
      )
        ? (response as { createdTasks: unknown[] }).createdTasks.length
        : template.tasks.length
      setMessage(t('operations.templateApplied', { count: createdCount }))
      notifyChanged()
    } catch (applyError) {
      setError(
        applyError instanceof Error
          ? applyError.message
          : t('operations.unableApplyTemplate'),
      )
    } finally {
      setIsApplyingTemplate(false)
    }
  }

  const refreshFromGuesty = async () => {
    if (!visit) {
      return
    }
    if (!endpoints.upsertVisit) {
      setError(t('operations.missingWriteVisit'))
      return
    }
    setIsRefreshing(true)
    setError('')
    try {
      const response = await refreshVisitFromGuesty(endpoints.upsertVisit, visit.id)
      const item = response.item as Record<string, unknown> | undefined
      if (item) {
        setVisit(mapVisit(item))
      } else {
        await reloadVisit()
      }
      setMessage(
        response.changed
          ? t('operations.visitRefreshed')
          : t('operations.visitAlreadyInSync'),
      )
      notifyChanged()
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : t('operations.unableRefreshFromGuesty'),
      )
    } finally {
      setIsRefreshing(false)
    }
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
    if (!visit) {
      return
    }
    if (visitHasOpenTasks) {
      setError(t('operations.completeTasksFirst'))
      return
    }
    if (!requiresCompleteVisitWizard(visit.visitTypeId)) {
      void updateVisitStatus('COMPLETED', undefined, t('operations.visitCompleted'))
      return
    }
    setCompleteForm({
      hours: visit.actualDurationHours ? String(visit.actualDurationHours) : '1',
      poolOfHours: visit.appliesToHourBank ?? false,
      specialHours: visit.specialHours ?? false,
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
            {visit ? (
              <div className="operations-visit-badges">
                <span
                  className={`status operations-visit-status ${
                    visit.status === 'OVERDUE'
                      ? 'status-warning'
                      : visit.status === 'COMPLETED'
                        ? 'status-success'
                        : visit.status === 'CANCELLED'
                          ? 'status-neutral'
                          : 'status-info'
                  }`}
                >
                  {statusLabel(visit.status)}
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
            ) : null}
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
              <div className="operations-detail-fields">
                <span className="operations-detail-plain">
                  {propertyById.get(visit.propertyId) ?? visit.propertyId}
                </span>
                <span className="operations-detail-plain">
                  {formatDayMonthLabel(visit.scheduledDate)}{' '}
                  {visit.scheduledStartTime} – {visit.scheduledEndTime}
                </span>
                {visit.description ? (
                  <div className="operations-detail-field">
                    <span className="operations-detail-label">
                      {t('operations.description')}
                    </span>
                    <span className="operations-detail-value">
                      {visit.description}
                    </span>
                  </div>
                ) : null}
              </div>

              <div className="operations-detail-actions">
                {can(ACTION_KEYS.visitMoreInfo) ? (
                <button
                  type="button"
                  className={`btn-icon btn-icon-ghost operations-more-info-btn${
                    isMoreInfoOpen ? ' is-active' : ''
                  }`}
                  aria-label={t('operations.moreInfo')}
                  aria-expanded={isMoreInfoOpen}
                  title={t('operations.moreInfo')}
                  onClick={() => setIsMoreInfoOpen((current) => !current)}
                >
                  i
                </button>
                ) : null}
                <button
                  type="button"
                  className="btn-icon btn-icon-ghost"
                  aria-label={t('operations.editVisit')}
                  title={t('operations.editVisit')}
                  onClick={openEdit}
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
                {canChangeStatus ? (
                  <button
                    type="button"
                    className="btn-icon btn-icon-ghost"
                    disabled={visitHasOpenTasks || isSaving || isRefreshing}
                    aria-label={t('operations.completeVisit')}
                    title={
                      visitHasOpenTasks
                        ? t('operations.completeTasksFirst')
                        : t('operations.completeVisit')
                    }
                    onClick={openComplete}
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
                ) : null}
              </div>

              {isMoreInfoOpen ? (
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
                        {visit.id}
                      </span>
                    </div>
                    <div className="operations-detail-field">
                      <span className="operations-detail-label">
                        {t('operations.assignedUser')}
                      </span>
                      <span className="operations-detail-value">
                        {userById.get(visit.assignedUserId) ||
                          visit.assignedUserId ||
                          '—'}
                      </span>
                    </div>
                    <div className="operations-detail-field">
                      <span className="operations-detail-label">
                        {t('operations.team')}
                      </span>
                      <span className="operations-detail-value">
                        {teamById.get(visit.teamId) ?? visit.teamId}
                      </span>
                    </div>
                    <div className="operations-detail-field">
                      <span className="operations-detail-label">
                        {t('operations.visitType')}
                      </span>
                      <span className="operations-detail-value">
                        {visitTypeById.get(visit.visitTypeId) ?? visit.visitTypeId}
                      </span>
                    </div>
                  </div>
                  {canChangeStatus ? (
                    <VisitUseTemplateControls
                      templates={openVisitTemplates}
                      selectedId={openVisitTemplateId}
                      onSelectId={setOpenVisitTemplateId}
                      onApply={() => void applyTemplateToVisit()}
                      disabled={isSaving || isRefreshing}
                      applying={isApplyingTemplate}
                    />
                  ) : null}
                  <div className="operations-more-info-actions">
                    {canRefreshFromGuesty ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={isSaving || isRefreshing}
                        onClick={() => void refreshFromGuesty()}
                      >
                        {isRefreshing
                          ? t('operations.refreshingFromGuesty')
                          : t('operations.refreshFromGuesty')}
                      </button>
                    ) : null}
                    {canChangeStatus ? (
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={isSaving || isRefreshing}
                        onClick={openCancel}
                      >
                        {t('operations.cancelVisit')}
                      </button>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <h4 className="section-title">{t('operations.tasks')}</h4>
              {tasks.length === 0 ? (
                <p className="operations-empty-tasks">
                  {t('operations.emptyTasksHint')}
                </p>
              ) : (
                <ul className="operations-task-list">
                  {tasks.map((task) => {
                    const isCompleted = task.status === 'COMPLETED'
                    const isCancelled = task.status === 'CANCELLED'
                    const canActOnTask =
                      task.status === 'PENDING' || task.status === 'BLOCKED'
                    const isDismissing = dismissingTaskId === task.id
                    return (
                      <li key={task.id}>
                        <div className="operations-task-content">
                          <span className="operations-task-title">
                            {displayTaskTitle(i18n.language, task.title, task.titleEs)}
                          </span>
                          {task.priority === 'URGENT' ? (
                            <span className="status status-danger">
                              {t('operations.priorityUrgent')}
                            </span>
                          ) : null}
                          {isCancelled ? (
                            <span className="status status-neutral">
                              {t('operations.cancelled')}
                            </span>
                          ) : null}
                          {visit.status === 'OVERDUE' && canActOnTask ? (
                            <span className="status status-warning">
                              {t('operations.overdue')}
                            </span>
                          ) : null}
                        </div>
                        <div className="action-buttons">
                          <button
                            type="button"
                            className={`btn-icon btn-icon-ghost${
                              isCompleted ? ' is-task-complete' : ''
                            }`}
                            aria-label={t('operations.completeTask')}
                            disabled={
                              isCompleted ||
                              isCancelled ||
                              !canActOnTask ||
                              !endpoints.upsertTask
                            }
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
                              disabled={isDismissing || !endpoints.upsertTask}
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
            </>
          ) : null}
        </div>
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
                          teamId: resolveTeamIdForVisitType(
                            visitType,
                            teams,
                            current.teamId,
                          ),
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
              {t('operations.start')}
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
              {t('operations.end')}
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
          {tasks.length > 0 ? (
            <>
          <p>
            {t('operations.cancelVisitTasksPrompt', { count: tasks.length })}
          </p>
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
            </>
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
