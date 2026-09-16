import {
  isTodayViewMode,
  TODAY_VIEW_MODES,
  type TodayViewMode,
} from '../../amplify/functions/shared/today-views'

export { TODAY_VIEW_MODES, type TodayViewMode }

export const TODAY_VIEW_QUERY_KEY = 'view'
export const TODAY_SECTION_ID = 'today-views'

export const DEFAULT_TODAY_VIEW: TodayViewMode = 'board'

export const parseTodayView = (value: string | null | undefined): TodayViewMode =>
  isTodayViewMode(value) ? value : DEFAULT_TODAY_VIEW

export const isTodayVisitView = (view: TodayViewMode) =>
  view === 'day' || view === 'kanban' || view === 'agenda' || view === 'myJobs'

export const TODAY_NAV_ITEMS: Array<{
  view: TodayViewMode
  labelKey: string
  icon:
    | 'house'
    | 'square.grid.2x2'
    | 'calendar'
    | 'rectangle.3.group'
    | 'list.bullet'
    | 'list.bullet.rectangle'
    | 'briefcase'
}> = [
  { view: 'dashboard', labelKey: 'pages.Today', icon: 'house' },
  { view: 'board', labelKey: 'today.dashboard', icon: 'square.grid.2x2' },
  { view: 'day', labelKey: 'operations.day', icon: 'list.bullet.rectangle' },
  { view: 'kanban', labelKey: 'operations.kanban', icon: 'list.bullet' },
  { view: 'agenda', labelKey: 'operations.agenda', icon: 'calendar' },
  { view: 'myJobs', labelKey: 'operations.myJobs', icon: 'briefcase' },
]
