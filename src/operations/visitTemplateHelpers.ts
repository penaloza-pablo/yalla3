import type {
  VisitDraftTask,
  VisitRecord,
  VisitTemplateRecord,
  VisitTemplateTask,
} from './types'

export const mapVisitTemplate = (
  item: Record<string, unknown>,
): VisitTemplateRecord => {
  const rawTasks = Array.isArray(item.tasks) ? item.tasks : []
  const tasks = rawTasks.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }
    const task = entry as Record<string, unknown>
    const title = String(task.title ?? '').trim()
    if (!title) {
      return []
    }
    const urgent = Boolean(task.urgent)
    const mapped: VisitTemplateTask = {
      title,
      description: String(task.description ?? ''),
      priority: urgent
        ? 'URGENT'
        : String(task.priority ?? 'MEDIUM').toUpperCase(),
      urgent,
      sortOrder:
        typeof task.sortOrder === 'number' && Number.isFinite(task.sortOrder)
          ? task.sortOrder
          : index + 1,
    }
    return [mapped]
  })

  const propertyIds = Array.isArray(item.propertyIds)
    ? item.propertyIds.map((value) => String(value)).filter(Boolean)
    : undefined

  return {
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    propertyId: String(item.propertyId ?? ''),
    propertyIds,
    visitTypeId: String(item.visitTypeId ?? ''),
    teamId: String(item.teamId ?? ''),
    title: String(item.title ?? ''),
    assignedUserId: String(item.assignedUserId ?? ''),
    description: String(item.description ?? ''),
    scheduledStartTime: String(item.scheduledStartTime ?? '09:00'),
    scheduledEndTime: String(item.scheduledEndTime ?? '10:00'),
    estimatedDurationMinutes:
      typeof item.estimatedDurationMinutes === 'number'
        ? item.estimatedDurationMinutes
        : undefined,
    appliesToHourBank: Boolean(item.appliesToHourBank),
    active: item.active !== false,
    tasks,
  }
}

export const templateMatchesProperty = (
  template: Pick<VisitTemplateRecord, 'propertyId' | 'propertyIds'>,
  propertyId: string,
) => {
  const id = propertyId.trim()
  if (!id) {
    return false
  }
  if (template.propertyId === id) {
    return true
  }
  return Boolean(template.propertyIds?.includes(id))
}

export const activeTemplatesForProperty = (
  templates: VisitTemplateRecord[],
  propertyId: string,
) =>
  templates.filter(
    (template) => template.active && templateMatchesProperty(template, propertyId),
  )

export const templateTasksToDrafts = (
  template: VisitTemplateRecord,
): VisitDraftTask[] =>
  template.tasks.map((task) => ({
    title: task.title,
    description: task.description,
    priority: task.priority,
    urgent: Boolean(task.urgent),
  }))

export const templateTasksPayload = (template: VisitTemplateRecord) =>
  template.tasks
    .filter((task) => task.title.trim())
    .map((task) => ({
      title: task.title.trim(),
      description: task.description,
      priority: task.urgent ? 'URGENT' : task.priority || 'MEDIUM',
    }))

export const buildApplyTemplateVisitPayload = (
  visit: Pick<
    VisitRecord,
    | 'id'
    | 'propertyId'
    | 'scheduledDate'
    | 'visitTypeId'
    | 'teamId'
    | 'assignedUserId'
    | 'scheduledStartTime'
    | 'scheduledEndTime'
    | 'title'
    | 'description'
    | 'estimatedDurationMinutes'
  >,
  template: VisitTemplateRecord,
) => ({
  id: visit.id,
  propertyId: visit.propertyId,
  scheduledDate: visit.scheduledDate,
  visitTypeId: template.visitTypeId || visit.visitTypeId,
  teamId: template.teamId || visit.teamId,
  assignedUserId: template.assignedUserId || visit.assignedUserId,
  scheduledStartTime: template.scheduledStartTime || visit.scheduledStartTime,
  scheduledEndTime: template.scheduledEndTime || visit.scheduledEndTime,
  title: template.title || visit.title,
  description: template.description || visit.description,
  estimatedDurationMinutes:
    template.estimatedDurationMinutes ?? visit.estimatedDurationMinutes,
  appendTasks: true,
  tasks: templateTasksPayload(template),
})

export const emptyTemplateForm = () => ({
  id: '',
  name: '',
  propertyId: '',
  visitTypeId: '',
  teamId: '',
  assignedUserId: '',
  title: '',
  description: '',
  scheduledStartTime: '09:00',
  scheduledEndTime: '10:00',
  estimatedDurationMinutes: '',
  tasks: [{ title: '', description: '', urgent: false }],
})
