import type { CSSProperties } from 'react'
import {
  SUPPLY_ICONS,
  SUPPLY_ROWS,
  suppliesCopy,
  suppliesState,
} from './supplies-model.mjs'
import './supplies.css'

export interface SuppliesData {
  stockAlerts: number
  waitingDelivery: number
  overdue: number
  waitingInvoice: number
}
export interface SuppliesWidgetProps {
  data: SuppliesData | null
  variant?: 'focus' | 'grid'
  locale?: string
  error?: string
  className?: string
  style?: CSSProperties
}

function Icon({ name }: { name: keyof typeof SUPPLY_ICONS }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={SUPPLY_ICONS[name]} />
    </svg>
  )
}

export function SuppliesWidget({
  data,
  variant = 'focus',
  locale = 'en',
  error,
  className = '',
  style,
}: SuppliesWidgetProps) {
  const copy = suppliesCopy(locale)
  let state: ReturnType<typeof suppliesState> | null = null
  let problem = error
  try {
    state = suppliesState(data)
  } catch {
    problem = problem || copy.invalid
  }
  const loading = state?.kind === 'loading' && !problem
  const ready = state?.kind === 'clear'
  const restockLabel =
    data && data.stockAlerts === 1 ? copy.restockOne : copy.restockMany
  const clearTitle = ready ? copy.allClear : copy.stockClear

  return (
    <section
      className={`kk-supplies ${variant === 'grid' ? 'ks-grid' : ''} ${className}`.trim()}
      style={style}
      aria-label={copy.ariaLabel}
      aria-busy={loading}
    >
      <header className="ks-head">
        <h2 className="ks-title">{copy.title}</h2>
        {ready ? <span className="ks-ok">{copy.allSet}</span> : <Icon name="box" />}
      </header>
      {loading || problem ? (
        <p className="ks-message" role={problem ? 'alert' : 'status'}>
          {problem || copy.loading}
        </p>
      ) : (
        data && (
          <>
            {variant === 'focus' ? (
              <>
                <div className="ks-hero">
                  {data.stockAlerts > 0 ? (
                    <>
                      <strong
                        className={`ks-number ${data.stockAlerts >= 1000 ? 'ks-long' : ''}`}
                      >
                        {data.stockAlerts}
                      </strong>
                      <p className="ks-hero-label">{restockLabel}</p>
                      <p className="ks-stock-caption">{copy.stockCaption}</p>
                    </>
                  ) : (
                    <>
                      <p className="ks-summary">
                        {clearTitle[0]}
                        <br />
                        {clearTitle[1]}
                      </p>
                      <div className="ks-ready-line">
                        <Icon name="check" />
                        {copy.noStockAlerts}
                      </div>
                    </>
                  )}
                </div>
                <div className="ks-purchases">
                  {SUPPLY_ROWS.slice(1).map((row) => (
                    <div
                      key={row.key}
                      className={`ks-item ${
                        row.key === 'overdue' && data.overdue > 0 ? 'is-overdue' : ''
                      }`}
                      aria-label={`${row.label}: ${data[row.key]}`}
                    >
                      <strong
                        className={`ks-item-value ${data[row.key] >= 1000 ? 'ks-long' : ''}`}
                      >
                        {data[row.key]}
                      </strong>
                      <span className="ks-item-label">{row.label}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="ks-grid-body">
                {SUPPLY_ROWS.map((row) => (
                  <div
                    className={`ks-tile ${
                      row.key === 'stockAlerts' && data.stockAlerts > 0 ? 'is-stock' : ''
                    } ${row.key === 'overdue' && data.overdue > 0 ? 'is-late' : ''}`}
                    key={row.key}
                    aria-label={`${row.detail}: ${data[row.key]}`}
                  >
                    <div className="ks-tile-top">
                      <Icon name={row.icon} />
                      {data[row.key] > 0 ? (
                        <strong
                          className={`ks-tile-value ${data[row.key] >= 1000 ? 'ks-long' : ''}`}
                        >
                          {data[row.key]}
                        </strong>
                      ) : (
                        <span className="ks-tile-check" aria-label="Sin pendientes">
                          ✓
                        </span>
                      )}
                    </div>
                    <span className="ks-tile-label">{row.label}</span>
                  </div>
                ))}
              </div>
            )}
            <span className="ks-sr" role="status" aria-live="polite">
              {SUPPLY_ROWS.map((row) => `${row.detail}: ${data[row.key]}`).join('. ')}
            </span>
          </>
        )
      )}
    </section>
  )
}
