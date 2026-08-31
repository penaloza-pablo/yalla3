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

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  onNavigate: (page: string) => void
}

const formatRatio = (t: TFunction, done: number, total: number) =>
  t('today.ratio', { done, total })

const isRatioComplete = (done: number, total: number) =>
  total > 0 && done === total

const RatioMetric = ({
  label,
  done,
  total,
  t,
}: {
  label: string
  done: number
  total: number
  t: TFunction
}) => {
  if (total <= 0) {
    return null
  }
  return (
    <li>
      <span>{label}</span>
      <strong>
        {formatRatio(t, done, total)}
        {isRatioComplete(done, total) ? (
          <span className="today-metric-check" aria-hidden="true">
            ✓
          </span>
        ) : null}
      </strong>
    </li>
  )
}

const CountMetric = ({ label, value }: { label: string; value: number }) => {
  if (value <= 0) {
    return null
  }
  return (
    <li>
      <span>{label}</span>
      <strong>{value}</strong>
    </li>
  )
}

const MetricsOrDone = ({
  done,
  doneLabel,
  children,
}: {
  done: boolean
  doneLabel: string
  children: ReactNode
}) => {
  if (done) {
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
              <button className="btn-ghost" type="button" onClick={() => void loadSummary()}>
                {t('common.refresh')}
              </button>
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {error ? <div className="alert">{error}</div> : null}
      {isLoading && !summary ? <p>{t('today.loading')}</p> : null}

      {summary ? (
        <section className="today-cards" aria-label={t('pages.Today')}>
          <button
            type="button"
            className="card today-card"
            onClick={() => onNavigate('Cleaning Plan')}
          >
            <h2 className="today-card-title">{t('today.cleaning')}</h2>
            <MetricsOrDone done={cleaningDone} doneLabel={t('today.goodJob')}>
              <RatioMetric
                label={t('today.planning')}
                done={summary.cleaning.planningReady}
                total={summary.cleaning.planningTotal}
                t={t}
              />
              <RatioMetric
                label={t('today.currentCleanings')}
                done={summary.cleaning.currentCompleted}
                total={summary.cleaning.currentTotal}
                t={t}
              />
              <CountMetric
                label={t('today.previousCleanings')}
                value={summary.cleaning.previousOpen}
              />
            </MetricsOrDone>
          </button>

          <button
            type="button"
            className="card today-card"
            onClick={() => onNavigate('Daily Operations')}
          >
            <h2 className="today-card-title">{t('today.maintenance')}</h2>
            <MetricsOrDone done={maintenanceDone} doneLabel={t('today.goodJob')}>
              <RatioMetric
                label={t('today.currentMaintenance')}
                done={summary.maintenance.currentCompleted}
                total={summary.maintenance.currentTotal}
                t={t}
              />
              <CountMetric
                label={t('today.toEstimate')}
                value={summary.maintenance.previousOpen}
              />
            </MetricsOrDone>
          </button>

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

          <button
            type="button"
            className="card today-card"
            onClick={() => onNavigate('Inventory')}
          >
            <h2 className="today-card-title">{t('today.inventory')}</h2>
            <MetricsOrDone done={inventoryDone} doneLabel={t('today.goodJob')}>
              <CountMetric
                label={t('today.waitingDelivery')}
                value={summary.inventory.waitingDelivery}
              />
              <CountMetric
                label={t('today.reorder')}
                value={summary.inventory.reorder}
              />
              <CountMetric
                label={t('today.lowStock')}
                value={summary.inventory.lowStock}
              />
            </MetricsOrDone>
          </button>
        </section>
      ) : null}
    </>
  )
}
