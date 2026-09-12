import { useEffect, useMemo, useState } from 'react'
import { DASHBOARD_WIDGETS } from './catalog'
import type { DashboardWidgetDefinition, DashboardWidgetScale } from './types'
import { asColSpan, asRowSpan, scaleKey } from './types'

const STORAGE_KEY = 'yalla.dashboard.widgets.v1'

type StoredFile = {
  widgets?: unknown
}

const listeners = new Set<() => void>()

const notify = () => {
  listeners.forEach((listener) => listener())
}

const parseScale = (value: unknown): DashboardWidgetScale | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  const item = value as Record<string, unknown>
  const colSpan = asColSpan(Number(item.colSpan))
  const rowSpan = asRowSpan(Number(item.rowSpan))
  const swatch = typeof item.swatch === 'string' ? item.swatch.trim() : ''
  if (!swatch || Number(item.colSpan) !== colSpan || Number(item.rowSpan) !== rowSpan) {
    return null
  }
  return { colSpan, rowSpan, swatch }
}

const parseOverrides = () => {
  if (typeof window === 'undefined') {
    return new Map<string, DashboardWidgetScale[]>()
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return new Map<string, DashboardWidgetScale[]>()
    }
    const parsed = JSON.parse(raw) as StoredFile
    const widgets =
      parsed.widgets && typeof parsed.widgets === 'object' && !Array.isArray(parsed.widgets)
        ? (parsed.widgets as Record<string, unknown>)
        : {}
    const overrides = new Map<string, DashboardWidgetScale[]>()
    for (const [id, entry] of Object.entries(widgets)) {
      const scales = Array.isArray(entry)
        ? entry
        : entry && typeof entry === 'object' && Array.isArray((entry as { scales?: unknown }).scales)
          ? (entry as { scales: unknown[] }).scales
          : []
      const parsedScales = scales
        .map((scale) => parseScale(scale))
        .filter((scale): scale is DashboardWidgetScale => Boolean(scale))
      const unique = new Map<string, DashboardWidgetScale>()
      for (const scale of parsedScales) {
        unique.set(scaleKey(scale.colSpan, scale.rowSpan), scale)
      }
      overrides.set(id, [...unique.values()])
    }
    return overrides
  } catch {
    return new Map<string, DashboardWidgetScale[]>()
  }
}

const cloneWidget = (
  widget: DashboardWidgetDefinition,
  scales?: DashboardWidgetScale[],
): DashboardWidgetDefinition => ({
  ...widget,
  scales: (scales ?? widget.scales).map((scale) => ({ ...scale })),
})

export const subscribeDashboardWidgets = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const listDashboardWidgets = (): DashboardWidgetDefinition[] => {
  const overrides = parseOverrides()
  return DASHBOARD_WIDGETS.map((widget) =>
    cloneWidget(widget, overrides.get(widget.id)),
  )
}

export const dashboardWidgetsById = () =>
  new Map(listDashboardWidgets().map((widget) => [widget.id, widget]))

export const saveWidgetScales = (widgetId: string, scales: DashboardWidgetScale[]) => {
  const unique = new Map<string, DashboardWidgetScale>()
  for (const scale of scales) {
    unique.set(scaleKey(scale.colSpan, scale.rowSpan), { ...scale })
  }
  const nextScales = [...unique.values()]
  const current = parseOverrides()
  current.set(widgetId, nextScales)
  const payload = {
    widgets: Object.fromEntries(
      [...current.entries()].map(([id, item]) => [id, { scales: item }]),
    ),
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  notify()
  return nextScales
}

export const useDashboardWidgets = () => {
  const [version, setVersion] = useState(0)
  useEffect(
    () => subscribeDashboardWidgets(() => setVersion((current) => current + 1)),
    [],
  )
  return useMemo(() => listDashboardWidgets(), [version])
}
