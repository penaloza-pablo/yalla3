type ProgressCardProps = {
  label: string
  valueLabel: string
  value: number
  max: number
  meta?: string
}

export function ProgressCard({
  label,
  valueLabel,
  value,
  max,
  meta,
}: ProgressCardProps) {
  const safeMax = max <= 0 ? 1 : max
  const ratio = Math.max(0, Math.min(1, value / safeMax))
  const percent = Math.round(ratio * 100)

  return (
    <article className="card card-compact yl-progress-card">
      <p className="card-label">{label}</p>
      <p className="card-value">{valueLabel}</p>
      <div
        className="yl-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={value}
        aria-label={label}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      {meta ? <p className="card-meta">{meta}</p> : null}
    </article>
  )
}
