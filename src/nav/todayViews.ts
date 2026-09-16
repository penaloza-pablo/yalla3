import {
  isTodayViewMode,
  TODAY_VIEW_MODES,
  type TodayViewMode,
} from '../../amplify/functions/shared/today-views'

export { TODAY_VIEW_MODES, type TodayViewMode }

export const TODAY_VIEW_QUERY_KEY = 'view'
export const TODAY_SECTION_ID = 'today-views'

export const DEFAULT_TODAY_VIEW: TodayViewMode = 'board'

export const normalizeTodayView = (view: TodayViewMode): TodayViewMode =>
  view === 'day' ? 'agenda2' : view

export const parseTodayView = (value: string | null | undefined): TodayViewMode => {
  const parsed = isTodayViewMode(value) ? value : DEFAULT_TODAY_VIEW
  return normalizeTodayView(parsed)
}

export const isTodayVisitView = (view: TodayViewMode) =>
  view === 'day' ||
  view === 'agenda2' ||
  view === 'kanban' ||
  view === 'agenda' ||
  view === 'myJobs'

export const isDayTimelineView = (view: TodayViewMode) =>
  view === 'day' || view === 'agenda2'

export const isAgenda2View = (view: TodayViewMode) => view === 'agenda2'

export const canAccessTodayView = (
  view: TodayViewMode,
  allowed: readonly TodayViewMode[],
) => {
  if (view === 'day') {
    return false
  }
  if (view === 'agenda2') {
    return allowed.includes('agenda2') || allowed.includes('day')
  }
  return allowed.includes(view)
}

export const roleShowsTodayView = (
  view: TodayViewMode,
  allowed: readonly TodayViewMode[],
) => {
  if (view === 'agenda2') {
    return allowed.includes('agenda2') || allowed.includes('day')
  }
  return allowed.includes(view)
}

export const toggleAllowedTodayView = (
  current: TodayViewMode[],
  view: TodayViewMode,
): TodayViewMode[] => {
  const hasView = roleShowsTodayView(view, current)
  const next = hasView
    ? current.filter((entry) =>
        view === 'agenda2' ? entry !== 'agenda2' && entry !== 'day' : entry !== view,
      )
    : [...current, view]
  if (next.length === 0) {
    return current
  }
  return TODAY_VIEW_MODES.filter((item) => next.includes(item))
}

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
  { view: 'agenda2', labelKey: 'operations.agenda2', icon: 'calendar' },
  { view: 'kanban', labelKey: 'operations.kanban', icon: 'list.bullet' },
  { view: 'agenda', labelKey: 'operations.agenda', icon: 'calendar' },
  { view: 'myJobs', labelKey: 'operations.myJobs', icon: 'briefcase' },
]

export const TODAY_ROLE_NAV_ITEMS = TODAY_NAV_ITEMS
