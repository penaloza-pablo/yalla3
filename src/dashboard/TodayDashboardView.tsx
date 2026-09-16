import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePermissions } from '../rbac/PermissionsProvider'
import { loadUpcomingCheckins } from './checkin/tracker-live-store'
import { DashboardGrid } from './DashboardGrid'
import { useDashboardLayout } from './layout-store'
import { wait } from './live-retry'
import { loadPlanningSnapshot } from './planning/planning-live-store'
import { loadReviewsSnapshot } from './reviews/reviews-live-store'
import { loadSuppliesSnapshot } from './supplies/supplies-live-store'
import './dashboard.css'

export function TodayDashboardView() {
  const { t } = useTranslation()
  const { ready, dashboardLayoutId } = usePermissions()
  const layout = useDashboardLayout(dashboardLayoutId)
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    if (!ready) {
      setBooted(false)
      return
    }
    let cancelled = false
    void (async () => {
      await wait(280)
      try {
        await Promise.all([
          loadPlanningSnapshot(true),
          loadReviewsSnapshot(true),
          loadSuppliesSnapshot(true),
          loadUpcomingCheckins(true),
        ])
      } finally {
        if (!cancelled) {
          setBooted(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready])

  return (
    <section className="yl-dashboard is-board" aria-label={t('today.dashboard')}>
      {!booted ? (
        <div className="yl-dashboard-boot" role="status" aria-live="polite">
          <span className="yl-dashboard-boot-mark" aria-hidden="true" />
          <p>{t('today.loading')}</p>
        </div>
      ) : (
        <DashboardGrid layout={layout} variant="board" />
      )}
    </section>
  )
}
