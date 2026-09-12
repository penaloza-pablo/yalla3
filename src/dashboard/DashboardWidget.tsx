import { useTranslation } from 'react-i18next'
import { YlIcon } from '../design/icons'
import { colorNeedsInk } from './color'
import type { DashboardWidgetScale } from './types'
import './dashboard.css'

type Props = {
  name: string
  scale: DashboardWidgetScale
  onConfigure: () => void
}

export function DashboardWidget({ name, scale, onConfigure }: Props) {
  const { t } = useTranslation()
  const ink = colorNeedsInk(scale.swatch)
  const spanLabel = t('dashboard.spanLabel', {
    cols: scale.colSpan,
    rows: scale.rowSpan,
  })

  return (
    <article
      className={`yl-dashboard-widget${ink ? ' is-ink' : ''}`}
      style={{
        gridColumn: `span ${scale.colSpan}`,
        gridRow: `span ${scale.rowSpan}`,
        background: scale.swatch,
        color: ink ? 'var(--yl-ink)' : '#ffffff',
      }}
      aria-label={t('dashboard.swatchAria', {
        name,
        cols: scale.colSpan,
        rows: scale.rowSpan,
      })}
    >
      <button
        className="yl-dashboard-widget-config"
        type="button"
        aria-label={t('dashboard.configureWidget', { name })}
        onClick={onConfigure}
      >
        <YlIcon name="gearshape" size={14} />
      </button>
      <p className="yl-dashboard-widget-name">{name}</p>
      <p className="yl-dashboard-widget-span">{spanLabel}</p>
    </article>
  )
}
