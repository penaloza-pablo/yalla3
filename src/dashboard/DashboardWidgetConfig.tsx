import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { SegmentedControl } from '../design/SegmentedControl'
import { YlIcon } from '../design/icons'
import { swatchToHex } from './color'
import { widgetLabel } from './labels'
import { saveWidgetScales, saveWidgetTitle } from './widget-store'
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
  'var(--yl-caution)',
  'var(--yl-warning)',
  'var(--yl-success)',
  'var(--yl-ink)',
]

type Props = {
  widget: DashboardWidgetDefinition
  catalog?: DashboardWidgetDefinition[]
  onReplace?: (widgetId: string) => void
  onClose: () => void
}

const sortScales = (scales: DashboardWidgetScale[]) =>
  [...scales].sort(
    (left, right) =>
      right.colSpan * right.rowSpan - left.colSpan * left.rowSpan ||
      right.colSpan - left.colSpan ||
      right.rowSpan - left.rowSpan,
  )

export function DashboardWidgetConfig({
  widget,
  catalog,
  onReplace,
  onClose,
}: Props) {
  const { t } = useTranslation()
  const [scales, setScales] = useState<DashboardWidgetScale[]>(() =>
    sortScales(widget.scales.map((scale) => ({ ...scale }))),
  )
  const [activeKey, setActiveKey] = useState(
    () => (widget.scales[0] ? scaleKey(widget.scales[0].colSpan, widget.scales[0].rowSpan) : ''),
  )
  const [draftCol, setDraftCol] = useState<DashboardColSpan>(2)
  const [draftRow, setDraftRow] = useState<DashboardRowSpan>(1)
  const [draftSwatch, setDraftSwatch] = useState('#2f9e44')
  const [nameDraft, setNameDraft] = useState(() => widget.title ?? t(widget.titleKey))
  const name = widgetLabel({ ...widget, title: nameDraft }, t)

  const commitName = useCallback(() => {
    const nextName = nameDraft.trim()
    const fallback = t(widget.titleKey)
    const stored = nextName && nextName !== fallback ? nextName : ''
    saveWidgetTitle(widget.id, stored)
    setNameDraft(stored || fallback)
  }, [nameDraft, t, widget.id, widget.titleKey])

  const handleClose = useCallback(() => {
    commitName()
    onClose()
  }, [commitName, onClose])

  const active =
    scales.find((scale) => scaleKey(scale.colSpan, scale.rowSpan) === activeKey) ??
    scales[0] ??
    null

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleClose])

  const persist = (next: DashboardWidgetScale[], selectKey?: string) => {
    const unique = new Map<string, DashboardWidgetScale>()
    for (const scale of next) {
      unique.set(scaleKey(scale.colSpan, scale.rowSpan), scale)
    }
    const list = sortScales([...unique.values()])
    setScales(list)
    saveWidgetScales(widget.id, list)
    if (selectKey && unique.has(selectKey)) {
      setActiveKey(selectKey)
      return
    }
    if (list.some((scale) => scaleKey(scale.colSpan, scale.rowSpan) === activeKey)) {
      return
    }
    setActiveKey(list[0] ? scaleKey(list[0].colSpan, list[0].rowSpan) : '')
  }

  const addScale = () => {
    const key = scaleKey(draftCol, draftRow)
    persist(
      [...scales, { colSpan: draftCol, rowSpan: draftRow, swatch: draftSwatch, markup: '' }],
      key,
    )
  }

  const updateScale = (key: string, patch: Partial<DashboardWidgetScale>) => {
    const next = scales.map((scale) =>
      scaleKey(scale.colSpan, scale.rowSpan) === key ? { ...scale, ...patch } : scale,
    )
    const nextKey =
      patch.colSpan != null || patch.rowSpan != null
        ? scaleKey(
            patch.colSpan ??
              scales.find((scale) => scaleKey(scale.colSpan, scale.rowSpan) === key)?.colSpan ??
              1,
            patch.rowSpan ??
              scales.find((scale) => scaleKey(scale.colSpan, scale.rowSpan) === key)?.rowSpan ??
              1,
          )
        : key
    persist(next, nextKey)
  }

  const removeScale = (key: string) => {
    persist(scales.filter((scale) => scaleKey(scale.colSpan, scale.rowSpan) !== key))
  }

  return createPortal(
    <div
      className="yl-dashboard-config-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="yl-dashboard-config-title"
    >
      <header className="yl-dashboard-config-header">
        <div>
          <p className="eyebrow">{t('kit.dashboardLayout')}</p>
          <h1 className="page-title" id="yl-dashboard-config-title">
            {t('dashboard.configureWidgetTitle', { name })}
          </h1>
          <p className="subtitle">{t('dashboard.scaleHint')}</p>
        </div>
        <button className="btn-secondary" type="button" onClick={handleClose}>
          {t('common.close')}
        </button>
      </header>

      <div className="yl-dashboard-config-body">
        {onReplace && catalog && catalog.length > 0 ? (
          <label className="form-field">
            {t('dashboard.replaceWidget')}
            <select
              className="select-input"
              value={widget.id}
              aria-label={t('dashboard.replaceWidget')}
              onChange={(event) => onReplace(event.target.value)}
            >
              {catalog.map((item) => (
                <option key={item.id} value={item.id}>
                  {widgetLabel(item, t)}
                </option>
              ))}
            </select>
            <span className="form-field-hint">
              {t('dashboard.replaceWidgetHint')}
            </span>
          </label>
        ) : null}
        <label className="form-field">
          {t('dashboard.widgetNameField')}
          <input
            className="search-input"
            value={nameDraft}
            aria-label={t('dashboard.widgetNameField')}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur()
              }
            }}
          />
        </label>
        {scales.length === 0 ? (
          <p className="yl-dashboard-editor-empty">{t('dashboard.emptyScales')}</p>
        ) : (
          <>
            <SegmentedControl
              ariaLabel={t('dashboard.scaleSize')}
              value={active ? scaleKey(active.colSpan, active.rowSpan) : activeKey}
              onChange={setActiveKey}
              options={scales.map((scale) => ({
                id: scaleKey(scale.colSpan, scale.rowSpan),
                label: t('dashboard.spanLabel', {
                  cols: scale.colSpan,
                  rows: scale.rowSpan,
                }),
              }))}
            />
            {active ? (
              <div className="yl-dashboard-config-scale">
                <div className="yl-dashboard-editor-add">
                  <label className="form-field">
                    {t('dashboard.columns')}
                    <select
                      className="select-input"
                      value={String(active.colSpan)}
                      onChange={(event) =>
                        updateScale(scaleKey(active.colSpan, active.rowSpan), {
                          colSpan: asColSpan(Number(event.target.value)),
                        })
                      }
                    >
                      {SPAN_OPTIONS.map((value) => (
                        <option key={`edit-col-${value}`} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    {t('dashboard.rows')}
                    <select
                      className="select-input"
                      value={String(active.rowSpan)}
                      onChange={(event) =>
                        updateScale(scaleKey(active.colSpan, active.rowSpan), {
                          rowSpan: asRowSpan(Number(event.target.value)),
                        })
                      }
                    >
                      {SPAN_OPTIONS.map((value) => (
                        <option key={`edit-row-${value}`} value={value}>
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
                        value={swatchToHex(active.swatch)}
                        onChange={(event) =>
                          updateScale(scaleKey(active.colSpan, active.rowSpan), {
                            swatch: event.target.value,
                          })
                        }
                      />
                    </span>
                  </label>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => removeScale(scaleKey(active.colSpan, active.rowSpan))}
                  >
                    {t('dashboard.removeWidget')}
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
                      onClick={() =>
                        updateScale(scaleKey(active.colSpan, active.rowSpan), { swatch })
                      }
                    />
                  ))}
                </div>
                <label className="form-field yl-dashboard-markup-field">
                  {t('dashboard.scaleMarkup')}
                  <textarea
                    className="yl-dashboard-markup"
                    rows={12}
                    spellCheck={false}
                    value={active.markup ?? ''}
                    placeholder={t('dashboard.scaleMarkupPlaceholder', {
                      example: '{{income}}',
                    })}
                    onChange={(event) =>
                      updateScale(scaleKey(active.colSpan, active.rowSpan), {
                        markup: event.target.value,
                      })
                    }
                  />
                  <span className="form-field-hint">
                    {t('dashboard.scaleMarkupHint', {
                      example: '{{income}}',
                      example2: '{{nights}}',
                    })}
                  </span>
                </label>
              </div>
            ) : null}
          </>
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
            <YlIcon name="plus" size={16} />
            {t('dashboard.addScale')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
