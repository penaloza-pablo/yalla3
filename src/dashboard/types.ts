export const DASHBOARD_COLUMNS = 4 as const
export const DASHBOARD_GAP_PX = 12
export const DASHBOARD_INSET_PX = 12
/** 35% smaller than the previous fluid ~240px cell. */
export const DASHBOARD_CELL_PX = 156

export type DashboardColSpan = 1 | 2 | 3 | 4
export type DashboardRowSpan = 1 | 2 | 3 | 4

/** Scaffold kind. Swatches are color tiles; checkin, activity and planning are live widgets. */
export type DashboardWidgetKind = 'swatch' | 'checkin' | 'activity' | 'planning'

export type ActivityPresentation = {
  variant: 'arcs' | 'frequency'
  tone?: 'original' | 'rose' | 'slate' | 'blue'
}

export type PlanningPresentation = {
  variant: 'rings' | 'ledger'
  tone?: 'slate' | 'cream' | 'green'
}

export type DashboardWidgetScale = {
  colSpan: DashboardColSpan
  rowSpan: DashboardRowSpan
  swatch: string
  /** Handlebars-style HTML for this scale: {{income}}, {{nights}}, … */
  markup?: string
}

export type DashboardWidgetDefinition = {
  id: string
  kind: DashboardWidgetKind
  titleKey: string
  /** Custom label. When empty, the translated titleKey is used. */
  title?: string
  scales: DashboardWidgetScale[]
  activity?: ActivityPresentation
  planning?: PlanningPresentation
}

export type DashboardWidgetPlacement = {
  id: string
  widgetId: string
  colSpan: DashboardColSpan
  rowSpan: DashboardRowSpan
  colStart?: DashboardColSpan
  rowStart?: DashboardRowSpan
}

export type DashboardLayout = {
  id: string
  name?: string
  widgets: DashboardWidgetPlacement[]
}

export const scaleKey = (colSpan: number, rowSpan: number) =>
  `${colSpan}x${rowSpan}`

export const asColSpan = (value: number): DashboardColSpan => {
  if (value <= 1) {
    return 1
  }
  if (value === 2) {
    return 2
  }
  if (value === 3) {
    return 3
  }
  return 4
}

export const asRowSpan = (value: number): DashboardRowSpan => {
  if (value <= 1) {
    return 1
  }
  if (value === 2) {
    return 2
  }
  if (value === 3) {
    return 3
  }
  return 4
}
