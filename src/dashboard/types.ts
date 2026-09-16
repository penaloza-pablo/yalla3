export const DASHBOARD_COLUMNS = 4 as const
export const DASHBOARD_GAP_PX = 12
export const DASHBOARD_INSET_PX = 12
/** Native 1×1 canvas size used by Radar / Cuadrante / Puerta abierta. */
export const DASHBOARD_CELL_PX = 156
/** Visual widget size. 20% larger than the native cell. */
export const DASHBOARD_WIDGET_SCALE = 1.2
export const DASHBOARD_TRACK_PX = DASHBOARD_CELL_PX * DASHBOARD_WIDGET_SCALE
export const DASHBOARD_TRACK_GAP_PX = DASHBOARD_GAP_PX * DASHBOARD_WIDGET_SCALE
export const DASHBOARD_SIDEBAR_PX = 260

export type DashboardColSpan = 1 | 2 | 3 | 4
export type DashboardRowSpan = 1 | 2 | 3 | 4

/** Scaffold kind. Swatches are color tiles; the rest are live widgets. */
export type DashboardWidgetKind =
  | 'swatch'
  | 'date'
  | 'checkin'
  | 'activity'
  | 'planning'
  | 'reviews'
  | 'supplies'

export type ActivityPresentation = {
  variant: 'arcs' | 'frequency'
  tone?: 'original' | 'rose' | 'slate' | 'blue'
}

export type PlanningPresentation = {
  variant: 'rings' | 'ledger'
  tone?: 'slate' | 'cream' | 'green'
}

export type ReviewsPresentation = {
  variant: 'editorial' | 'postcard'
}

export type SuppliesPresentation = {
  variant: 'focus' | 'grid'
}

export type DatePresentation = {
  variant: 'photo' | 'editorial'
  imageSrc?: string
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
  reviews?: ReviewsPresentation
  supplies?: SuppliesPresentation
  date?: DatePresentation
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
