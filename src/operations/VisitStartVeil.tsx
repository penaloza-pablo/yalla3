import { YlIcon } from '../design/icons'

type Props = {
  busy: boolean
  disabled?: boolean
  label: string
  revealLabel: string
  notice?: string
  dismissLabel: string
  onDismissNotice?: () => void
  onStart: () => void
  onReveal: () => void
}

export function VisitStartVeil({
  busy,
  disabled = false,
  label,
  revealLabel,
  notice,
  dismissLabel,
  onDismissNotice,
  onStart,
  onReveal,
}: Props) {
  return (
    <div className="visit-start-veil">
      {notice ? (
        <div className="visit-start-veil-notice" role="alert">
          <p>{notice}</p>
          {onDismissNotice ? (
            <button type="button" onClick={onDismissNotice}>
              {dismissLabel}
            </button>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        className="visit-start-button"
        disabled={busy || disabled}
        onClick={onStart}
      >
        <YlIcon name="play" variant="fill" size={40} />
        <span>{label}</span>
      </button>
      <button type="button" className="visit-start-reveal" onClick={onReveal}>
        {revealLabel}
      </button>
    </div>
  )
}
