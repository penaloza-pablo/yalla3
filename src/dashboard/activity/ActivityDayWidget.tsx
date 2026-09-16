import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ActivityPresentation,
  DashboardColSpan,
  DashboardRowSpan,
} from '../types'
import { loadUpcomingCheckins, useCheckinLive } from '../checkin/tracker-live-store'
import { ActivityWidget, type ActivityData } from './ActivityWidget'
import '../dashboard.css'

type Props = {
  name?: string
  colSpan?: DashboardColSpan
  rowSpan?: DashboardRowSpan
  variant?: ActivityPresentation['variant']
  tone?: ActivityPresentation['tone']
}

const resolveError = (error: string, t: (key: string) => string) => {
  if (!error) {
    return ''
  }
  if (error === 'missingEndpoint') {
    return t('checkInTracker.missingEndpoint')
  }
  if (error === 'loadError') {
    return t('checkInTracker.loadError')
  }
  return error
}

export function ActivityDayWidget({
  name,
  colSpan = 4,
  rowSpan = 1,
  variant = 'frequency',
  tone = 'original',
}: Props) {
  const { t, i18n } = useTranslation()
  const { activity, loading, error } = useCheckinLive()
  useEffect(() => {
    void loadUpcomingCheckins()
  }, [])

  const compact = colSpan === 1 && rowSpan === 1
  const message = resolveError(error, t)
  const locale = i18n.resolvedLanguage || i18n.language || 'en'
  const title = name || t('dashboard.widgets.human')

  if (compact) {
    const checkins = activity?.checkins
    return (
      <div className="yl-dashboard-checkin-mini">
        <p className="yl-dashboard-widget-name">{title}</p>
        {loading && !activity ? (
          <p className="yl-dashboard-checkin-status">{t('checkInTracker.loading')}</p>
        ) : message && !activity ? (
          <p className="yl-dashboard-checkin-status" role="alert">
            {message}
          </p>
        ) : (
          <>
            <p className="yl-dashboard-checkin-mini-name">{checkins?.total ?? 0}</p>
            <p className="yl-dashboard-checkin-status">
              {t('kit.widgetIncidentsCount', { count: checkins?.total ?? 0 })}
            </p>
            {checkins?.early ? (
              <p className="yl-dashboard-checkin-count">{checkins.early} Early</p>
            ) : null}
          </>
        )}
      </div>
    )
  }

  const data: ActivityData | null = loading && !activity ? null : activity

  return (
    <div className="yl-dashboard-activity">
      <ActivityWidget
        data={data}
        variant={variant}
        tone={tone}
        locale={locale}
        error={message && !activity ? message : ''}
        style={{
          '--kk-radius': 'var(--yl-radius-card)',
          '--kk-font': 'inherit',
        }}
      />
    </div>
  )
}
