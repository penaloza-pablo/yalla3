import type { VisitDraftTask, VisitTemplateRecord, VisitTemplateTask } from './types'

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

  return {
    id: String(item.id ?? ''),
    name: String(item.name ?? ''),
    propertyId: String(item.propertyId ?? ''),
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

export const templateTasksToDrafts = (
  template: VisitTemplateRecord,
): VisitDraftTask[] =>
  template.tasks.map((task) => ({
    title: task.title,
    description: task.description,
    priority: task.priority,
    urgent: Boolean(task.urgent),
  }))

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
