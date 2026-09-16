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
  colSpan = 2,
  rowSpan = 2,
  variant = 'focus',
}: Props) {
  const { t, i18n } = useTranslation()
  const { data, loading, error } = useSuppliesLive()
  useEffect(() => {
    void loadSuppliesSnapshot()
  }, [])

  const message = resolveError(error, t)
  const locale = i18n.resolvedLanguage || i18n.language || 'en'
  const cell = colSpan === 1 && rowSpan === 1

  return (
    <div className={`yl-dashboard-supplies${cell ? ' is-cell' : ''}`}>
      <SuppliesWidget
        data={loading && !data ? null : data}
        variant={variant}
        locale={locale}
        error={message && !data ? message : ''}
      />
    </div>
  )
}
