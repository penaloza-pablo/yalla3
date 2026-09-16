import { useTranslation } from 'react-i18next'
import { YlIcon } from '../design/icons'
import { ActivityDayWidget } from './activity/ActivityDayWidget'
import { IncidentsCheckinWidget } from './checkin/IncidentsCheckinWidget'
import { DateDayWidget } from './date/DateDayWidget'
import { PlanningDayWidget } from './planning/PlanningDayWidget'
import { ReviewsDayWidget } from './reviews/ReviewsDayWidget'
import { SuppliesDayWidget } from './supplies/SuppliesDayWidget'
import { colorNeedsInk } from './color'
import type {
  ActivityPresentation,
  DashboardColSpan,
  DashboardRowSpan,
  DashboardWidgetKind,
  DashboardWidgetScale,
  DatePresentation,
  PlanningPresentation,
  ReviewsPresentation,
  SuppliesPresentation,
} from './types'
import './dashboard.css'

type Props = {
  name: string
  kind: DashboardWidgetKind
  scale: DashboardWidgetScale
  colStart?: DashboardColSpan
  rowStart?: DashboardRowSpan
  activity?: ActivityPresentation
  planning?: PlanningPresentation
  reviews?: ReviewsPresentation
  supplies?: SuppliesPresentation
  date?: DatePresentation
  onConfigure?: () => void
}

export function DashboardWidget({
  name,
  kind,
  scale,
  colStart,
  rowStart,
  activity,
  planning,
  reviews,
  supplies,
  date,
  onConfigure,
}: Props) {
  const { t } = useTranslation()
  const isCheckin = kind === 'checkin'
  const isActivity = kind === 'activity'
  const isPlanning = kind === 'planning'
  const isReviews = kind === 'reviews'
  const isSupplies = kind === 'supplies'
  const isDate = kind === 'date'
  const isLive =
    isCheckin || isActivity || isPlanning || isReviews || isSupplies || isDate
  const ink = !isLive && colorNeedsInk(scale.swatch)
  const spanLabel = t('dashboard.spanLabel', {
    cols: scale.colSpan,
    rows: scale.rowSpan,
  })

  return (
    <article
      className={`yl-dashboard-widget${isCheckin ? ' is-checkin' : ''}${
        isActivity ? ' is-activity' : ''
      }${isPlanning ? ' is-planning' : ''}${isReviews ? ' is-reviews' : ''}${
        isSupplies ? ' is-supplies' : ''
      }${isDate ? ' is-date' : ''}${ink ? ' is-ink' : ''}`}
      style={{
        gridColumn: colStart
          ? `${colStart} / span ${scale.colSpan}`
          : `span ${scale.colSpan}`,
        gridRow: rowStart
          ? `${rowStart} / span ${scale.rowSpan}`
          : `span ${scale.rowSpan}`,
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
          onClick={(event) => {
            event.stopPropagation()
            onConfigure()
          }}
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
      ) : isDate ? (
        <DateDayWidget
          name={name}
          colSpan={scale.colSpan}
          rowSpan={scale.rowSpan}
          variant={date?.variant ?? 'photo'}
          imageSrc={date?.imageSrc}
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
      ) : isReviews ? (
        <ReviewsDayWidget
          name={name}
          colSpan={scale.colSpan}
          rowSpan={scale.rowSpan}
          variant={reviews?.variant ?? 'editorial'}
        />
      ) : isSupplies ? (
        <SuppliesDayWidget
          name={name}
          colSpan={scale.colSpan}
          rowSpan={scale.rowSpan}
          variant={supplies?.variant ?? 'focus'}
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
