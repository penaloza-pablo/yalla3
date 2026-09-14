import { saveTask } from './api'
import { displayTaskTitle } from './taskTitleDisplay'
import { isResolvedTaskStatus, type TaskRecord } from './types'

export const openVisitTasks = (tasks: TaskRecord[]) =>
  tasks.filter((task) => !isResolvedTaskStatus(task.status))

export const appendIncompleteTasksComment = (
  existing: string,
  tasks: TaskRecord[],
  heading: string,
  language: string,
) => {
  const openTasks = openVisitTasks(tasks)
  if (openTasks.length === 0) {
    return existing
  }
  const lines = openTasks.map(
    (task) =>
      `• ${displayTaskTitle(language, task.title, task.titleEs) || task.id}`,
  )
  const block = `${heading}\n${lines.join('\n')}`
  const trimmed = existing.trim()
  return trimmed ? `${trimmed}\n\n${block}` : block
}

export const skipOpenVisitTasks = async (
  upsertTaskUrl: string,
  tasks: TaskRecord[],
) => {
  const openTasks = openVisitTasks(tasks)
  if (openTasks.length === 0) {
    return
  }
  await Promise.all(
    openTasks.map((task) =>
      saveTask(upsertTaskUrl, {
        id: task.id,
        action: 'skip',
        status: 'SKIPPED',
        visitId: task.visitId,
      }),
    ),
  )
}
