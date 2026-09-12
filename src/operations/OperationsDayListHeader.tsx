import { useTranslation } from 'react-i18next'
import { addDaysToDateString } from './dateHelpers'
import { formatAgendaDayLabel } from './operationsViewHelpers'
import { YlIcon } from '../design/icons'

type Props = {
  dayViewDate: string
  onDayDateChange: (date: string) => void
  canCreateVisit?: boolean
  onCreateVisit?: () => void
  onOpenFilters?: () => void
  activeFilterCount?: number
  filtersActive?: boolean
}

export function OperationsDayListHeader({
  dayViewDate,
  onDayDateChange,
  canCreateVisit = false,
  onCreateVisit,
  onOpenFilters,
  activeFilterCount = 0,
  filtersActive = false,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="operations-day-header">
      <div className="operations-day-title-row">
        <label className="operations-day-date-trigger">
          <h2 className="section-title today-card-title">
            {formatAgendaDayLabel(dayViewDate)}
          </h2>
          <input
            className="operations-day-date-input"
            type="date"
            value={dayViewDate}
            onChange={(event) => onDayDateChange(event.target.value)}
            aria-label={t('operations.chooseDate')}
          />
        </label>
        <div className="btn-group operations-day-date-stepper">
          <button
            type="button"
            className="operations-day-nav-btn"
            aria-label={t('operations.previousDay')}
            title={t('operations.previousDay')}
            onClick={() => onDayDateChange(addDaysToDateString(dayViewDate, -1))}
          >
            <YlIcon name="chevron.left" size={16} />
          </button>
          <button
            type="button"
            className="operations-day-nav-btn"
            aria-label={t('operations.nextDay')}
            title={t('operations.nextDay')}
            onClick={() => onDayDateChange(addDaysToDateString(dayViewDate, 1))}
          >
            <YlIcon name="chevron.right" size={16} />
          </button>
        </div>
        {onCreateVisit || onOpenFilters ? (
          <div className="operations-day-card-actions">
            {canCreateVisit && onCreateVisit ? (
              <button
                className="btn-ghost"
                type="button"
                onClick={onCreateVisit}
                aria-label={t('operations.createVisit')}
              >
                <YlIcon name="plus" size={16} />
              </button>
            ) : null}
            {onOpenFilters ? (
              <button
                className={`btn-ghost btn-filter ${
                  filtersActive ? 'is-active' : ''
                }`}
                type="button"
                aria-label={t('common.filters')}
                onClick={onOpenFilters}
              >
                <YlIcon name="line.3.horizontal.decrease" size={16} />
                {activeFilterCount > 0 ? (
                  <span className="filter-badge">{activeFilterCount}</span>
                ) : null}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
