type StatTone = 'default' | 'success' | 'warning' | 'danger'

type StatCardProps = {
  label: string
  value: string | number
  meta?: string
  tone?: StatTone
}

export function StatCard({
  label,
  value,
  meta,
  tone = 'default',
}: StatCardProps) {
  return (
    <article className={`card card-compact yl-stat-card is-${tone}`}>
      <p className="card-label">{label}</p>
      <p className="card-value">{value}</p>
      {meta ? <p className="card-meta">{meta}</p> : null}
    </article>
  )
}
