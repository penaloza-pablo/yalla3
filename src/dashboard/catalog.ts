import { DATE_IMAGE_SRC } from './date/DateWidget'
import type { DashboardWidgetDefinition, DashboardWidgetScale } from './types'

const ACTIVITY_SWATCH = 'var(--yl-kk-human)'
const DATE_GREEN = '#3D5B58'
const DATE_PINK = '#E3B9B3'
const DATE_SCALES = (swatch: string): DashboardWidgetScale[] => [
  { colSpan: 2, rowSpan: 3, swatch },
  { colSpan: 1, rowSpan: 3, swatch },
  { colSpan: 2, rowSpan: 2, swatch },
  { colSpan: 1, rowSpan: 1, swatch },
]
const ORBIT_SCALES: DashboardWidgetScale[] = [
  { colSpan: 4, rowSpan: 2, swatch: ACTIVITY_SWATCH },
  { colSpan: 2, rowSpan: 2, swatch: ACTIVITY_SWATCH },
  { colSpan: 3, rowSpan: 1, swatch: ACTIVITY_SWATCH },
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
    id: 'date.photo',
    kind: 'date',
    titleKey: 'dashboard.widgets.datePhoto',
    date: { variant: 'photo', imageSrc: DATE_IMAGE_SRC.door },
    scales: DATE_SCALES(DATE_GREEN),
  },
  {
    id: 'date.editorial',
    kind: 'date',
    titleKey: 'dashboard.widgets.dateEditorial',
    date: { variant: 'editorial' },
    scales: DATE_SCALES(DATE_PINK),
  },
  {
    id: 'date.balconies',
    kind: 'date',
    titleKey: 'dashboard.widgets.dateBalconies',
    date: { variant: 'photo', imageSrc: DATE_IMAGE_SRC.balconies },
    scales: DATE_SCALES(DATE_GREEN),
  },
  {
    id: 'date.welcome',
    kind: 'date',
    titleKey: 'dashboard.widgets.dateWelcome',
    date: { variant: 'photo', imageSrc: DATE_IMAGE_SRC.welcome },
    scales: DATE_SCALES(DATE_GREEN),
  },
  {
    id: 'date.staircase',
    kind: 'date',
    titleKey: 'dashboard.widgets.dateStaircase',
    date: { variant: 'photo', imageSrc: DATE_IMAGE_SRC.staircase },
    scales: DATE_SCALES(DATE_GREEN),
  },
  {
    id: 'swatch.energy',
    kind: 'checkin',
    titleKey: 'dashboard.widgets.energy',
    scales: [
      { colSpan: 4, rowSpan: 2, swatch: 'var(--yl-energy)' },
      { colSpan: 2, rowSpan: 2, swatch: 'var(--yl-energy)' },
      { colSpan: 3, rowSpan: 1, swatch: 'var(--yl-energy)' },
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
    id: 'reviews.editorial',
    kind: 'reviews',
    titleKey: 'dashboard.widgets.reviewsEditorial',
    reviews: { variant: 'editorial' },
    scales: PLANNING_SCALES('#3D5B58'),
  },
  {
    id: 'reviews.postcard',
    kind: 'reviews',
    titleKey: 'dashboard.widgets.reviewsPostcard',
    reviews: { variant: 'postcard' },
    scales: PLANNING_SCALES('#F6F1E8'),
  },
  {
    id: 'supplies.focus',
    kind: 'supplies',
    titleKey: 'dashboard.widgets.suppliesFocus',
    supplies: { variant: 'focus' },
    scales: PLANNING_SCALES('#3D5B58'),
  },
  {
    id: 'supplies.grid',
    kind: 'supplies',
    titleKey: 'dashboard.widgets.suppliesGrid',
    supplies: { variant: 'grid' },
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
