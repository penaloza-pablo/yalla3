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
  name,
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

  const compact = colSpan === 1 && rowSpan === 1
  const message = resolveError(error, t)
  const locale = i18n.resolvedLanguage || i18n.language || 'en'
  const title = name || t('dashboard.widgets.planningRadarSlate')

  if (compact) {
    const maintenance = data?.maintenance
    const cleaning = data?.cleaning
    const bookings = data?.bookings
    const bookingsPercent =
      bookings && bookings.total
        ? `${Math.round((bookings.completed / bookings.total) * 100)}%`
        : '—'
    return (
      <div className="yl-dashboard-checkin-mini">
        <p className="yl-dashboard-widget-name">{title}</p>
        {loading && !data ? (
          <p className="yl-dashboard-checkin-status">{t('today.loading')}</p>
        ) : message && !data ? (
          <p className="yl-dashboard-checkin-status" role="alert">
            {message}
          </p>
        ) : (
          <>
            <p className="yl-dashboard-checkin-mini-name">{bookingsPercent}</p>
            <p className="yl-dashboard-checkin-status">
              {t('today.ratio', {
                done: maintenance?.completed ?? 0,
                total: maintenance?.total ?? 2,
              })}{' '}
              ·{' '}
              {t('today.ratio', {
                done: cleaning?.completed ?? 0,
                total: cleaning?.total ?? 2,
              })}
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="yl-dashboard-planning">
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
