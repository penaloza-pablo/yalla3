export type VisitStatus = 'SCHEDULED' | 'OVERDUE' | 'COMPLETED' | 'CANCELLED'

export type TaskStatus =
  | 'UNASSIGNED'
  | 'DISMISS'
  | 'PENDING'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'CANCELLED'

export type VisitRecord = {
  id: string
  propertyId: string
  visitTypeId: string
  teamId: string
  assignedUserId: string
  scheduledDate: string
  scheduledStartTime: string
  scheduledEndTime: string
  status: VisitStatus
  priority: string
  title: string
  description: string
  estimatedDurationMinutes?: number
  actualDurationHours?: number
  appliesToHourBank: boolean
  specialHours?: boolean
  taskCountTotal?: number
  taskCountCompleted?: number
}

export type TaskRecord = {
  id: string
  propertyId: string
  visitId?: string
  teamId: string
  assignedUserId?: string
  title: string
  description: string
  status: TaskStatus
  priority: string
  dueDate?: string
  createdAt?: string
}

export type TeamRecord = { id: string; name: string; description?: string }
export type UserRecord = {
  id: string
  name: string
  email?: string
  teamId?: string
}
export type VisitTypeRecord = {
  id: string
  name: string
  description?: string
  defaultTeamId?: string
  defaultDurationMinutes?: number
  appliesToHourBank?: boolean
}
export type PropertyOption = {
  id: string
  nickname: string
  title: string
  listingNickname: string
  type?: string
  mtlPrincipalId?: string
}

export type VisitTemplateTask = {
  title: string
  description: string
  priority: string
  urgent?: boolean
  sortOrder: number
}

export type VisitTemplateRecord = {
  id: string
  name: string
  propertyId: string
  visitTypeId: string
  teamId: string
  title: string
  assignedUserId: string
  description: string
  scheduledStartTime: string
  scheduledEndTime: string
  estimatedDurationMinutes?: number
  appliesToHourBank: boolean
  active: boolean
  tasks: VisitTemplateTask[]
}

export type VisitDraftTask = {
  title: string
  description: string
  priority: string
  urgent: boolean
}
