import { useTranslation } from 'react-i18next'
import { displayTaskTitle } from './taskTitleDisplay'
import type { TaskRecord } from './types'
import { openVisitTasks } from './incompleteVisitTasks'

type Props = {
  tasks: TaskRecord[]
}

export function IncompleteVisitTasksNotice({ tasks }: Props) {
  const { t, i18n } = useTranslation()
  const openTasks = openVisitTasks(tasks)
  if (openTasks.length === 0) {
    return null
  }

  return (
    <div className="operations-incomplete-tasks-notice">
      <p>{t('operations.completeOpenTasksNotice')}</p>
      <ul>
        {openTasks.map((task) => (
          <li key={task.id}>
            {displayTaskTitle(i18n.language, task.title, task.titleEs) ||
              task.id}
          </li>
        ))}
      </ul>
    </div>
  )
}
