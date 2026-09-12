import type { DashboardLayout } from './types'

export const DASHBOARD_LAYOUT_1: DashboardLayout = {
  id: 'layout-1',
  widgets: [
    { id: 'l1-1', widgetId: 'swatch.go', colSpan: 2, rowSpan: 3 },
    { id: 'l1-2', widgetId: 'swatch.rose', colSpan: 1, rowSpan: 1 },
    { id: 'l1-3', widgetId: 'swatch.sky', colSpan: 1, rowSpan: 1 },
    { id: 'l1-4', widgetId: 'swatch.energy', colSpan: 2, rowSpan: 1 },
    { id: 'l1-5', widgetId: 'swatch.human', colSpan: 4, rowSpan: 1 },
    { id: 'l1-6', widgetId: 'swatch.warning', colSpan: 2, rowSpan: 2 },
    { id: 'l1-7', widgetId: 'swatch.success', colSpan: 1, rowSpan: 2 },
    { id: 'l1-8', widgetId: 'swatch.ink', colSpan: 1, rowSpan: 1 },
    { id: 'l1-9', widgetId: 'swatch.sky', colSpan: 1, rowSpan: 1 },
  ],
}

export const DASHBOARD_LAYOUT_2: DashboardLayout = {
  id: 'layout-2',
  widgets: [
    { id: 'l2-1', widgetId: 'swatch.rose', colSpan: 1, rowSpan: 1 },
    { id: 'l2-2', widgetId: 'swatch.sky', colSpan: 1, rowSpan: 1 },
    { id: 'l2-3', widgetId: 'swatch.ink', colSpan: 1, rowSpan: 1 },
    { id: 'l2-4', widgetId: 'swatch.success', colSpan: 1, rowSpan: 1 },
    { id: 'l2-5', widgetId: 'swatch.go', colSpan: 2, rowSpan: 3 },
    { id: 'l2-6', widgetId: 'swatch.energy', colSpan: 2, rowSpan: 1 },
    { id: 'l2-7', widgetId: 'swatch.human', colSpan: 4, rowSpan: 1 },
    { id: 'l2-8', widgetId: 'swatch.warning', colSpan: 2, rowSpan: 1 },
    { id: 'l2-9', widgetId: 'swatch.sky', colSpan: 1, rowSpan: 1 },
    { id: 'l2-10', widgetId: 'swatch.rose', colSpan: 1, rowSpan: 1 },
  ],
}

export const DASHBOARD_LAYOUT_3: DashboardLayout = {
  id: 'layout-3',
  widgets: [
    { id: 'l3-1', widgetId: 'swatch.energy', colSpan: 4, rowSpan: 2 },
    { id: 'l3-2', widgetId: 'swatch.go', colSpan: 2, rowSpan: 3 },
    { id: 'l3-3', widgetId: 'swatch.warning', colSpan: 2, rowSpan: 2 },
    { id: 'l3-4', widgetId: 'swatch.rose', colSpan: 2, rowSpan: 1 },
    { id: 'l3-5', widgetId: 'swatch.sky', colSpan: 2, rowSpan: 1 },
  ],
}

export const DASHBOARD_LAYOUT_4: DashboardLayout = {
  id: 'layout-4',
  widgets: [
    { id: 'l4-1', widgetId: 'swatch.go', colSpan: 2, rowSpan: 3 },
    { id: 'l4-2', widgetId: 'swatch.warning', colSpan: 2, rowSpan: 2 },
    { id: 'l4-3', widgetId: 'swatch.rose', colSpan: 1, rowSpan: 1 },
    { id: 'l4-4', widgetId: 'swatch.sky', colSpan: 1, rowSpan: 1 },
    { id: 'l4-5', widgetId: 'swatch.success', colSpan: 1, rowSpan: 1 },
    { id: 'l4-6', widgetId: 'swatch.ink', colSpan: 1, rowSpan: 1 },
    { id: 'l4-7', widgetId: 'swatch.human', colSpan: 4, rowSpan: 1 },
  ],
}

export const DASHBOARD_SEED_LAYOUTS: DashboardLayout[] = [
  DASHBOARD_LAYOUT_1,
  DASHBOARD_LAYOUT_2,
  DASHBOARD_LAYOUT_3,
  DASHBOARD_LAYOUT_4,
]
