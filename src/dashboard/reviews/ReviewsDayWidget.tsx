import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  DashboardColSpan,
  DashboardRowSpan,
  ReviewsPresentation,
} from '../types'
import { usePermissions } from '../../rbac/PermissionsProvider'
import { loadReviewsSnapshot, useReviewsLive } from './reviews-live-store'
import { useDashboardNav } from '../dashboard-navigation'
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
  colSpan = 2,
  rowSpan = 2,
  variant = 'editorial',
}: Props) {
  const { t, i18n } = useTranslation()
  const { ready } = usePermissions()
  const nav = useDashboardNav()
  const { activeCount, loading, error } = useReviewsLive()
  useEffect(() => {
    if (!ready) {
      return
    }
    void loadReviewsSnapshot()
  }, [ready])

  const message = resolveError(error, t)
  const locale = i18n.resolvedLanguage || i18n.language || 'en'
  const cell = colSpan === 1 && rowSpan === 1

  return (
    <div className={`yl-dashboard-reviews${cell ? ' is-cell' : ''}`}>
      <ReviewsWidget
        activeCount={loading && activeCount === null ? null : activeCount}
        variant={variant}
        locale={locale}
        error={message && activeCount === null ? message : ''}
        onOpen={
          nav
            ? () =>
                nav.toPage('Reviews', {
                  reviewsCreatedPreset:
                    (activeCount ?? 0) > 0 ? 'last7' : 'none',
                })
            : undefined
        }
      />
    </div>
  )
}
