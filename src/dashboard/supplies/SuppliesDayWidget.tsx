import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  DashboardColSpan,
  DashboardRowSpan,
  SuppliesPresentation,
} from '../types'
import { loadSuppliesSnapshot, useSuppliesLive } from './supplies-live-store'
import { SuppliesWidget } from './SuppliesWidget'
import '../dashboard.css'

type Props = {
  name?: string
  colSpan?: DashboardColSpan
  rowSpan?: DashboardRowSpan
  variant?: SuppliesPresentation['variant']
}

const resolveError = (error: string, t: (key: string) => string) => {
  if (!error) {
    return ''
  }
  if (error === 'missingInventoryEndpoint') {
    return t('inventory.missingEndpoint')
  }
  if (error === 'missingPurchasesEndpoint') {
    return t('purchases.missingEndpoint')
  }
  if (error === 'loadError') {
    return t('today.loadError')
  }
  return error
}

export function SuppliesDayWidget({
  name,
  colSpan = 2,
  rowSpan = 2,
  variant = 'focus',
}: Props) {
  const { t, i18n } = useTranslation()
  const { data, loading, error } = useSuppliesLive()
  useEffect(() => {
    void loadSuppliesSnapshot()
  }, [])

  const compact = colSpan === 1 && rowSpan === 1
  const message = resolveError(error, t)
  const locale = i18n.resolvedLanguage || i18n.language || 'en'
  const title = name || t('dashboard.widgets.suppliesFocus')

  if (compact) {
    return (
      <div className="yl-dashboard-checkin-mini">
        <p className="yl-dashboard-widget-name">{title}</p>
        {loading && !data ? (
          <p className="yl-dashboard-checkin-status">{t('inventory.loading')}</p>
        ) : message && !data ? (
          <p className="yl-dashboard-checkin-status" role="alert">
            {message}
          </p>
        ) : (
          <>
            <p className="yl-dashboard-checkin-mini-name">
              {data?.stockAlerts ?? 0}
            </p>
            <p className="yl-dashboard-checkin-status">
              {data?.waitingDelivery ?? 0} · {data?.overdue ?? 0} ·{' '}
              {data?.waitingInvoice ?? 0}
            </p>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="yl-dashboard-supplies">
      <SuppliesWidget
        data={loading && !data ? null : data}
        variant={variant}
        locale={locale}
        error={message && !data ? message : ''}
      />
    </div>
  )
}
