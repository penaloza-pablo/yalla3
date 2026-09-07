type Props = {
  on: boolean
  disabled?: boolean
  label: string
  onToggle: () => void
}

export function YallaSwitch({ on, disabled, label, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`yalla-switch ${on ? 'is-on' : ''}`}
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className="yalla-switch-knob" />
    </button>
  )
}
