type TableSkeletonProps = {
  rows?: number
  label: string
}

export function TableSkeleton({ rows = 4, label }: TableSkeletonProps) {
  return (
    <div className="yl-skeleton" role="status" aria-live="polite" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div className="yl-skeleton-row" key={index} />
      ))}
    </div>
  )
}

type EmptyStateProps = {
  message: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="yl-empty">
      <p>{message}</p>
      {actionLabel && onAction ? (
        <button className="btn-primary" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  )
}
