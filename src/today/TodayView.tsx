import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { fetchJson } from '../operations/api'

type TodaySummary = {
  date: string
  cleaning: {
    planningReady: number
    planningTotal: number
    currentCompleted: number
    currentTotal: number
    previousOpen: number
  }
  maintenance: {
    currentCompleted: number
    currentTotal: number
    previousOpen: number
  }
  reviews: {
    needsAttention: number
  }
  inventory: {
    waitingDelivery: number
    reorder: number
    lowStock: number
  }
}

type NavigateOptions = {
  inventoryStatuses?: string[]
}

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  onNavigate: (page: string, options?: NavigateOptions) => void
}

const TODAY_INVENTORY_STATUSES = [
  'Waiting Delivery',
  'Low Stock',
  'Reorder',
]

const formatRatio = (t: TFunction, done: number, total: number) =>
  t('today.ratio', { done, total })

const isRatioComplete = (done: number, total: number) =>
  total > 0 && done === total

const RatioMetric = ({
  label,
  done,
  total,
  t,
  onClick,
}: {
  label: string
  done: number
  total: number
  t: TFunction
  onClick: () => void
}) => {
  if (total <= 0) {
    return null
  }
  return (
    <li>
      <button type="button" className="today-metric-btn" onClick={onClick}>
        <span>{label}</span>
        <strong>
          {formatRatio(t, done, total)}
          {isRatioComplete(done, total) ? (
            <span className="today-metric-check" aria-hidden="true">
              ✓
            </span>
          ) : null}
        </strong>
      </button>
    </li>
  )
}

const CountMetric = ({
  label,
  value,
  onClick,
}: {
  label: string
  value: number
  onClick: () => void
}) => {
  if (value <= 0) {
    return null
  }
  return (
    <li>
      <button type="button" className="today-metric-btn" onClick={onClick}>
        <span>{label}</span>
        <strong>{value}</strong>
      </button>
    </li>
  )
}

const MetricsOrDone = ({
  done,
  doneLabel,
  onDoneClick,
  children,
}: {
  done: boolean
  doneLabel: string
  onDoneClick?: () => void
  children: ReactNode
}) => {
  if (done) {
    if (onDoneClick) {
      return (
        <button type="button" className="today-good-job today-good-job-btn" onClick={onDoneClick}>
          {doneLabel}
        </button>
      )
    }
    return <p className="today-good-job">{doneLabel}</p>
  }
  return <ul className="today-metrics">{children}</ul>
}

