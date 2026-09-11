import { useTranslation } from 'react-i18next'
import { isSpanishLocale } from '../i18n/display'
import {
  displayTaskDescription,
  displayTaskTitle,
  editableTaskDescription,
  editableTaskTitle,
} from './taskTitleDisplay'
import type { TaskRecord, VisitDraftTask } from './types'

type WorkProps = {
  mode: 'work'
  tasks: TaskRecord[]
  emptyLabel: string
  visitOverdue?: boolean
  visitClosed?: boolean
  canAct?: boolean
  skippingId?: string
  onComplete: (task: TaskRecord) => void
  onSkip: (task: TaskRecord) => void
}

type DesignProps = {
  mode: 'design'
  tasks: VisitDraftTask[]
  emptyLabel: string
  editingIndex: number | null
  onEdit: (index: number | null) => void
  onDelete: (index: number) => void
  onChange: (index: number, patch: Partial<VisitDraftTask>) => void
}

type Props = WorkProps | DesignProps

const EditIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
    <path
      d="M4 13.5V16h2.5L14.9 7.6l-2.5-2.5L4 13.5zm11.7-8.2a.7.7 0 0 0 0-1l-1.5-1.5a.7.7 0 0 0-1 0l-1.2 1.2 2.5 2.5 1.2-1.2z"
      fill="currentColor"
    />
  </svg>
)

const DeleteIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
    <path
      d="M8 2h4l.6 1H16v2H4V3h3.4L8 2zm1 5h2v8H9V7zm-3 0h2v8H6V7zm6 0h2v8h-2V7zM5 17h10l.7-10H4.3L5 17z"
      fill="currentColor"
    />
  </svg>
)

export function VisitTaskList(props: Props) {
  const { t, i18n } = useTranslation()

  if (props.tasks.length === 0) {
    return <p className="operations-empty-tasks">{props.emptyLabel}</p>
  }

  if (props.mode === 'design') {
    const spanish = isSpanishLocale(i18n.language)
    return (
      <ul className="operations-task-list">
        {props.tasks.map((task, index) => {
          const isEditing = props.editingIndex === index
          const description = displayTaskDescription(
            i18n.language,
            task.description,
            task.descriptionEs,
          )
          return (
            <li
              key={task.id ?? `draft-${index}`}
              className={isEditing ? 'is-editing' : undefined}
            >
              <div className="operations-task-content">
                {isEditing ? (
                  <div className="operations-task-copy operations-task-edit-fields">
                    <input
                      placeholder={t('operations.taskTitle')}
                      value={editableTaskTitle(
                        i18n.language,
                        task.title,
                        task.titleEs,
                      )}
                      onChange={(event) => {
                        const value = event.target.value
                        props.onChange(
                          index,
                          spanish ? { titleEs: value } : { title: value },
                        )
                      }}
                    />
                    <textarea
                      className="visit-create-description"
                      rows={2}
                      placeholder={t('operations.description')}
                      value={editableTaskDescription(
                        i18n.language,
                        task.description,
                        task.descriptionEs,
                      )}
                      onChange={(event) => {
                        const value = event.target.value
                        props.onChange(
                          index,
                          spanish
                            ? { descriptionEs: value }
                            : { description: value },
                        )
                      }}
                    />
                    <label className="checkbox-row compact">
                      <input
                        type="checkbox"
                        checked={task.urgent}
                        onChange={(event) =>
                          props.onChange(index, {
                            urgent: event.target.checked,
                          })
                        }
                      />
                      {t('operations.priorityUrgent')}
                    </label>
                  </div>
                ) : (
                  <div className="operations-task-copy">
                    <span className="operations-task-title">
                      {displayTaskTitle(
                        i18n.language,
                        task.title,
                        task.titleEs,
                      ) || t('operations.taskTitle')}
                    </span>
                    {description ? (
                      <span className="operations-task-description">
                        {description}
                      </span>
                    ) : null}
                  </div>
                )}
                {!isEditing && (task.urgent || task.priority === 'URGENT') ? (
                  <span className="status status-danger">
                    {t('operations.priorityUrgent')}
                  </span>
                ) : null}
              </div>
              <div className="action-buttons">
                <button
                  type="button"
                  className={`btn-icon btn-icon-ghost${isEditing ? ' is-active' : ''}`}
                  aria-label={t('operations.editTask')}
                  aria-pressed={isEditing}
                  onClick={() => props.onEdit(isEditing ? null : index)}
                >
                  <EditIcon />
                </button>
                <button
                  type="button"
                  className="btn-icon btn-icon-ghost"
                  aria-label={t('operations.deleteTask')}
                  onClick={() => props.onDelete(index)}
                >
                  <DeleteIcon />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <ul className="operations-task-list">
      {props.tasks.map((task) => {
        const isCompleted = task.status === 'COMPLETED'
        const isSkipped = task.status === 'SKIPPED'
        const isCancelled = task.status === 'CANCELLED'
        const canToggleTask =
          Boolean(props.canAct) && !isCancelled && !props.visitClosed
        const isSkipping = props.skippingId === task.id
        const description = displayTaskDescription(
          i18n.language,
          task.description,
          task.descriptionEs,
        )
        return (
          <li key={task.id}>
            <div className="operations-task-content">
              <div className="operations-task-copy">
                <span className="operations-task-title">
                  {displayTaskTitle(i18n.language, task.title, task.titleEs)}
                </span>
                {description ? (
                  <span className="operations-task-description">
                    {description}
                  </span>
                ) : null}
              </div>
              {task.priority === 'URGENT' ? (
                <span className="status status-danger">
                  {t('operations.priorityUrgent')}
                </span>
              ) : null}
              {isCancelled ? (
                <span className="status status-neutral">
                  {t('operations.cancelledWithVisit')}
                </span>
              ) : null}
              {props.visitOverdue &&
              !isCompleted &&
              !isSkipped &&
              !isCancelled ? (
                <span className="status status-warning">
                  {t('operations.overdueVisit')}
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
                aria-pressed={isCompleted}
                disabled={!canToggleTask || isCompleted}
                onClick={() => props.onComplete(task)}
              >
                ✓
              </button>
              <button
                type="button"
                className={`btn-icon btn-icon-ghost${
                  isSkipped || isSkipping ? ' is-task-skipped' : ''
                }`}
                aria-label={t('operations.skipTask')}
                aria-pressed={isSkipped}
                disabled={!canToggleTask || isSkipped || isSkipping}
                onClick={() => props.onSkip(task)}
              >
                ✕
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
