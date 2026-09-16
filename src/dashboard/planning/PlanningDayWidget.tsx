import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  DashboardColSpan,
  DashboardRowSpan,
  PlanningPresentation,
} from '../types'
import { loadPlanningSnapshot, usePlanningLive } from './planning-live-store'
import { PlanningWidget } from './PlanningWidget'
import '../dashboard.css'

type Props = {
  name?: string
  colSpan?: DashboardColSpan
  rowSpan?: DashboardRowSpan
  variant?: PlanningPresentation['variant']
  tone?: PlanningPresentation['tone']
}

const resolveError = (error: string, t: (key: string) => string) => {
  if (!error) {
    return ''
  }
  if (error === 'missingTodayEndpoint') {
    return t('today.missingEndpoint')
  }
  if (error === 'missingBookingsEndpoint') {
    return t('bookingsPlan.missingEndpoint')
  }
  if (error === 'loadError') {
    return t('today.loadError')
  }
  return error
}

export function PlanningDayWidget({
  colSpan = 2,
  rowSpan = 2,
  variant = 'rings',
  tone = 'slate',
}: Props) {
  const { t, i18n } = useTranslation()
  const { data, loading, error } = usePlanningLive()
  useEffect(() => {
    void loadPlanningSnapshot()
  }, [])

  const message = resolveError(error, t)
  const locale = i18n.resolvedLanguage || i18n.language || 'en'
  const cell = colSpan === 1 && rowSpan === 1

  return (
    <div className={`yl-dashboard-planning${cell ? ' is-cell' : ''}`}>
      <PlanningWidget
        data={loading && !data ? null : data}
        variant={variant}
        tone={tone}
        locale={locale}
        error={message && !data ? message : ''}
      />
    </div>
  )
}
