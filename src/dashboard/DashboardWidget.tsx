import { useTranslation } from 'react-i18next'
import { YlIcon } from '../design/icons'
import { ActivityDayWidget } from './activity/ActivityDayWidget'
import { IncidentsCheckinWidget } from './checkin/IncidentsCheckinWidget'
import { PlanningDayWidget } from './planning/PlanningDayWidget'
import { colorNeedsInk } from './color'
import type {
  ActivityPresentation,
  DashboardWidgetKind,
  DashboardWidgetScale,
  PlanningPresentation,
} from './types'
import './dashboard.css'

type Props = {
  name: string
  kind: DashboardWidgetKind
  scale: DashboardWidgetScale
  activity?: ActivityPresentation
  planning?: PlanningPresentation
  onConfigure?: () => void
}

export function DashboardWidget({
  name,
  kind,
  scale,
  activity,
  planning,
  onConfigure,
}: Props) {
  const { t } = useTranslation()
  const isCheckin = kind === 'checkin'
  const isActivity = kind === 'activity'
  const isPlanning = kind === 'planning'
  const isLive = isCheckin || isActivity || isPlanning
  const ink = !isLive && colorNeedsInk(scale.swatch)
  const spanLabel = t('dashboard.spanLabel', {
    cols: scale.colSpan,
    rows: scale.rowSpan,
  })

  return (
    <article
      className={`yl-dashboard-widget${isCheckin ? ' is-checkin' : ''}${
        isActivity ? ' is-activity' : ''
      }${isPlanning ? ' is-planning' : ''}${ink ? ' is-ink' : ''}`}
      style={{
        gridColumn: `span ${scale.colSpan}`,
        gridRow: `span ${scale.rowSpan}`,
        ...(isLive
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
        <IncidentsCheckinWidget
          name={name}
          colSpan={scale.colSpan}
          rowSpan={scale.rowSpan}
        />
      ) : isActivity ? (
        <ActivityDayWidget
          name={name}
          colSpan={scale.colSpan}
          rowSpan={scale.rowSpan}
          variant={activity?.variant ?? 'frequency'}
          tone={activity?.tone ?? 'original'}
        />
      ) : isPlanning ? (
        <PlanningDayWidget
          name={name}
          colSpan={scale.colSpan}
          rowSpan={scale.rowSpan}
          variant={planning?.variant ?? 'rings'}
          tone={planning?.tone ?? 'slate'}
        />
      ) : (
        <>
          <p className="yl-dashboard-widget-name">{name}</p>
          <p className="yl-dashboard-widget-span">{spanLabel}</p>
        </>
      )}
    </article>
  )
}
