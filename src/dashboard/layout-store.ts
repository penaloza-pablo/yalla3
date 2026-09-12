import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_DASHBOARD_LAYOUT_ID,
  dashboardLayoutIdForNumber,
  dashboardLayoutNumber,
  isDashboardLayoutId,
  isProtectedDashboardLayoutId,
} from '../../amplify/functions/shared/dashboard-layout'
import { DASHBOARD_SEED_LAYOUTS } from './layouts'
import type {
  DashboardColSpan,
  DashboardLayout,
  DashboardRowSpan,
  DashboardWidgetPlacement,
} from './types'

const STORAGE_KEY = 'yalla.dashboard.layouts.v1'

type StoredFile = {
  layouts?: unknown
  roleAssignments?: unknown
}

const listeners = new Set<() => void>()

const cloneLayout = (layout: DashboardLayout): DashboardLayout => ({
  id: layout.id,
  widgets: layout.widgets.map((widget) => ({ ...widget })),
})

const asColSpan = (value: unknown): DashboardColSpan | null => {
  if (value === 1 || value === 2 || value === 3 || value === 4) {
    return value
  }
  return null
}

const asRowSpan = (value: unknown): DashboardRowSpan | null => {
  if (value === 1 || value === 2 || value === 3 || value === 4) {
    return value
  }
  return null
}

const parsePlacement = (
  value: unknown,
  index: number,
): DashboardWidgetPlacement | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  const item = value as Record<string, unknown>
  const widgetId = typeof item.widgetId === 'string' ? item.widgetId : ''
  const colSpan = asColSpan(item.colSpan)
  const rowSpan = asRowSpan(item.rowSpan)
  if (!widgetId || !colSpan || !rowSpan) {
    return null
  }
  const colStart = asColSpan(item.colStart) ?? undefined
  const rowStart = asRowSpan(item.rowStart) ?? undefined
  return {
    id: typeof item.id === 'string' && item.id ? item.id : `widget-${index + 1}`,
    widgetId,
    colSpan,
    rowSpan,
    colStart,
    rowStart,
  }
}

const parseLayout = (value: unknown): DashboardLayout | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  const item = value as Record<string, unknown>
  if (!isDashboardLayoutId(item.id) || !Array.isArray(item.widgets)) {
    return null
  }
  return {
    id: item.id,
    widgets: item.widgets
      .map((widget, index) => parsePlacement(widget, index))
      .filter((widget): widget is DashboardWidgetPlacement => Boolean(widget)),
  }
}

const parseAssignments = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === 'string' && isDashboardLayoutId(entry[1]),
    ),
  )
}

const notify = () => {
  listeners.forEach((listener) => listener())
}

const readFile = (): { layouts: DashboardLayout[]; roleAssignments: Record<string, string> } => {
  if (typeof window === 'undefined') {
    return { layouts: [], roleAssignments: {} }
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { layouts: [], roleAssignments: {} }
    }
    const parsed = JSON.parse(raw) as StoredFile
    const layouts = Array.isArray(parsed.layouts)
      ? parsed.layouts
          .map((item) => parseLayout(item))
          .filter((item): item is DashboardLayout => Boolean(item))
      : []
    return {
      layouts,
      roleAssignments: parseAssignments(parsed.roleAssignments),
    }
  } catch {
    return { layouts: [], roleAssignments: {} }
  }
}

const writeFile = (next: {
  layouts: DashboardLayout[]
  roleAssignments: Record<string, string>
}) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  notify()
}

export const subscribeDashboardLayouts = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const listDashboardLayouts = (): DashboardLayout[] => {
  const stored = readFile()
  const byId = new Map(
    DASHBOARD_SEED_LAYOUTS.map((layout) => [layout.id, cloneLayout(layout)]),
  )
  for (const layout of stored.layouts) {
    byId.set(layout.id, cloneLayout(layout))
  }
  return [...byId.values()].sort(
    (left, right) => dashboardLayoutNumber(left.id) - dashboardLayoutNumber(right.id),
  )
}

export const resolveDashboardLayout = (
  layoutId?: string | null,
): DashboardLayout => {
  const layouts = listDashboardLayouts()
  const match = isDashboardLayoutId(layoutId)
    ? layouts.find((layout) => layout.id === layoutId)
    : undefined
  return cloneLayout(match ?? layouts[0] ?? DASHBOARD_SEED_LAYOUTS[0])
}

export const saveDashboardLayout = (layout: DashboardLayout) => {
  if (!isDashboardLayoutId(layout.id)) {
    return listDashboardLayouts()
  }
  const file = readFile()
  const nextLayouts = file.layouts.some((item) => item.id === layout.id)
    ? file.layouts.map((item) => (item.id === layout.id ? cloneLayout(layout) : item))
    : [...file.layouts, cloneLayout(layout)]
  writeFile({ ...file, layouts: nextLayouts })
  return listDashboardLayouts()
}

export const createDashboardLayout = () => {
  const layouts = listDashboardLayouts()
  const nextNumber =
    Math.max(4, ...layouts.map((layout) => dashboardLayoutNumber(layout.id))) + 1
  const layout: DashboardLayout = {
    id: dashboardLayoutIdForNumber(nextNumber),
    widgets: [],
  }
  saveDashboardLayout(layout)
  return layout
}

export const deleteDashboardLayout = (layoutId: string) => {
  if (!isDashboardLayoutId(layoutId) || isProtectedDashboardLayoutId(layoutId)) {
    return listDashboardLayouts()
  }
  const file = readFile()
  const roleAssignments = Object.fromEntries(
    Object.entries(file.roleAssignments).map(([roleId, assigned]) => [
      roleId,
      assigned === layoutId ? DEFAULT_DASHBOARD_LAYOUT_ID : assigned,
    ]),
  )
  writeFile({
    layouts: file.layouts.filter((layout) => layout.id !== layoutId),
    roleAssignments,
  })
  return listDashboardLayouts()
}

export const readRoleLayoutAssignment = (roleId: string) => {
  const assigned = readFile().roleAssignments[roleId]
  return isDashboardLayoutId(assigned) ? assigned : undefined
}

export const writeRoleLayoutAssignment = (roleId: string, layoutId: string) => {
  if (!roleId || !isDashboardLayoutId(layoutId)) {
    return
  }
  const file = readFile()
  writeFile({
    ...file,
    roleAssignments: { ...file.roleAssignments, [roleId]: layoutId },
  })
}

export const resolveRoleLayoutId = (
  roleId: string | null | undefined,
  apiLayoutId?: string | null,
) => {
  if (isDashboardLayoutId(apiLayoutId)) {
    return apiLayoutId
  }
  if (roleId) {
    const stored = readRoleLayoutAssignment(roleId)
    if (stored) {
      return stored
    }
  }
  return DEFAULT_DASHBOARD_LAYOUT_ID
}

export const useDashboardLayouts = () => {
  const [version, setVersion] = useState(0)
  useEffect(() => subscribeDashboardLayouts(() => setVersion((current) => current + 1)), [])
  return useMemo(() => listDashboardLayouts(), [version])
}

export const useDashboardLayout = (layoutId?: string | null) => {
  const layouts = useDashboardLayouts()
  const resolvedId = isDashboardLayoutId(layoutId)
    ? layoutId
    : DEFAULT_DASHBOARD_LAYOUT_ID
  return useMemo(() => {
    const match = layouts.find((layout) => layout.id === resolvedId)
    return cloneLayout(match ?? layouts[0] ?? DASHBOARD_SEED_LAYOUTS[0])
  }, [layouts, resolvedId])
}
