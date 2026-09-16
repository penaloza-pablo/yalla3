import type { CSSProperties } from 'react'
import {
  activityCopy,
  activityRows,
  frequencySegments,
  orbitCaption,
} from './activity-model.mjs'
import './activity.css'

export interface ActivityCount {
  total: number
  completed: number
}
export interface ActivityData {
  checkins: ActivityCount & { early: number }
  cleaning: ActivityCount
  maintenance: ActivityCount
}
export interface ActivityWidgetProps {
  data: ActivityData | null
  variant?: 'arcs' | 'frequency'
  tone?: 'original' | 'rose' | 'slate' | 'blue'
  dateLabel?: string
  locale?: string
  error?: string
  className?: string
  style?: CSSProperties & Record<`--kk-${string}`, string>
}

const clock = (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
    <circle cx="8" cy="8" r="6" />
    <path d="M8 4v4l3 1" />
  </svg>
)

function Early({ value, label }: { value: number; label: string }) {
  return (
    <span className="ka-early" aria-label={label}>
      {clock}
      {value} Early
    </span>
  )
}

export function ActivityWidget({
  data,
  variant = 'arcs',
  tone = 'original',
  dateLabel,
  locale = 'en',
  error,
  className = '',
  style,
}: ActivityWidgetProps) {
  const copy = activityCopy(locale)
  const resolvedDate = dateLabel || copy.today
  let rows: ReturnType<typeof activityRows> | null = null
  let message = error || (data === null ? copy.loading : '')
  if (data !== null && !error) {
    try {
      rows = activityRows(data, locale)
    } catch {
      message = copy.invalid
    }
  }

  return (
    <section
      className={`kk-activity ${className}`}
      style={style}
      aria-label={`${copy.activity} · ${resolvedDate}`}
      aria-busy={data === null && !error}
    >
      <div
        className={`ka-card ${
          variant === 'frequency' ? 'ka-frequency' : `ka-orbit ka-tone-${tone}`
        }`}
      >
        {variant === 'frequency' ? (
          <header className="ka-header">
            <h2 className="ka-title">{copy.happening}</h2>
            <span className="ka-date">{resolvedDate}</span>
          </header>
        ) : null}
        {message ? (
          <p className="ka-message" role={data === null && !error ? 'status' : 'alert'}>
            {message}
          </p>
        ) : (
          rows &&
          (variant === 'arcs' ? (
            <div className="ka-grid">
              {rows.map((row) => (
                <div className="ka-metric" key={row.key}>
                  <div
                    className="ka-gauge"
                    role="img"
                    aria-label={`${row.label}: ${orbitCaption(row, locale)}`}
                  >
                    <svg viewBox="0 0 200 100" aria-hidden="true">
                      <path className="ka-track" d="M 10 94 A 90 90 0 0 1 190 94" pathLength="100" />
                      {row.total > 0 && (
                        <path
                          className="ka-fill"
                          d="M 10 94 A 90 90 0 0 1 190 94"
                          pathLength="100"
                          strokeDasharray={`${row.percent} 100`}
                          opacity={row.completed ? 1 : 0}
                        />
                      )}
                    </svg>
                    <div className="ka-center" aria-hidden="true">
                      <span className="ka-total">{row.total}</span>
                      <span className="ka-unit">{copy.inDay}</span>
                    </div>
                  </div>
                  <p className="ka-caption">{orbitCaption(row, locale)}</p>
                  <div className="ka-meta">
                    {row.key === 'checkins' ? (
                      <Early
                        value={data!.checkins.early}
                        label={copy.earlyAria(data!.checkins.early)}
                      />
                    ) : row.complete ? (
                      <span className="ka-done">✓ {copy.allSet}</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              {rows.map((row) => (
                <div className="ka-row" key={row.key}>
                  <div>
                    <h3 className="ka-row-name">{row.label}</h3>
                    <div className="ka-row-meta">
                      {row.key === 'checkins' ? (
                        <Early
                          value={data!.checkins.early}
                          label={copy.earlyAria(data!.checkins.early)}
                        />
                      ) : row.total === 0 ? (
                        row.empty
                      ) : (
                        copy.jobsToday
                      )}
                    </div>
                  </div>
                  <span className="ka-row-total" aria-label={copy.totalAria(row.total)}>
                    {row.total}
                  </span>
                  <div>
                    <div
                      className="ka-bars"
                      role="img"
                      aria-label={`${row.label}: ${row.caption}`}
                    >
                      {frequencySegments(row.ratio).map((fill, index) => (
                        <span key={index} className="ka-segment" aria-hidden="true">
                          <span
                            className="ka-segment-fill"
                            style={{ display: 'block', width: `${fill * 100}%` }}
                          />
                        </span>
                      ))}
                    </div>
                    <div className="ka-row-caption">
                      <strong>{row.caption}</strong>
                      {row.complete ? (
                        <span className="ka-complete-mark" aria-label={copy.allSet}>
                          ✓
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </section>
  )
}
