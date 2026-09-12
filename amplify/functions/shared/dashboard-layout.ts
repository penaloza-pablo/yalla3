export const DEFAULT_DASHBOARD_LAYOUT_ID = 'layout-1'

const LAYOUT_ID_PATTERN = /^layout-[1-9]\d*$/

export const isDashboardLayoutId = (value: unknown): value is string =>
  typeof value === 'string' && LAYOUT_ID_PATTERN.test(value)

export const dashboardLayoutNumber = (id: string) => {
  const match = LAYOUT_ID_PATTERN.exec(id)
  return match ? Number(id.slice('layout-'.length)) : 1
}

export const dashboardLayoutIdForNumber = (value: number) =>
  `layout-${Math.max(1, Math.floor(value))}`

export const isProtectedDashboardLayoutId = (id: string) =>
  dashboardLayoutNumber(id) <= 4
