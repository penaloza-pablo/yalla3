import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  ActivityPresentation,
  DashboardColSpan,
  DashboardRowSpan,
} from '../types'
import { getTodayMadrid } from '../../operations/dateHelpers'
import { useDashboardDate } from '../dashboard-date-store'
import { usePermissions } from '../../rbac/PermissionsProvider'
import { loadUpcomingCheckins, useCheckinLive } from '../checkin/tracker-live-store'
import { dateParts } from '../date/date-model.mjs'
import { useDashboardNav } from '../dashboard-navigation'
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

const labelForDate = (date: string, locale: string) => {
  if (date === getTodayMadrid()) {
    return undefined
  }
  try {
    const parts = dateParts(date, locale)
    return `${parts.day} ${parts.month}`
  } catch {
    return date
  }
}

export function ActivityDayWidget({
  name,
  colSpan = 4,
  rowSpan = 1,
  variant = 'frequency',
  tone = 'original',
}: Props) {
  const { t, i18n } = useTranslation()
  const { ready, canTodayView } = usePermissions()
  const nav = useDashboardNav()
  const selectedDate = useDashboardDate()
  const { activity, loading, error, from } = useCheckinLive()
  useEffect(() => {
    if (!ready) {
      return
    }
    void loadUpcomingCheckins(false, selectedDate)
  }, [ready, selectedDate])

  const compact = colSpan === 1 && rowSpan === 1
  const message = resolveError(error, t)
  const locale = i18n.resolvedLanguage || i18n.language || 'en'
  const title = name || t('dashboard.widgets.human')
  const awaiting = loading || from !== selectedDate
  const dateLabel = labelForDate(selectedDate, locale)

  const openAgenda = (
    event: { preventDefault(): void; stopPropagation(): void },
  ) => {
    event.preventDefault()
    event.stopPropagation()
    nav?.toTodayView(canTodayView('agenda2') ? 'agenda2' : 'agenda')
  }

  if (compact) {
    const checkins = awaiting ? undefined : activity?.checkins
    return (
      <div
        className={`yl-dashboard-checkin-mini${nav ? ' is-link' : ''}`}
        role={nav ? 'button' : undefined}
        tabIndex={nav ? 0 : undefined}
        onClick={nav ? openAgenda : undefined}
        onKeyDown={
          nav
            ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  openAgenda(event)
                }
              }
            : undefined
        }
      >
        <p className="yl-dashboard-widget-name">{title}</p>
        {awaiting ? (
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

  const data: ActivityData | null = awaiting || (loading && !activity) ? null : activity

  return (
    <div className="yl-dashboard-activity">
      <ActivityWidget
        data={data}
        variant={variant}
        tone={tone}
        locale={locale}
        dateLabel={dateLabel}
        error={message && !activity ? message : ''}
        onOpen={
          nav
            ? () => nav.toTodayView(canTodayView('agenda2') ? 'agenda2' : 'agenda')
            : undefined
        }
        style={{
          '--kk-radius': 'var(--yl-radius-card)',
          '--kk-font': 'inherit',
        }}
      />
    </div>
  )
}
