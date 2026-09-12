import { useState, type ReactNode } from 'react'
import { YlIcon } from '../design/icons'

type Props = {
  title: string
  badgeCount?: number
  badgeLabel?: string
  addLabel?: string
  onAdd?: () => void
  children: ReactNode
}

export function CollapsibleVisitTasks({
  title,
  badgeCount = 0,
  badgeLabel,
  addLabel,
  onAdd,
  children,
}: Props) {
  const [isOpen, setIsOpen] = useState(true)
  const showBadge = !isOpen && badgeCount > 0

  return (
    <div className="full-width visit-draft-tasks">
      <div className="visit-tasks-header">
        <button
          type="button"
          className="visit-tasks-toggle"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((current) => !current)}
        >
          <span
            className={`visit-tasks-chevron${isOpen ? ' is-open' : ''}`}
            aria-hidden="true"
          >
            <YlIcon name="chevron.down" size={14} />
          </span>
          <h4>{title}</h4>
          {showBadge ? (
            <span
              className="visit-tasks-badge"
              aria-label={badgeLabel || String(badgeCount)}
            >
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          ) : null}
        </button>
        {onAdd && addLabel ? (
          <button type="button" className="btn-secondary" onClick={onAdd}>
            {addLabel}
          </button>
        ) : null}
      </div>
      {isOpen ? children : null}
    </div>
  )
}
