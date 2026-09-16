import { useEffect, useMemo, useState } from 'react'
import { DASHBOARD_WIDGETS } from './catalog'
import type { DashboardWidgetDefinition, DashboardWidgetScale } from './types'
import { asColSpan, asRowSpan, scaleKey } from './types'

const STORAGE_KEY = 'yalla.dashboard.widgets.v1'

type StoredFile = {
  widgets?: unknown
}

type WidgetOverride = {
  scales: DashboardWidgetScale[]
  title?: string
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
  const markup = typeof item.markup === 'string' ? item.markup : undefined
  return { colSpan, rowSpan, swatch, ...(markup ? { markup } : {}) }
}

const parseScales = (value: unknown): DashboardWidgetScale[] => {
  if (!Array.isArray(value)) {
    return []
  }
  const unique = new Map<string, DashboardWidgetScale>()
  for (const scale of value.map((item) => parseScale(item))) {
    if (!scale) {
      continue
    }
    unique.set(scaleKey(scale.colSpan, scale.rowSpan), scale)
  }
  return [...unique.values()]
}

const parseTitle = (value: unknown) => {
  if (typeof value !== 'string') {
    return undefined
  }
  const title = value.trim()
  return title || undefined
}

const parseOverrides = () => {
  if (typeof window === 'undefined') {
    return new Map<string, WidgetOverride>()
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return new Map<string, WidgetOverride>()
    }
    const parsed = JSON.parse(raw) as StoredFile
    const widgets =
      parsed.widgets && typeof parsed.widgets === 'object' && !Array.isArray(parsed.widgets)
        ? (parsed.widgets as Record<string, unknown>)
        : {}
    const overrides = new Map<string, WidgetOverride>()
    for (const [id, entry] of Object.entries(widgets)) {
      const scales = parseScales(
        Array.isArray(entry)
          ? entry
          : entry && typeof entry === 'object'
            ? (entry as { scales?: unknown }).scales
            : [],
      )
      const title =
        entry && typeof entry === 'object' && !Array.isArray(entry)
          ? parseTitle((entry as { title?: unknown }).title)
          : undefined
      overrides.set(id, { scales, ...(title ? { title } : {}) })
    }
    return overrides
  } catch {
    return new Map<string, WidgetOverride>()
  }
}

const catalogScales = (widgetId: string) => {
  const catalog = DASHBOARD_WIDGETS.find((widget) => widget.id === widgetId)
  return (catalog?.scales ?? []).map((scale) => ({ ...scale }))
}

const writeOverrides = (current: Map<string, WidgetOverride>) => {
  const payload = {
    widgets: Object.fromEntries(
      [...current.entries()].map(([id, item]) => [
        id,
        {
          scales: item.scales,
          ...(item.title ? { title: item.title } : {}),
        },
      ]),
    ),
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  notify()
}

const cloneWidget = (
  widget: DashboardWidgetDefinition,
  override?: WidgetOverride,
): DashboardWidgetDefinition => ({
  ...widget,
  title: override?.title,
  scales: (override?.scales ?? widget.scales).map((scale) => ({ ...scale })),
})

export const subscribeDashboardWidgets = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const listDashboardWidgets = (): DashboardWidgetDefinition[] => {
  const overrides = parseOverrides()
  return DASHBOARD_WIDGETS.map((widget) => cloneWidget(widget, overrides.get(widget.id)))
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
  const previous = current.get(widgetId)
  current.set(widgetId, {
    scales: nextScales,
    ...(previous?.title ? { title: previous.title } : {}),
  })
  writeOverrides(current)
  return nextScales
}

export const saveWidgetTitle = (widgetId: string, title: string) => {
  const current = parseOverrides()
  const previous = current.get(widgetId)
  const nextTitle = parseTitle(title)
  current.set(widgetId, {
    scales: previous?.scales ?? catalogScales(widgetId),
    ...(nextTitle ? { title: nextTitle } : {}),
  })
  writeOverrides(current)
  return nextTitle
}

export const useDashboardWidgets = () => {
  const [version, setVersion] = useState(0)
  useEffect(
    () => subscribeDashboardWidgets(() => setVersion((current) => current + 1)),
    [],
  )
  return useMemo(() => listDashboardWidgets(), [version])
}
