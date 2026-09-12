import { YlIcon } from '../design/icons'

type Props = {
  children: string
  variant?: 'error' | 'success' | 'warning'
  dismissLabel: string
  onDismiss: () => void
}

export function DismissibleNotice({
  children,
  variant = 'error',
  dismissLabel,
  onDismiss,
}: Props) {
  return (
    <div className={`notice ${variant} notice-dismissible`} role="alert">
      <p>{children}</p>
      <button
        type="button"
        className="btn-icon btn-icon-ghost notice-dismiss"
        aria-label={dismissLabel}
        onClick={onDismiss}
      >
        <YlIcon name="xmark" size={16} />
      </button>
    </div>
  )
}