export function TodayView({
  getEndpoint,
  onNavigate,
}: Props) {
  const { t } = useTranslation()
  const [summary, setSummary] = useState<TodaySummary | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const loadSummary = useCallback(async () => {
    const endpoint = getEndpoint(
      'getTodaySummaryUrl',
      import.meta.env.VITE_GET_TODAY_SUMMARY_URL,
    )
    if (!endpoint) {
      setError(t('today.missingEndpoint'))
      return
    }
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchJson<TodaySummary>(endpoint)
      setSummary(payload)
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : t('today.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [getEndpoint, t])

  useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const cleaningDone = Boolean(
    summary &&
      summary.cleaning.planningReady === summary.cleaning.planningTotal &&
      (summary.cleaning.currentTotal === 0 ||
        summary.cleaning.currentCompleted === summary.cleaning.currentTotal) &&
      summary.cleaning.previousOpen === 0,
  )
  const maintenanceDone = Boolean(
    summary &&
      (summary.maintenance.currentTotal === 0 ||
        summary.maintenance.currentCompleted ===
          summary.maintenance.currentTotal) &&
      summary.maintenance.previousOpen === 0,
  )
  const reviewsDone = Boolean(summary && summary.reviews.needsAttention === 0)
  const inventoryDone = Boolean(
    summary &&
      summary.inventory.waitingDelivery === 0 &&
      summary.inventory.reorder === 0 &&
      summary.inventory.lowStock === 0,
  )

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('today.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Today')}</h1>
          </div>
          <p className="subtitle">{t('today.subtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <div className="header-actions">
              <button
                className="btn-ghost"
                type="button"
                onClick={() => onNavigate('Daily Operations')}
                aria-label={t('today.openDailyOps')}
                title={t('today.openDailyOps')}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
                  <path
                    d="M6 2h2v2h4V2h2v2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2zm10 6H4v8h12V8z"
                    fill="currentColor"
                  />
                </svg>
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => void loadSummary()}
                disabled={isLoading}
                aria-label={t('common.refresh')}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
                  <path
                    d="M16 4v5h-5l1.8-1.8a4.5 4.5 0 1 0 1.3 4.3h1.9a6.5 6.5 0 1 1-1.9-4.6L16 4z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {error ? <div className="alert">{error}</div> : null}
      {isLoading && !summary ? <p>{t('today.loading')}</p> : null}

      {summary ? (
        <section className="today-cards" aria-label={t('pages.Today')}>
          <article className="card today-card">
            <h2 className="today-card-title">{t('today.cleaning')}</h2>
            <MetricsOrDone done={cleaningDone} doneLabel={t('today.goodJob')}>
              <RatioMetric
                label={t('today.planning')}
                done={summary.cleaning.planningReady}
                total={summary.cleaning.planningTotal}
                t={t}
                onClick={() => onNavigate('Cleaning Plan')}
              />
              <RatioMetric
                label={t('today.currentCleanings')}
                done={summary.cleaning.currentCompleted}
                total={summary.cleaning.currentTotal}
                t={t}
                onClick={() => onNavigate('Daily Operations')}
              />
              <CountMetric
                label={t('today.previousCleanings')}
                value={summary.cleaning.previousOpen}
                onClick={() => onNavigate('Cleaning Billing')}
              />
            </MetricsOrDone>
          </article>

          <article className="card today-card">
            <h2 className="today-card-title">{t('today.maintenance')}</h2>
            <MetricsOrDone done={maintenanceDone} doneLabel={t('today.goodJob')}>
              <RatioMetric
                label={t('today.currentMaintenance')}
                done={summary.maintenance.currentCompleted}
                total={summary.maintenance.currentTotal}
                t={t}
                onClick={() => onNavigate('Daily Operations')}
              />
              <CountMetric
                label={t('today.toEstimate')}
                value={summary.maintenance.previousOpen}
                onClick={() => onNavigate('Maintenance Billing')}
              />
            </MetricsOrDone>
          </article>

          <button
            type="button"
            className="card today-card"
            onClick={() => onNavigate('Reviews')}
          >
            <h2 className="today-card-title">{t('today.reviews')}</h2>
            {reviewsDone ? (
              <p className="today-good-job">{t('today.goodJob')}</p>
            ) : (
              <p className="today-attention">
                {t('today.reviewsNeedAttention', {
                  count: summary.reviews.needsAttention,
                })}
              </p>
            )}
          </button>

          <article className="card today-card">
            <button
              type="button"
              className="today-card-title-btn"
              onClick={() =>
                onNavigate('Inventory', {
                  inventoryStatuses: TODAY_INVENTORY_STATUSES,
                })
              }
            >
              {t('today.inventory')}
            </button>
            <MetricsOrDone
              done={inventoryDone}
              doneLabel={t('today.goodJob')}
              onDoneClick={() =>
                onNavigate('Inventory', {
                  inventoryStatuses: TODAY_INVENTORY_STATUSES,
                })
              }
            >
              <CountMetric
                label={t('today.waitingDelivery')}
                value={summary.inventory.waitingDelivery}
                onClick={() =>
                  onNavigate('Inventory', {
                    inventoryStatuses: TODAY_INVENTORY_STATUSES,
                  })
                }
              />
              <CountMetric
                label={t('today.reorder')}
                value={summary.inventory.reorder}
                onClick={() =>
                  onNavigate('Inventory', {
                    inventoryStatuses: TODAY_INVENTORY_STATUSES,
                  })
                }
              />
              <CountMetric
                label={t('today.lowStock')}
                value={summary.inventory.lowStock}
                onClick={() =>
                  onNavigate('Inventory', {
                    inventoryStatuses: TODAY_INVENTORY_STATUSES,
                  })
                }
              />
            </MetricsOrDone>
          </article>
        </section>
      ) : null}
    </>
  )
}
