import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DashboardWidget } from './DashboardWidget'
import { DashboardWidgetConfig } from './DashboardWidgetConfig'
import { resolveVisibleWidgets } from './scale'
import {
  DASHBOARD_CELL_PX,
  DASHBOARD_COLUMNS,
  DASHBOARD_INSET_PX,
  DASHBOARD_SIDEBAR_PX,
  DASHBOARD_TRACK_GAP_PX,
  DASHBOARD_TRACK_PX,
  DASHBOARD_WIDGET_SCALE,
} from './types'
import type { DashboardLayout, DashboardWidgetPlacement } from './types'
import { widgetLabel } from './labels'
import { useDashboardWidgets } from './widget-store'
import './dashboard.css'

type Props = {
  layout: DashboardLayout
  variant?: 'board' | 'embedded'
  showConfig?: boolean
  onConfigurePlacement?: (placement: DashboardWidgetPlacement) => void
}

const viewportBox = (variant: 'board' | 'embedded') => {
  if (typeof window === 'undefined') {
    return {
      width: 1280,
      height: variant === 'board' ? 800 : Number.POSITIVE_INFINITY,
    }
  }
  if (variant !== 'board') {
    return { width: window.innerWidth, height: Number.POSITIVE_INFINITY }
  }
  const sidebar =
    window.innerWidth >= 769 ? DASHBOARD_SIDEBAR_PX + DASHBOARD_INSET_PX : 0
  return {
    width: Math.max(0, window.innerWidth - DASHBOARD_INSET_PX * 2 - sidebar),
    height: Math.max(0, window.innerHeight - DASHBOARD_INSET_PX * 2),
  }
}

export function DashboardGrid({
  layout,
  variant = 'embedded',
  showConfig = false,
  onConfigurePlacement,
}: Props) {
  const { t } = useTranslation()
  const widgets = useDashboardWidgets()
  const hostRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(() => viewportBox(variant))
  const [configId, setConfigId] = useState<string | null>(null)
  const widgetsById = useMemo(
    () => new Map(widgets.map((widget) => [widget.id, widget])),
    [widgets],
  )

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    const update = () => {
      if (variant === 'board') {
        setAvailable(viewportBox('board'))
        return
      }
      setAvailable({
        width: host.clientWidth,
        height: Number.POSITIVE_INFINITY,
      })
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(host)
    if (variant === 'board') {
      window.addEventListener('resize', update)
      window.visualViewport?.addEventListener('resize', update)
    }
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', update)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [variant])

  const resolved = useMemo(
    () =>
      resolveVisibleWidgets(
        layout,
        widgetsById,
        available.width,
        available.height,
      ),
    [available.height, available.width, layout, widgetsById],
  )
  const configWidget = widgets.find((widget) => widget.id === configId) ?? null

  return (
    <>
      <div
        ref={hostRef}
        className={`yl-dashboard-host${variant === 'board' ? ' is-board' : ''}`}
      >
        <div
          className="yl-dashboard-grid"
          style={
            {
              '--yl-dashboard-cell': `${DASHBOARD_CELL_PX}px`,
              '--yl-dashboard-track': `${DASHBOARD_TRACK_PX}px`,
              '--yl-dashboard-widget-scale': String(DASHBOARD_WIDGET_SCALE),
              '--yl-dashboard-gap': `${DASHBOARD_TRACK_GAP_PX}px`,
              '--yl-dashboard-columns': String(
                resolved.columns || DASHBOARD_COLUMNS,
              ),
            } as Record<string, string>
          }
        >
          {resolved.widgets.map(({ placement, scale }) => {
            const definition = widgetsById.get(placement.widgetId)
            if (!definition) {
              return null
            }
            return (
              <DashboardWidget
                key={placement.id}
                name={widgetLabel(definition, t)}
                kind={definition.kind}
                scale={scale}
                colStart={placement.colStart}
                rowStart={placement.rowStart}
                activity={definition.activity}
                planning={definition.planning}
                reviews={definition.reviews}
                supplies={definition.supplies}
                date={definition.date}
                onConfigure={
                  showConfig
                    ? () => {
                        if (onConfigurePlacement) {
                          onConfigurePlacement(placement)
                          return
                        }
                        setConfigId(definition.id)
                      }
                    : undefined
                }
              />
            )
          })}
        </div>
      </div>
      {configWidget ? (
        <DashboardWidgetConfig
          key={configWidget.id}
          widget={configWidget}
          onClose={() => setConfigId(null)}
        />
      ) : null}
    </>
  )
}
