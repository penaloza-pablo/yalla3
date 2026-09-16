import type { TFunction } from 'i18next'
import { dashboardLayoutNumber } from '../../amplify/functions/shared/dashboard-layout'

export const layoutLabel = (
  layout: { id: string; name?: string },
  t: TFunction,
) =>
  layout.name?.trim() ||
  t('dashboard.layoutName', { n: dashboardLayoutNumber(layout.id) })

export const widgetLabel = (
  widget: { title?: string; titleKey: string },
  t: TFunction,
) => widget.title?.trim() || t(widget.titleKey)
