import type { DashboardWidgetDefinition, DashboardWidgetScale } from './types'

const ACTIVITY_SWATCH = 'var(--yl-kk-human)'
const ORBIT_SCALES: DashboardWidgetScale[] = [
  { colSpan: 4, rowSpan: 2, swatch: ACTIVITY_SWATCH },
  { colSpan: 2, rowSpan: 2, swatch: ACTIVITY_SWATCH },
  { colSpan: 1, rowSpan: 1, swatch: '#f4e4e1' },
]
const PLANNING_SCALES = (swatch: string): DashboardWidgetScale[] => [
  { colSpan: 2, rowSpan: 2, swatch },
  { colSpan: 1, rowSpan: 1, swatch },
]

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
    kind: 'checkin',
    titleKey: 'dashboard.widgets.energy',
    scales: [
      { colSpan: 4, rowSpan: 2, swatch: 'var(--yl-energy)' },
      { colSpan: 2, rowSpan: 2, swatch: 'var(--yl-energy)' },
      { colSpan: 2, rowSpan: 1, swatch: 'var(--yl-energy)' },
      { colSpan: 1, rowSpan: 1, swatch: '#de8a7f' },
    ],
  },
  {
    id: 'activity.orbit.original',
    kind: 'activity',
    titleKey: 'dashboard.widgets.orbitOriginal',
    activity: { variant: 'arcs', tone: 'original' },
    scales: ORBIT_SCALES,
  },
  {
    id: 'activity.orbit.rose',
    kind: 'activity',
    titleKey: 'dashboard.widgets.orbitRose',
    activity: { variant: 'arcs', tone: 'rose' },
    scales: ORBIT_SCALES,
  },
  {
    id: 'activity.orbit.slate',
    kind: 'activity',
    titleKey: 'dashboard.widgets.orbitSlate',
    activity: { variant: 'arcs', tone: 'slate' },
    scales: ORBIT_SCALES,
  },
  {
    id: 'activity.orbit.blue',
    kind: 'activity',
    titleKey: 'dashboard.widgets.orbitBlue',
    activity: { variant: 'arcs', tone: 'blue' },
    scales: ORBIT_SCALES,
  },
  {
    id: 'swatch.human',
    kind: 'activity',
    titleKey: 'dashboard.widgets.human',
    activity: { variant: 'frequency' },
    scales: [
      { colSpan: 4, rowSpan: 2, swatch: ACTIVITY_SWATCH },
      { colSpan: 4, rowSpan: 1, swatch: ACTIVITY_SWATCH },
      { colSpan: 2, rowSpan: 2, swatch: ACTIVITY_SWATCH },
      { colSpan: 2, rowSpan: 1, swatch: '#edd0cb' },
      { colSpan: 1, rowSpan: 1, swatch: '#f4e4e1' },
    ],
  },
  {
    id: 'planning.radar.slate',
    kind: 'planning',
    titleKey: 'dashboard.widgets.planningRadarSlate',
    planning: { variant: 'rings', tone: 'slate' },
    scales: PLANNING_SCALES('#415364'),
  },
  {
    id: 'planning.radar.cream',
    kind: 'planning',
    titleKey: 'dashboard.widgets.planningRadarCream',
    planning: { variant: 'rings', tone: 'cream' },
    scales: PLANNING_SCALES('#F6F1E8'),
  },
  {
    id: 'planning.radar.green',
    kind: 'planning',
    titleKey: 'dashboard.widgets.planningRadarGreen',
    planning: { variant: 'rings', tone: 'green' },
    scales: PLANNING_SCALES('#3D5B58'),
  },
  {
    id: 'planning.ledger',
    kind: 'planning',
    titleKey: 'dashboard.widgets.planningLedger',
    planning: { variant: 'ledger' },
    scales: PLANNING_SCALES('#F6F1E8'),
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
