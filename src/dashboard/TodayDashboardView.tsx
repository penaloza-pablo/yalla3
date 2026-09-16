import { useTranslation } from 'react-i18next'
import { usePermissions } from '../rbac/PermissionsProvider'
import { DashboardGrid } from './DashboardGrid'
import { useDashboardLayout } from './layout-store'
import './dashboard.css'

export function TodayDashboardView() {
  const { t } = useTranslation()
  const { dashboardLayoutId } = usePermissions()
  const layout = useDashboardLayout(dashboardLayoutId)

  return (
    <section className="yl-dashboard is-board" aria-label={t('today.dashboard')}>
      <DashboardGrid layout={layout} variant="board" />
    </section>
  )
}
