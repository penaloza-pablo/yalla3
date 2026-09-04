import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { fetchJson } from '../operations/api'
import { ACTION_KEYS } from '../../amplify/functions/shared/rbac-catalog'
import { usePermissions } from '../rbac/PermissionsProvider'

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
    remainingHours?: number
  }
  reviews: {
    needsAttention: number
  }
  unassignedTasks?: {
    pending: number
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
  embedded?: boolean
  refreshKey?: number
}

const TODAY_SUMMARY_CACHE_KEY = 'yalla.todaySummary.v2'

const readCachedSummary = (): TodaySummary | null => {
  try {
    const raw = sessionStorage.getItem(TODAY_SUMMARY_CACHE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as TodaySummary
    if (!parsed?.date || !parsed.cleaning || !parsed.inventory) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

const clearTodaySummaryCache = () => {
  try {
    sessionStorage.removeItem(TODAY_SUMMARY_CACHE_KEY)
  } catch {
    // Ignore quota or private-mode failures.
  }
}

export { clearTodaySummaryCache }

const TodayLoader = ({ label }: { label: string }) => (
  <div className="page-loader" role="status" aria-live="polite" aria-label={label}>
    <span className="page-loader-spinner" aria-hidden="true" />
  </div>
)

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

const writeCachedSummary = (summary: TodaySummary) => {
  try {
    sessionStorage.setItem(TODAY_SUMMARY_CACHE_KEY, JSON.stringify(summary))
  } catch {
    // Ignore quota or private-mode failures.
  }
}

const RemainingHoursMetric = ({
  hours,
  t,
  onClick,
}: {
  hours: number
  t: TFunction
  onClick: () => void
}) => (
  <li>
    <button type="button" className="today-metric-btn" onClick={onClick}>
      <span>{t('today.hoursRemaining')}</span>
      <strong>
        {hours < 0
          ? t('today.hoursRemainingSurplus', {
              hours: String(Math.abs(hours)).replace('.', ','),
            })
          : t('today.hoursRemainingValue', {
              hours: String(hours).replace('.', ','),
            })}
      </strong>
    </button>
  </li>
)

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
  embedded = false,
  refreshKey = 0,
}: Props) {
  const { t } = useTranslation()
  const { can } = usePermissions()
  const canSeeRemainingHours = can(ACTION_KEYS.dashboardMaintenanceHoursRemaining)
  const [summary, setSummary] = useState<TodaySummary | null>(readCachedSummary)
  const [isLoading, setIsLoading] = useState(() => !readCachedSummary())
  const [error, setError] = useState('')
  const hasSummaryRef = useRef(Boolean(summary))

  const loadSummary = useCallback(async () => {
    const endpoint = getEndpoint(
      'getTodaySummaryUrl',
      import.meta.env.VITE_GET_TODAY_SUMMARY_URL,
    )
    if (!endpoint) {
      setError(t('today.missingEndpoint'))
      return
    }
    if (!hasSummaryRef.current) {
      setIsLoading(true)
    }
    setError('')
    try {
      const payload = await fetchJson<TodaySummary>(endpoint)
      hasSummaryRef.current = true
      setSummary(payload)
      writeCachedSummary(payload)
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

  useEffect(() => {
    if (refreshKey <= 0) {
      return
    }
    clearTodaySummaryCache()
    void loadSummary()
  }, [loadSummary, refreshKey])

  const unassignedPending = summary?.unassignedTasks?.pending ?? 0
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
  const opsDone = Boolean(
    summary && summary.reviews.needsAttention === 0 && unassignedPending === 0,
  )
  const inventoryDone = Boolean(
    summary &&
      summary.inventory.waitingDelivery === 0 &&
      summary.inventory.reorder === 0 &&
      summary.inventory.lowStock === 0,
  )

  const cards = summary ? (
    <section className="today-cards" aria-label={t('today.ops')}>
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
        {canSeeRemainingHours &&
        typeof summary.maintenance.remainingHours === 'number' ? (
          <ul className="today-metrics">
            <RemainingHoursMetric
              hours={summary.maintenance.remainingHours}
              t={t}
              onClick={() => onNavigate('Maintenance Billing')}
            />
          </ul>
        ) : null}
      </article>

      <article className="card today-card">
        <h2 className="today-card-title">{t('today.ops')}</h2>
        <MetricsOrDone
          done={opsDone}
          doneLabel={t('today.goodJob')}
          onDoneClick={() => onNavigate('Reviews')}
        >
          <CountMetric
            label={t('today.reviews')}
            value={summary.reviews.needsAttention}
            onClick={() => onNavigate('Reviews')}
          />
          <CountMetric
            label={t('today.unassignedTasks')}
            value={unassignedPending}
            onClick={() => onNavigate('Unassigned tasks')}
          />
        </MetricsOrDone>
      </article>

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
  ) : null

  if (embedded) {
    return (
      <>
        {error ? <div className="alert">{error}</div> : null}
        {isLoading && !summary ? <TodayLoader label={t('today.loading')} /> : null}
        {cards}
      </>
    )
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('today.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('operations.dashboard')}</h1>
          </div>
          <p className="subtitle">{t('today.subtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <div className="header-actions">
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
      {isLoading && !summary ? <TodayLoader label={t('today.loading')} /> : null}
      {cards}
    </>
  )
}
