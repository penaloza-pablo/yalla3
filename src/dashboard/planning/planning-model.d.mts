import type { PlanningData } from './PlanningWidget'
export interface PlanningRow {
  key: 'maintenance' | 'cleaning' | 'bookings'
  label: string
  total: number
  completed: number
  ratio: number
  percent: string
  ready: boolean
}
export function planningLocale(lang?: string): 'en' | 'es'
export function planningCopy(lang?: string): {
  labels: Record<PlanningRow['key'], string>
  title: string
  ariaLabel: string
  loading: string
  invalid: string
  allSet: string
  pending: string
  noData: string
  closedTodayTomorrow: string
  withoutAlarms: string
  recordsWithoutAlarms: string
  plansTodayTomorrow: string
  todayTomorrow: string
  locale: string
}
export function formatPlanningPercent(ratio: number, lang?: string): string
export function planningRows(data: PlanningData, lang?: string): PlanningRow[]
export function planningStatus(rows: PlanningRow[], lang?: string): string
export function ringPath(radius: number): string
export function radarGeometry(index: number): { radius: number; x: number; y: number; path: string }
export const PLANNER_ICONS: Record<PlanningRow['key'], string>
