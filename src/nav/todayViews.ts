export const TODAY_VIEW_MODES = ['dashboard', 'day', 'kanban', 'agenda'] as const

export type TodayViewMode = (typeof TODAY_VIEW_MODES)[number]

export const TODAY_VIEW_QUERY_KEY = 'view'
export const TODAY_SECTION_ID = 'today-views'

export const parseTodayView = (value: string | null | undefined): TodayViewMode =>
  value === 'day' || value === 'kanban' || value === 'agenda' ? value : 'dashboard'

export const TODAY_NAV_ITEMS: Array<{
  view: TodayViewMode
  labelKey: string
  icon: 'house' | 'calendar' | 'rectangle.3.group' | 'list.bullet.rectangle'
}> = [
  { view: 'dashboard', labelKey: 'pages.Today', icon: 'house' },
  { view: 'day', labelKey: 'operations.day', icon: 'calendar' },
  { view: 'kanban', labelKey: 'operations.kanban', icon: 'rectangle.3.group' },
  { view: 'agenda', labelKey: 'operations.agenda', icon: 'list.bullet.rectangle' },
]
