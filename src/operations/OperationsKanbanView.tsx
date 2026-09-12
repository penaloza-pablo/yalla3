import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { OperationsDayListHeader } from './OperationsDayListHeader'
import {
  compareTeamTimeTieBreak,
  getTeamBlockStyle,
  getTeamSortKey,
} from './teamColors'
import { formatAgendaDayLabel } from './operationsViewHelpers'
import { formatVisitBarTitle } from './visitOverlapLayout'
import type { PropertyOption, VisitRecord } from './types'
import { YlIcon } from '../design/icons'

type Props = {
  dayViewDate: string
  visits: VisitRecord[]
  propertiesById: Map<string, PropertyOption>
  teamById: Map<string, string>
  userById: Map<string, string>
  completingVisitIds: Set<string>
  syncingVisitIds: Set<string>
  onDayDateChange: (date: string) => void
  onSelectVisit: (visitId: string) => void
  onCompleteVisit: (visit: VisitRecord) => void
  canCreateVisit?: boolean
  onCreateVisit?: () => void
  onOpenFilters?: () => void
  activeFilterCount?: number
  filtersActive?: boolean
}

const teamBadgeLabel = (
  teamId: string,
  teamById: Map<string, string>,
  t: (key: string) => string,
) => {
  const key = getTeamSortKey(teamId, teamById)
  if (key === 'limpieza') {
    return t('today.cleaning')
  }
  if (key === 'mantenimiento') {
    return t('today.maintenance')
  }
  return teamById.get(teamId) ?? teamId
}

const formatVisitTimeRange = (visit: VisitRecord) => {
  const start = visit.scheduledStartTime || '—'
  const end = visit.scheduledEndTime ? ` – ${visit.scheduledEndTime}` : ''
  return `${start}${end}`
}

export function OperationsKanbanView({
  dayViewDate,
  visits,
  propertiesById,
  teamById,
  userById,
  completingVisitIds,
  syncingVisitIds,
  onDayDateChange,
  onSelectVisit,
  onCompleteVisit,
  canCreateVisit = false,
  onCreateVisit,
  onOpenFilters,
  activeFilterCount = 0,
  filtersActive = false,
}: Props) {
  const { t } = useTranslation()
  const sortedVisits = useMemo(
    () =>
      [...visits].sort(
        (left, right) =>
          left.scheduledStartTime.localeCompare(right.scheduledStartTime) ||
          compareTeamTimeTieBreak(left.teamId, right.teamId, teamById) ||
          left.id.localeCompare(right.id),
      ),
    [teamById, visits],
  )

  return (
    <section className="card operations-day-card operations-kanban-board">
      <OperationsDayListHeader
        dayViewDate={dayViewDate}
        onDayDateChange={onDayDateChange}
        canCreateVisit={canCreateVisit}
        onCreateVisit={onCreateVisit}
        onOpenFilters={onOpenFilters}
        activeFilterCount={activeFilterCount}
        filtersActive={filtersActive}
      />
      {sortedVisits.length === 0 ? (
        <p className="subtitle operations-day-empty">
          {t('operations.emptyDayVisits', {
            date: formatAgendaDayLabel(dayViewDate),
          })}
        </p>
      ) : (
        <ul className="operations-kanban-list">
          {sortedVisits.map((visit) => {
            const property = propertiesById.get(visit.propertyId)
            const nickname = formatVisitBarTitle(visit, { property })
            const assignee =
              userById.get(visit.assignedUserId) ||
              visit.assignedUserId ||
              t('operations.unassigned')
            const isCompleted = visit.status === 'COMPLETED'
            const isCancelled = visit.status === 'CANCELLED'
            const isBusy =
              completingVisitIds.has(visit.id) || syncingVisitIds.has(visit.id)
            const canToggleComplete = !isCompleted && !isCancelled && !isBusy

            return (
              <li key={visit.id}>
                <article
                  className={`operations-kanban-visit${
                    isCompleted ? ' is-completed' : ''
                  }${isCancelled ? ' is-cancelled' : ''}${
                    isBusy ? ' is-busy' : ''
                  }`}
                >
                  <button
                    type="button"
                    className="operations-kanban-visit-open"
                    onClick={() => onSelectVisit(visit.id)}
                  >
                    <p className="operations-kanban-visit-time">
                      {formatVisitTimeRange(visit)}
                    </p>
                    <p className="operations-kanban-visit-identity">
                      <span
                        className="operations-kanban-team-badge"
                        style={getTeamBlockStyle(visit.teamId, teamById)}
                      >
                        {teamBadgeLabel(visit.teamId, teamById, t)}
                      </span>
                      <span className="operations-kanban-visit-nickname">
                        {nickname}
                      </span>
                    </p>
                    <p className="operations-kanban-visit-assignee">{assignee}</p>
                  </button>
                  <button
                    type="button"
                    className={`btn-icon operations-kanban-complete${
                      isCompleted ? ' is-checked' : ''
                    }`}
                    aria-pressed={isCompleted}
                    aria-busy={isBusy}
                    disabled={!canToggleComplete}
                    aria-label={t('operations.completeVisit')}
                    title={
                      isCompleted
                        ? t('operations.completed')
                        : t('operations.completeVisit')
                    }
                    onClick={(event) => {
                      event.stopPropagation()
                      if (!canToggleComplete) {
                        return
                      }
                      onCompleteVisit(visit)
                    }}
                  >
                    {isCompleted ? (
                      <YlIcon name="checkmark.circle" variant="fill" size={22} />
                    ) : (
                      <span
                        className="operations-kanban-complete-empty"
                        aria-hidden
                      />
                    )}
                  </button>
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
