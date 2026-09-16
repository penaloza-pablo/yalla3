import type {
  DashboardColSpan,
  DashboardRowSpan,
  DatePresentation,
} from '../types'
import { setDashboardDate, useDashboardDate } from '../dashboard-date-store'
import { DateWidget, DATE_IMAGE_SRC } from './DateWidget'
import '../dashboard.css'

type Props = {
  name?: string
  colSpan?: DashboardColSpan
  rowSpan?: DashboardRowSpan
  variant?: DatePresentation['variant']
  imageSrc?: string
}

export function DateDayWidget({
  colSpan = 2,
  rowSpan = 3,
  variant = 'photo',
  imageSrc = DATE_IMAGE_SRC.door,
}: Props) {
  const selectedDate = useDashboardDate()
  const compact = rowSpan === 1

  return (
    <div className="yl-dashboard-date">
      <DateWidget
        value={selectedDate}
        onDateChange={setDashboardDate}
        variant={variant}
        imageSrc={variant === 'photo' ? imageSrc : undefined}
        className={compact ? 'is-compact' : `is-${colSpan}x${rowSpan}`}
      />
    </div>
  )
}
