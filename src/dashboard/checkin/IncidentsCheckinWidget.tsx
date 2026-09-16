import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { DashboardColSpan, DashboardRowSpan } from '../types'
import { useDashboardDate } from '../dashboard-date-store'
import { usePermissions } from '../../rbac/PermissionsProvider'
import { CheckinWidget, type CheckinAction } from './CheckinWidget'
import {
  loadUpcomingCheckins,
  saveCheckinAction,
  useCheckinLive,
} from './tracker-live-store'
import '../dashboard.css'

type Props = {
  name?: string
  colSpan?: DashboardColSpan
  rowSpan?: DashboardRowSpan
}

const resolveError = (
  error: string,
  t: (key: string) => string,
) => {
  if (!error) {
    return ''
  }
  if (error === 'missingEndpoint') {
    return t('checkInTracker.missingEndpoint')
  }
  if (error === 'missingWrite') {
    return t('checkInTracker.missingWrite')
  }
  if (error === 'loadError') {
    return t('checkInTracker.loadError')
  }
  if (error === 'saveError') {
    return t('checkInTracker.saveError')
  }
  return error
}

export function IncidentsCheckinWidget({
  name,
  colSpan = 2,
  rowSpan = 2,
}: Props) {
  const { t, i18n } = useTranslation()
  const { ready } = usePermissions()
  const selectedDate = useDashboardDate()
  const { guests, loading, busy, error, rows, from } = useCheckinLive()
  useEffect(() => {
    if (!ready) {
      return
    }
    void loadUpcomingCheckins(false, selectedDate)
  }, [ready, selectedDate])
  const awaiting = loading || from !== selectedDate

  const handleAction = useCallback(
    ({ id, action }: { id: string; action: CheckinAction }) => {
      void saveCheckinAction(id, action)
    },
    [],
  )

  const compact = colSpan === 1 && rowSpan === 1
  const message = resolveError(error, t)
  const title = name || t('dashboard.widgets.energy')
  const locale = i18n.resolvedLanguage || i18n.language || 'en'

  if (awaiting) {
    return (
      <div className={compact ? 'yl-dashboard-checkin-mini' : 'yl-dashboard-checkin is-loading'}>
        {compact ? (
          <p className="yl-dashboard-widget-name">{title}</p>
        ) : null}
        <p className="yl-dashboard-checkin-status">{t('checkInTracker.loading')}</p>
      </div>
    )
  }

  if (message && guests.length === 0) {
    return (
      <div className={compact ? 'yl-dashboard-checkin-mini' : 'yl-dashboard-checkin is-loading'}>
        {compact ? (
          <p className="yl-dashboard-widget-name">{title}</p>
        ) : null}
        <p className="yl-dashboard-checkin-status" role="alert">
          {message}
        </p>
      </div>
    )
  }

  if (compact) {
    const current = rows[0]
    return (
      <div className="yl-dashboard-checkin-mini">
        <p className="yl-dashboard-widget-name">{title}</p>
        {current ? (
          <>
            <p className="yl-dashboard-checkin-mini-name">{current.guestName}</p>
            <p className="yl-dashboard-checkin-status">
              {t(`checkInTracker.status.${current.status}`)}
            </p>
            <p className="yl-dashboard-checkin-count">
              {t('kit.widgetIncidentsCount', { count: rows.length })}
            </p>
          </>
        ) : (
          <p className="yl-dashboard-checkin-status">{t('checkInTracker.empty')}</p>
        )}
      </div>
    )
  }

  return (
    <div className="yl-dashboard-checkin">
      <CheckinWidget
        guests={guests}
        variant="journey"
        busy={busy}
        error={message}
        lang={locale}
        onAction={handleAction}
        style={{
          '--kk-radius': 'var(--yl-radius-card)',
          '--kk-font': 'inherit',
          '--kk-label-font': 'inherit',
        }}
      />
    </div>
  )
}
