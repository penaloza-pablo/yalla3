import { useTranslation } from 'react-i18next'
import { YlIcon } from '../design/icons'
import { IncidentsCheckinWidget } from './checkin/IncidentsCheckinWidget'
import { colorNeedsInk } from './color'
import type { DashboardWidgetKind, DashboardWidgetScale } from './types'
import './dashboard.css'

type Props = {
  name: string
  kind: DashboardWidgetKind
  scale: DashboardWidgetScale
  onConfigure?: () => void
}

export function DashboardWidget({ name, kind, scale, onConfigure }: Props) {
  const { t } = useTranslation()
  const isCheckin = kind === 'checkin'
  const ink = !isCheckin && colorNeedsInk(scale.swatch)
  const spanLabel = t('dashboard.spanLabel', {
    cols: scale.colSpan,
    rows: scale.rowSpan,
  })

  return (
    <article
      className={`yl-dashboard-widget${isCheckin ? ' is-checkin' : ''}${
        ink ? ' is-ink' : ''
      }`}
      style={{
        gridColumn: `span ${scale.colSpan}`,
        gridRow: `span ${scale.rowSpan}`,
        ...(isCheckin
          ? {}
          : {
              background: scale.swatch,
              color: ink ? 'var(--yl-ink)' : '#ffffff',
            }),
      }}
      aria-label={t('dashboard.swatchAria', {
        name,
        cols: scale.colSpan,
        rows: scale.rowSpan,
      })}
    >
      {onConfigure ? (
        <button
          className="yl-dashboard-widget-config"
          type="button"
          aria-label={t('dashboard.configureWidget', { name })}
          onClick={onConfigure}
        >
          <YlIcon name="gearshape" size={14} />
        </button>
      ) : null}
      {isCheckin ? (
        <IncidentsCheckinWidget colSpan={scale.colSpan} rowSpan={scale.rowSpan} />
      ) : (
        <>
          <p className="yl-dashboard-widget-name">{name}</p>
          <p className="yl-dashboard-widget-span">{spanLabel}</p>
        </>
      )}
    </article>
  )
}

