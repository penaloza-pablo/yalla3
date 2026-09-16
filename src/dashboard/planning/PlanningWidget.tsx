import type { CSSProperties } from 'react'
import {
  PLANNER_ICONS,
  planningCopy,
  planningLocale,
  planningRows,
  planningStatus,
  radarGeometry,
} from './planning-model.mjs'
import './planning.css'

export interface PlanningCount {
  completed: number
  total: number
}
export interface PlanningData {
  maintenance: { completed: number; total: 2 }
  cleaning: { completed: number; total: 2 }
  /** completed = records without warnings, not completed reservations. */
  bookings: PlanningCount
}
export interface PlanningWidgetProps {
  data: PlanningData | null
  variant?: 'rings' | 'ledger'
  tone?: 'slate' | 'cream' | 'green'
  locale?: string
  error?: string
  className?: string
  style?: CSSProperties
  onArcClick?: (key: 'maintenance' | 'cleaning' | 'bookings') => void
}

export function PlanningWidget({
  data,
  variant = 'rings',
  tone = 'slate',
  locale = 'en',
  error,
  className = '',
  style,
  onArcClick,
}: PlanningWidgetProps) {
  const copy = planningCopy(locale)
  let rows: ReturnType<typeof planningRows> | null = null
  let message = error || (data === null ? copy.loading : '')
  if (data && !error) {
    try {
      rows = planningRows(data, locale)
    } catch {
      message = copy.invalid
    }
  }
  const status = rows ? planningStatus(rows, locale) : ''
  const summary = rows
    ? `${copy.title}: ${status}. ${rows
        .map(
          (row) =>
            `${row.label}: ${row.completed} ${planningLocale(locale) === 'es' ? 'de' : 'of'} ${row.total}${
              row.key === 'bookings'
                ? ''
                : ` ${copy.closedTodayTomorrow}`
            }`,
        )
        .join('. ')}`
    : copy.ariaLabel

  return (
    <section
      className={`kk-planning ${
        variant === 'ledger' ? 'kp-ledger' : `kp-radar kp-tone-${tone}`
      } ${className}`.trim()}
      style={style}
      aria-label={copy.ariaLabel}
      aria-busy={data === null && !error}
    >
      {message ? (
        <p className="kp-message" role={data === null && !error ? 'status' : 'alert'}>
          {message}
        </p>
      ) : (
        rows && (
          <svg
            viewBox="0 0 220 220"
            preserveAspectRatio="xMidYMid meet"
            role={variant === 'rings' ? 'group' : 'img'}
            aria-label={summary}
          >
            {variant === 'rings' ? (
              <>
                {rows.map((row, index) => {
                  const geometry = radarGeometry(index)
                  const detail = `${row.label} ${row.completed}/${row.total}`
                  return (
                    <g
                      key={row.key}
                      className={`kp-arc kp-area-${row.key}${onArcClick ? ' is-link' : ''}`}
                      tabIndex={0}
                      role="link"
                      aria-label={`${detail}. ${
                        row.key === 'bookings'
                          ? copy.recordsWithoutAlarms
                          : copy.plansTodayTomorrow
                      }`}
                      onClick={(event) => {
                        event.preventDefault()
                        onArcClick?.(row.key)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onArcClick?.(row.key)
                        }
                        if (event.key === 'Escape') {
                          event.currentTarget.blur()
                        }
                      }}
                    >
                      <g className="kp-arc-visual" aria-hidden="true">
                        <path className="kp-track" d={geometry.path} />
                        <path
                          className={`kp-ring kp-${row.key}`}
                          d={geometry.path}
                          pathLength="100"
                          strokeDasharray={`${row.ratio * 100} 100`}
                          opacity={row.completed ? 1 : 0}
                        />
                        <circle className="kp-icon-bg" cx={geometry.x} cy={geometry.y} r="9" />
                        <path
                          className={`kp-area-icon kp-${row.key}`}
                          d={PLANNER_ICONS[row.key]}
                          transform={`translate(${geometry.x - 6},${geometry.y - 6}) scale(.75)`}
                        />
                      </g>
                      <path className="kp-hit" d={geometry.path} aria-hidden="true" />
                      <circle
                        className="kp-icon-hit"
                        cx={geometry.x}
                        cy={geometry.y}
                        r="10"
                        aria-hidden="true"
                      />
                      <g className="kp-tooltip" aria-hidden="true">
                        <rect x="14" y="191" width="192" height="22" rx="7" />
                        <text x="110" y="206" textAnchor="middle" fontSize="10">
                          {detail}
                        </text>
                      </g>
                    </g>
                  )
                })}
              </>
            ) : (
              <>
                <text x="19" y="28" className="kp-main" fontSize="12" fontWeight="600">
                  {copy.title}
                </text>
                <text x="200" y="28" className="kp-status" textAnchor="end" fontSize="9">
                  {status}
                </text>
                {rows.map((row, index) => (
                  <g key={row.key}>
                    <text x="19" y={61 + index * 55} className="kp-main" fontSize="11">
                      {row.label}
                    </text>
                    <text
                      x="200"
                      y={61 + index * 55}
                      className="kp-main"
                      textAnchor="end"
                      fontSize="13"
                    >
                      {row.completed}/{row.total}
                    </text>
                    <rect
                      x="19"
                      y={70 + index * 55}
                      width="181"
                      height="5"
                      rx="2.5"
                      className="kp-base"
                    />
                    <rect
                      x="19"
                      y={70 + index * 55}
                      width={181 * row.ratio}
                      height="5"
                      rx="2.5"
                      className="kp-progress"
                    />
                    <text x="19" y={89 + index * 55} className="kp-muted" fontSize="8.5">
                      {row.key === 'bookings'
                        ? `${row.percent} ${copy.withoutAlarms}`
                        : copy.todayTomorrow}
                    </text>
                  </g>
                ))}
              </>
            )}
          </svg>
        )
      )}
    </section>
  )
}
