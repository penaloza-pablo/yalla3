import { loadUpcomingCheckins } from './checkin/tracker-live-store'
import { loadPlanningSnapshot } from './planning/planning-live-store'
import { loadReviewsSnapshot } from './reviews/reviews-live-store'
import { loadSuppliesSnapshot } from './supplies/supplies-live-store'

export type DashboardLoadOptions = {
  silent?: boolean
}

export const DASHBOARD_REFRESH_MS = 60_000
export const DASHBOARD_IDLE_MS = 15 * 60 * 1000

export const refreshDashboardSnapshots = (options?: {
  force?: boolean
  silent?: boolean
}) => {
  const force = options?.force ?? true
  const silent = { silent: Boolean(options?.silent) }
  return Promise.all([
    loadPlanningSnapshot(force, silent),
    loadReviewsSnapshot(force, silent),
    loadSuppliesSnapshot(force, silent),
    loadUpcomingCheckins(force, undefined, silent),
  ])
}
