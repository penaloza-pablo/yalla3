import type { VisitRecord, VisitStatus } from './types'

type Column = {
  key: VisitStatus | 'DONE'
  label: string
  statuses: VisitStatus[]
}

type Props = {
  columns: Column[]
  visitsByColumn: Map<string, VisitRecord[]>
  isMultiDayRange: boolean
  propertyById: Map<string, string>
  visitTypeById: Map<string, string>
  teamById: Map<string, string>
  userById: Map<string, string>
  onSelectVisit: (visitId: string) => void
}

export function OperationsKanbanView({
  columns,
  visitsByColumn,
  isMultiDayRange,
  propertyById,
  visitTypeById,
  teamById,
  userById,
  onSelectVisit,
}: Props) {
  return (
    <section className="operations-kanban">
      {columns.map((column) => (
        <div className="operations-column" key={column.key}>
          <h3>{column.label}</h3>
          <div className="operations-column-body">
            {(visitsByColumn.get(column.key) ?? []).map((visit) => (
              <button
                key={visit.id}
                type="button"
                className="operations-visit-card"
                onClick={() => onSelectVisit(visit.id)}
              >
                <p className="operations-card-time">
                  {isMultiDayRange ? (
                    <span className="operations-card-date">
                      {visit.scheduledDate} ·{' '}
                    </span>
                  ) : null}
                  {visit.scheduledStartTime || '—'}
                  {visit.scheduledEndTime ? ` – ${visit.scheduledEndTime}` : ''}
                </p>
                <p className="operations-card-title">{visit.title}</p>
                <p className="operations-card-meta">
                  {propertyById.get(visit.propertyId) ?? visit.propertyId}
                </p>
                <p className="operations-card-meta">
                  {visitTypeById.get(visit.visitTypeId) ?? visit.visitTypeId}
                </p>
                <p className="operations-card-meta">
                  {teamById.get(visit.teamId) ?? visit.teamId} ·{' '}
                  {userById.get(visit.assignedUserId) ||
                    visit.assignedUserId ||
                    'Unassigned'}
                </p>
                <p className="operations-card-tags">
                  <span className="tag">{visit.status}</span>
                  {(() => {
                    const taskTotal = visit.taskCountTotal ?? 0
                    const taskCompleted = visit.taskCountCompleted ?? 0
                    const allComplete =
                      taskTotal > 0 && taskCompleted === taskTotal
                    return (
                      <span
                        className={`tag tag-task-progress${
                          allComplete ? ' is-complete' : ''
                        }`}
                        title="Tasks completed"
                      >
                        <span className="tag-task-progress-icon" aria-hidden>
                          ✓
                        </span>
                        {taskTotal > 0
                          ? `${taskCompleted}/${taskTotal}`
                          : '0 tasks'}
                      </span>
                    )
                  })()}
                  {visit.appliesToHourBank ? (
                    <span className="tag">Hour bank</span>
                  ) : null}
                </p>
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
