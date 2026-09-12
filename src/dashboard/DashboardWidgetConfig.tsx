import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { swatchToHex } from './color'
import { saveWidgetScales } from './widget-store'
import type {
  DashboardColSpan,
  DashboardRowSpan,
  DashboardWidgetDefinition,
  DashboardWidgetScale,
} from './types'
import { asColSpan, asRowSpan, scaleKey } from './types'
import './dashboard.css'

const SPAN_OPTIONS: Array<DashboardColSpan | DashboardRowSpan> = [1, 2, 3, 4]

const PRESETS = [
  '#2f9e44',
  '#e4c01f',
  '#b497d6',
  'rgb(229, 32, 82)',
  'rgb(23, 158, 198)',
  'var(--yl-go)',
  'var(--yl-energy)',
  'var(--yl-kk-human)',
  'var(--yl-warning)',
  'var(--yl-success)',
  'var(--yl-ink)',
]

type Props = {
  widget: DashboardWidgetDefinition
  onClose: () => void
}

export function DashboardWidgetConfig({ widget, onClose }: Props) {
  const { t } = useTranslation()
  const [scales, setScales] = useState<DashboardWidgetScale[]>(() =>
    widget.scales.map((scale) => ({ ...scale })),
  )
  const [draftCol, setDraftCol] = useState<DashboardColSpan>(2)
  const [draftRow, setDraftRow] = useState<DashboardRowSpan>(1)
  const [draftSwatch, setDraftSwatch] = useState('#2f9e44')
  const name = t(widget.titleKey)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const persist = (next: DashboardWidgetScale[]) => {
    const unique = new Map<string, DashboardWidgetScale>()
    for (const scale of next) {
      unique.set(scaleKey(scale.colSpan, scale.rowSpan), scale)
    }
    const list = [...unique.values()].sort(
      (left, right) =>
        right.colSpan * right.rowSpan - left.colSpan * left.rowSpan ||
        right.colSpan - left.colSpan ||
        right.rowSpan - left.rowSpan,
    )
    setScales(list)
    saveWidgetScales(widget.id, list)
  }

  const addScale = () => {
    persist([
      ...scales,
      { colSpan: draftCol, rowSpan: draftRow, swatch: draftSwatch },
    ])
  }

  const updateScale = (key: string, patch: Partial<DashboardWidgetScale>) => {
    persist(
      scales.map((scale) =>
        scaleKey(scale.colSpan, scale.rowSpan) === key
          ? { ...scale, ...patch }
          : scale,
      ),
    )
  }

  const removeScale = (key: string) => {
    persist(
      scales.filter((scale) => scaleKey(scale.colSpan, scale.rowSpan) !== key),
    )
  }

  return createPortal(
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="yl-dashboard-config-title"
      onClick={onClose}
    >
      <div
        className="modal modal-scrollable yl-dashboard-config"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h3 className="modal-title" id="yl-dashboard-config-title">
              {t('dashboard.configureWidgetTitle', { name })}
            </h3>
            <p className="modal-subtitle">{t('dashboard.scaleHint')}</p>
          </div>
          <button
            className="btn-ghost"
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            {t('common.close')}
          </button>
        </div>
        <div className="modal-body">
          {scales.length === 0 ? (
            <p className="yl-dashboard-editor-empty">{t('dashboard.emptyScales')}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('dashboard.scaleSize')}</th>
                    <th>{t('dashboard.scaleFill')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {scales.map((scale) => {
                    const key = scaleKey(scale.colSpan, scale.rowSpan)
                    return (
                      <tr key={key}>
                        <td>
                          <div className="yl-dashboard-scale-size">
                            <select
                              className="select-input"
                              value={String(scale.colSpan)}
                              aria-label={t('dashboard.columns')}
                              onChange={(event) =>
                                updateScale(key, {
                                  colSpan: asColSpan(Number(event.target.value)),
                                })
                              }
                            >
                              {SPAN_OPTIONS.map((value) => (
                                <option key={`edit-col-${key}-${value}`} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                            <span aria-hidden="true">×</span>
                            <select
                              className="select-input"
                              value={String(scale.rowSpan)}
                              aria-label={t('dashboard.rows')}
                              onChange={(event) =>
                                updateScale(key, {
                                  rowSpan: asRowSpan(Number(event.target.value)),
                                })
                              }
                            >
                              {SPAN_OPTIONS.map((value) => (
                                <option key={`edit-row-${key}-${value}`} value={value}>
                                  {value}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                        <td>
                          <label className="yl-dashboard-color">
                            <span
                              className="yl-dashboard-color-chip"
                              style={{ background: scale.swatch }}
                            />
                            <input
                              type="color"
                              value={swatchToHex(scale.swatch)}
                              aria-label={t('dashboard.scaleFill')}
                              onChange={(event) =>
                                updateScale(key, { swatch: event.target.value })
                              }
                            />
                          </label>
                        </td>
                        <td>
                          <button
                            className="btn-secondary"
                            type="button"
                            onClick={() => removeScale(key)}
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

          <div className="yl-dashboard-editor-add">
            <label className="form-field">
              {t('dashboard.columns')}
              <select
                className="select-input"
                value={String(draftCol)}
                onChange={(event) => setDraftCol(asColSpan(Number(event.target.value)))}
              >
                {SPAN_OPTIONS.map((value) => (
                  <option key={`col-${value}`} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              {t('dashboard.rows')}
              <select
                className="select-input"
                value={String(draftRow)}
                onChange={(event) => setDraftRow(asRowSpan(Number(event.target.value)))}
              >
                {SPAN_OPTIONS.map((value) => (
                  <option key={`row-${value}`} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              {t('dashboard.scaleFill')}
              <span className="yl-dashboard-color">
                <input
                  type="color"
                  value={swatchToHex(draftSwatch)}
                  onChange={(event) => setDraftSwatch(event.target.value)}
                />
              </span>
            </label>
            <button className="btn-primary" type="button" onClick={addScale}>
              {t('dashboard.addScale')}
            </button>
          </div>
          <div className="yl-dashboard-presets" role="group" aria-label={t('dashboard.scaleFill')}>
            {PRESETS.map((swatch) => (
              <button
                key={swatch}
                className="yl-dashboard-preset"
                type="button"
                style={{ background: swatch }}
                aria-label={swatch}
                onClick={() => setDraftSwatch(swatch)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
