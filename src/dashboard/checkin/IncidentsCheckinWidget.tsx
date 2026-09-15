import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { DashboardColSpan, DashboardRowSpan } from '../types'
import { CheckinWidget, type CheckinAction } from './CheckinWidget'
import {
  loadUpcomingCheckins,
  saveCheckinAction,
  useCheckinLive,
} from './tracker-live-store'
import '../dashboard.css'

type Props = {
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

export function IncidentsCheckinWidget({ colSpan = 2, rowSpan = 2 }: Props) {
  const { t } = useTranslation()
  const { guests, loading, busy, error, rows } = useCheckinLive()
  useEffect(() => {
    void loadUpcomingCheckins()
  }, [])

  const handleAction = useCallback(
    ({ id, action }: { id: string; action: CheckinAction }) => {
      void saveCheckinAction(id, action)
    },
    [],
  )

  const compact = colSpan === 1 && rowSpan === 1
  const message = resolveError(error, t)

  if (loading && guests.length === 0) {
    return (
      <div className={compact ? 'yl-dashboard-checkin-mini' : 'yl-dashboard-checkin is-loading'}>
        {compact ? (
          <p className="yl-dashboard-widget-name">{t('dashboard.widgets.energy')}</p>
        ) : null}
        <p className="yl-dashboard-checkin-status">{t('checkInTracker.loading')}</p>
      </div>
    )
  }

  if (message && guests.length === 0) {
    return (
      <div className={compact ? 'yl-dashboard-checkin-mini' : 'yl-dashboard-checkin is-loading'}>
        {compact ? (
          <p className="yl-dashboard-widget-name">{t('dashboard.widgets.energy')}</p>
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
        <p className="yl-dashboard-widget-name">{t('dashboard.widgets.energy')}</p>
        {loading && rows.length === 0 ? (
          <p className="yl-dashboard-checkin-status">{t('checkInTracker.loading')}</p>
        ) : current ? (
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
