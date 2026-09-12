import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfirm } from '../design/ConfirmDialog'
import { YlIcon } from '../design/icons'
import {
  dashboardLayoutNumber,
  isProtectedDashboardLayoutId,
} from '../../amplify/functions/shared/dashboard-layout'
import { DashboardGrid } from './DashboardGrid'
import {
  createDashboardLayout,
  deleteDashboardLayout,
  saveDashboardLayout,
  useDashboardLayouts,
} from './layout-store'
import { largestScale } from './scale'
import { useDashboardWidgets } from './widget-store'
import type {
  DashboardColSpan,
  DashboardLayout,
  DashboardRowSpan,
  DashboardWidgetPlacement,
} from './types'
import './dashboard.css'

const SPAN_OPTIONS: Array<DashboardColSpan | DashboardRowSpan> = [1, 2, 3, 4]

const asColSpan = (value: string): DashboardColSpan => {
  const parsed = Number(value)
  if (parsed === 2 || parsed === 3 || parsed === 4) {
    return parsed
  }
  return 1
}

const asRowSpan = (value: string): DashboardRowSpan => {
  const parsed = Number(value)
  if (parsed === 2 || parsed === 3 || parsed === 4) {
    return parsed
  }
  return 1
}

export function DashboardLayoutEditor() {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const layouts = useDashboardLayouts()
  const catalog = useDashboardWidgets()
  const widgetById = new Map(catalog.map((widget) => [widget.id, widget]))
  const [selectedId, setSelectedId] = useState(layouts[0]?.id ?? 'layout-1')
  const [widgetToAdd, setWidgetToAdd] = useState(catalog[0]?.id ?? '')
  const nameFor = (id: string) =>
    t('dashboard.layoutName', { n: dashboardLayoutNumber(id) })

  const selected =
    layouts.find((layout) => layout.id === selectedId) ?? layouts[0] ?? null

  useEffect(() => {
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id)
    }
  }, [selected, selectedId])

  const updateLayout = (next: DashboardLayout) => {
    saveDashboardLayout(next)
    setSelectedId(next.id)
  }

  const addWidget = () => {
    if (!selected || !widgetToAdd) {
      return
    }
    const definition = widgetById.get(widgetToAdd)
    if (!definition) {
      return
    }
    const preferred = largestScale(definition.scales)
    if (!preferred) {
      return
    }
    const placement: DashboardWidgetPlacement = {
      id: `${selected.id}-${Date.now()}`,
      widgetId: definition.id,
      colSpan: preferred.colSpan,
      rowSpan: preferred.rowSpan,
    }
    updateLayout({
      ...selected,
      widgets: [...selected.widgets, placement],
    })
  }

  const updatePlacement = (
    placementId: string,
    patch: Partial<Pick<DashboardWidgetPlacement, 'colSpan' | 'rowSpan'>>,
  ) => {
    if (!selected) {
      return
    }
    updateLayout({
      ...selected,
      widgets: selected.widgets.map((widget) =>
        widget.id === placementId ? { ...widget, ...patch } : widget,
      ),
    })
  }

  const removePlacement = (placementId: string) => {
    if (!selected) {
      return
    }
    updateLayout({
      ...selected,
      widgets: selected.widgets.filter((widget) => widget.id !== placementId),
    })
  }

  const addLayout = () => {
    const created = createDashboardLayout()
    setSelectedId(created.id)
  }

  const removeLayout = async () => {
    if (!selected || isProtectedDashboardLayoutId(selected.id)) {
      return
    }
    const accepted = await confirm({
      title: t('dashboard.deleteLayoutTitle'),
      message: t('dashboard.deleteLayoutBody', {
        name: nameFor(selected.id),
      }),
      confirmLabel: t('dashboard.deleteLayout'),
      destructive: true,
    })
    if (!accepted) {
      return
    }
    deleteDashboardLayout(selected.id)
    setSelectedId('layout-1')
  }

  const layoutOptions = layouts.map((layout) => ({
    id: layout.id,
    label: nameFor(layout.id),
  }))

  if (!selected) {
    return null
  }

  return (
    <div className="yl-dashboard-editor">
      <div className="yl-dashboard-editor-toolbar">
        <label className="form-field yl-dashboard-editor-select">
          {t('dashboard.layout')}
          <select
            className="select-input"
            value={selected.id}
            aria-label={t('dashboard.layout')}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {layoutOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="yl-dashboard-editor-actions">
          <button className="btn-secondary" type="button" onClick={addLayout}>
            <YlIcon name="plus" size={16} />
            {t('dashboard.newLayout')}
          </button>
          {isProtectedDashboardLayoutId(selected.id) ? null : (
            <button
              className="btn-secondary"
              type="button"
              onClick={() => void removeLayout()}
            >
              {t('dashboard.deleteLayout')}
            </button>
          )}
        </div>
      </div>

      <DashboardGrid layout={selected} />

      <div className="yl-dashboard-editor-placements">
        <div className="yl-dashboard-editor-add">
          <label className="form-field yl-dashboard-editor-select">
            {t('dashboard.addWidget')}
            <select
              className="select-input"
              value={widgetToAdd}
              aria-label={t('dashboard.addWidget')}
              onChange={(event) => setWidgetToAdd(event.target.value)}
            >
              {catalog.map((widget) => (
                <option key={widget.id} value={widget.id}>
                  {t(widget.titleKey)}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" type="button" onClick={addWidget}>
            {t('kit.add')}
          </button>
        </div>

        {selected.widgets.length === 0 ? (
          <p className="yl-dashboard-editor-empty">{t('dashboard.emptyLayout')}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('dashboard.widget')}</th>
                  <th>{t('dashboard.columns')}</th>
                  <th>{t('dashboard.rows')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {selected.widgets.map((placement) => {
                  const definition = widgetById.get(placement.widgetId)
                  return (
                    <tr key={placement.id}>
                      <td>
                        {definition
                          ? t(definition.titleKey)
                          : placement.widgetId}
                      </td>
                      <td>
                        <select
                          className="select-input"
                          value={String(placement.colSpan)}
                          aria-label={t('dashboard.columns')}
                          onChange={(event) =>
                            updatePlacement(placement.id, {
                              colSpan: asColSpan(event.target.value),
                            })
                          }
                        >
                          {SPAN_OPTIONS.map((value) => (
                            <option key={`col-${value}`} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="select-input"
                          value={String(placement.rowSpan)}
                          aria-label={t('dashboard.rows')}
                          onChange={(event) =>
                            updatePlacement(placement.id, {
                              rowSpan: asRowSpan(event.target.value),
                            })
                          }
                        >
                          {SPAN_OPTIONS.map((value) => (
                            <option key={`row-${value}`} value={value}>
                              {value}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() => removePlacement(placement.id)}
                        >
                          {t('dashboard.removeWidget')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
