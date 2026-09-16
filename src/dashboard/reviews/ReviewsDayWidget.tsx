import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  DashboardColSpan,
  DashboardRowSpan,
  ReviewsPresentation,
} from '../types'
import { loadReviewsSnapshot, useReviewsLive } from './reviews-live-store'
import { ReviewsWidget } from './ReviewsWidget'
import '../dashboard.css'

type Props = {
  name?: string
  colSpan?: DashboardColSpan
  rowSpan?: DashboardRowSpan
  variant?: ReviewsPresentation['variant']
}

const resolveError = (error: string, t: (key: string) => string) => {
  if (!error) {
    return ''
  }
  if (error === 'missingEndpoint') {
    return t('reviews.missingEndpoint')
  }
  if (error === 'loadError') {
    return t('today.loadError')
  }
  return error
}

export function ReviewsDayWidget({
  name,
  colSpan = 2,
  rowSpan = 2,
  variant = 'editorial',
}: Props) {
  const { t, i18n } = useTranslation()
  const { activeCount, loading, error } = useReviewsLive()
  useEffect(() => {
    void loadReviewsSnapshot()
  }, [])

  const compact = colSpan === 1 && rowSpan === 1
  const message = resolveError(error, t)
  const locale = i18n.resolvedLanguage || i18n.language || 'en'
  const title = name || t('dashboard.widgets.reviewsEditorial')
  const count = activeCount ?? 0

  if (compact) {
    return (
      <div className="yl-dashboard-checkin-mini">
        <p className="yl-dashboard-widget-name">{title}</p>
        {loading && activeCount === null ? (
          <p className="yl-dashboard-checkin-status">{t('reviews.loading')}</p>
        ) : message && activeCount === null ? (
          <p className="yl-dashboard-checkin-status" role="alert">
            {message}
          </p>
        ) : (
          <>
            <p className="yl-dashboard-checkin-mini-name">
              {count === 0 ? '✓' : count}
            </p>
            <p className="yl-dashboard-checkin-status">
              {t('reviews.statusPendingUnder5Meta')}
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="yl-dashboard-reviews">
      <ReviewsWidget
        activeCount={loading && activeCount === null ? null : activeCount}
        variant={variant}
        locale={locale}
        error={message && activeCount === null ? message : ''}
      />
    </div>
  )
}
