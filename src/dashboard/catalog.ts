import type { DashboardWidgetDefinition } from './types'

export const DASHBOARD_WIDGETS: DashboardWidgetDefinition[] = [
  {
    id: 'swatch.rose',
    kind: 'swatch',
    titleKey: 'dashboard.widgets.rose',
    scales: [{ colSpan: 1, rowSpan: 1, swatch: 'rgb(229, 32, 82)' }],
  },
  {
    id: 'swatch.sky',
    kind: 'swatch',
    titleKey: 'dashboard.widgets.sky',
    scales: [{ colSpan: 1, rowSpan: 1, swatch: 'rgb(23, 158, 198)' }],
  },
  {
    id: 'swatch.go',
    kind: 'swatch',
    titleKey: 'dashboard.widgets.go',
    scales: [
      { colSpan: 2, rowSpan: 3, swatch: '#2f9e44' },
      { colSpan: 2, rowSpan: 2, swatch: '#e4c01f' },
      { colSpan: 2, rowSpan: 1, swatch: '#b497d6' },
    ],
  },
  {
    id: 'swatch.energy',
    kind: 'swatch',
    titleKey: 'dashboard.widgets.energy',
    scales: [
      { colSpan: 2, rowSpan: 1, swatch: 'var(--yl-energy)' },
      { colSpan: 1, rowSpan: 1, swatch: '#de8a7f' },
    ],
  },
  {
    id: 'swatch.human',
    kind: 'swatch',
    titleKey: 'dashboard.widgets.human',
    scales: [
      { colSpan: 4, rowSpan: 1, swatch: 'var(--yl-kk-human)' },
      { colSpan: 2, rowSpan: 1, swatch: '#edd0cb' },
      { colSpan: 1, rowSpan: 1, swatch: '#f4e4e1' },
    ],
  },
  {
    id: 'swatch.warning',
    kind: 'swatch',
    titleKey: 'dashboard.widgets.warning',
    scales: [
      { colSpan: 2, rowSpan: 2, swatch: 'var(--yl-warning)' },
      { colSpan: 2, rowSpan: 1, swatch: '#d97706' },
      { colSpan: 1, rowSpan: 1, swatch: '#f0b429' },
    ],
  },
  {
    id: 'swatch.success',
    kind: 'swatch',
    titleKey: 'dashboard.widgets.success',
    scales: [
      { colSpan: 1, rowSpan: 2, swatch: 'var(--yl-success)' },
      { colSpan: 1, rowSpan: 1, swatch: '#3b9b6e' },
    ],
  },
  {
    id: 'swatch.ink',
    kind: 'swatch',
    titleKey: 'dashboard.widgets.ink',
    scales: [{ colSpan: 1, rowSpan: 1, swatch: 'var(--yl-ink)' }],
  },
]

export const dashboardWidgetById = new Map(
  DASHBOARD_WIDGETS.map((widget) => [widget.id, widget]),
)
