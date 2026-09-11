type Props = {
  children: string
  variant?: 'error' | 'success'
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
        ✕
      </button>
    </div>
  )
}
