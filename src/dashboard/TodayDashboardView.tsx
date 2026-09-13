import { useTranslation } from 'react-i18next'
import { ACTION_KEYS } from '../../amplify/functions/shared/rbac-catalog'
import { usePermissions } from '../rbac/PermissionsProvider'
import { DashboardGrid } from './DashboardGrid'
import { useDashboardLayout } from './layout-store'
import './dashboard.css'

export function TodayDashboardView() {
  const { t } = useTranslation()
  const { can, dashboardLayoutId } = usePermissions()
  const layout = useDashboardLayout(dashboardLayoutId)

  return (
    <section className="yl-dashboard is-board" aria-label={t('today.dashboard')}>
      <DashboardGrid
        layout={layout}
        variant="board"
        showConfig={can(ACTION_KEYS.dashboardConfigureWidgets)}
      />
    </section>
  )
}
