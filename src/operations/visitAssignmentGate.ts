import type { TaskRecord, UserRecord, VisitRecord } from './types'

export type AssigneeRef = {
  email: string
  name: string
  userId: string
  assigned: boolean
}

const normalize = (value: string | undefined | null) =>
  (value ?? '').trim().toLowerCase()

export const visitAwaitingStart = (visit: {
  status: string
  startedAt?: string
}) =>
  visit.status !== 'COMPLETED' &&
  visit.status !== 'CANCELLED' &&
  !visit.startedAt?.trim()

export const resolveAssignee = (input: {
  assignedUserId?: string
  planAssigneeEmail?: string
  planAssigneeName?: string
  users: UserRecord[]
}): AssigneeRef => {
  const userId = (input.assignedUserId ?? '').trim()
  const user = input.users.find((entry) => entry.id === userId)
  const email = normalize(input.planAssigneeEmail || user?.email)
  const name = (input.planAssigneeName || user?.name || '').trim()
  const assigned = Boolean(email || name || userId)
  return {
    email,
    name: name || userId,
    userId,
    assigned,
  }
}

const sessionMatches = (sessionEmail: string, assignee: AssigneeRef) => {
  const session = normalize(sessionEmail)
  if (!session || session === 'unknown') {
    return false
  }
  if (assignee.email && assignee.email === session) {
    return true
  }
  return normalize(assignee.userId) === session
}

export const mayOperateAssigned = (input: {
  canActOnOthers: boolean
  sessionEmail: string
  assignee: AssigneeRef
}) => {
  if (input.canActOnOthers || !input.assignee.assigned) {
    return true
  }
  return sessionMatches(input.sessionEmail, input.assignee)
}

export const mayCompleteWork = (input: {
  canActOnOthers: boolean
  sessionEmail: string
  visitAssignee: AssigneeRef
  taskAssignee?: AssigneeRef
}) => {
  if (input.canActOnOthers) {
    return true
  }
  const task = input.taskAssignee
  if (task?.assigned) {
    const taskOk = mayOperateAssigned({
      canActOnOthers: false,
      sessionEmail: input.sessionEmail,
      assignee: task,
    })
    const visitOk =
      input.visitAssignee.assigned &&
      mayOperateAssigned({
        canActOnOthers: false,
        sessionEmail: input.sessionEmail,
        assignee: input.visitAssignee,
      })
    return taskOk || visitOk
  }
  return mayOperateAssigned({
    canActOnOthers: false,
    sessionEmail: input.sessionEmail,
    assignee: input.visitAssignee,
  })
}

export const workAssigneeName = (
  visitAssignee: AssigneeRef,
  taskAssignee?: AssigneeRef,
) => {
  if (taskAssignee?.assigned && taskAssignee.name) {
    return taskAssignee.name
  }
  if (visitAssignee.assigned && visitAssignee.name) {
    return visitAssignee.name
  }
  return ''
}

export const taskAssigneeOf = (
  task: TaskRecord | undefined,
  users: UserRecord[],
): AssigneeRef | undefined => {
  if (!task?.assignedUserId?.trim()) {
    return undefined
  }
  return resolveAssignee({
    assignedUserId: task.assignedUserId,
    users,
  })
}

export const visitAssigneeOf = (
  visit: Pick<
    VisitRecord,
    'assignedUserId' | 'planAssigneeEmail' | 'planAssigneeName'
  >,
  users: UserRecord[],
) =>
  resolveAssignee({
    assignedUserId: visit.assignedUserId,
    planAssigneeEmail: visit.planAssigneeEmail,
    planAssigneeName: visit.planAssigneeName,
    users,
  })
