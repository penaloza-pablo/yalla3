import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SegmentedControl } from '../SegmentedControl'
import { Specimen } from './Specimen'
import { DashboardGrid } from '../../dashboard/DashboardGrid'
import { DashboardLayoutEditor } from '../../dashboard/DashboardLayoutEditor'
import { DASHBOARD_LAYOUT_1 } from '../../dashboard/layouts'
import { useDashboardLayouts } from '../../dashboard/layout-store'
import { largestScale } from '../../dashboard/scale'
import { useDashboardWidgets } from '../../dashboard/widget-store'
import { dashboardLayoutNumber } from '../../../amplify/functions/shared/dashboard-layout'
import type { DashboardLayout } from '../../dashboard/types'

export function WidgetsSpecimens() {
  const { t } = useTranslation()
  const layouts = useDashboardLayouts()
  const catalog = useDashboardWidgets()
  const [previewId, setPreviewId] = useState(layouts[0]?.id ?? 'layout-1')
  const preview =
    layouts.find((layout) => layout.id === previewId) ??
    layouts[0] ??
    DASHBOARD_LAYOUT_1
  const swatchLayout: DashboardLayout = {
    id: 'layout.swatches',
    widgets: catalog.map((widget, index) => {
      const preferred = largestScale(widget.scales)
      return {
        id: `swatch-${index}`,
        widgetId: widget.id,
        colSpan: preferred?.colSpan ?? 1,
        rowSpan: preferred?.rowSpan ?? 1,
      }
    }),
  }
  const spanLayout: DashboardLayout = {
    id: 'layout.spans',
    widgets: [
      { id: 'span-0', widgetId: 'swatch.rose', colSpan: 1, rowSpan: 1 },
      { id: 'span-1', widgetId: 'swatch.energy', colSpan: 2, rowSpan: 1 },
      { id: 'span-2', widgetId: 'swatch.go', colSpan: 2, rowSpan: 2 },
      { id: 'span-3', widgetId: 'swatch.success', colSpan: 1, rowSpan: 2 },
      { id: 'span-4', widgetId: 'swatch.human', colSpan: 4, rowSpan: 1 },
      { id: 'span-5', widgetId: 'swatch.go', colSpan: 2, rowSpan: 3 },
    ],
  }

  return (
    <>
      <p className="yl-kit-legend">{t('kit.widgetsIntro')}</p>
      <Specimen
        refName="yl.dashboard.layout"
        title={t('kit.dashboardLayout')}
        usage={t('kit.dashboardLayoutUsage')}
        desktop={<DashboardLayoutEditor />}
      />
      <Specimen
        refName="yl.widget.swatch"
        title={t('kit.widgetSwatch')}
        usage={t('kit.widgetSwatchUsage')}
        desktop={<DashboardGrid layout={swatchLayout} />}
      />
      <Specimen
        refName="yl.widget.span"
        title={t('kit.widgetSpan')}
        usage={t('kit.widgetSpanUsage')}
        desktop={<DashboardGrid layout={spanLayout} />}
      />
      <Specimen
        refName="yl.dashboard.grid"
        title={t('kit.dashboardGrid')}
        usage={t('kit.dashboardGridUsage')}
        desktop={
          <div className="yl-dashboard">
            {layouts.length > 4 ? (
              <label className="form-field yl-dashboard-editor-select">
                {t('dashboard.layout')}
                <select
                  className="select-input"
                  value={preview.id}
                  aria-label={t('dashboard.layout')}
                  onChange={(event) => setPreviewId(event.target.value)}
                >
                  {layouts.map((layout) => (
                    <option key={layout.id} value={layout.id}>
                      {t('dashboard.layoutName', {
                        n: dashboardLayoutNumber(layout.id),
                      })}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="yl-dashboard-role">
                <SegmentedControl<string>
                  ariaLabel={t('dashboard.layout')}
                  value={preview.id}
                  onChange={setPreviewId}
                  options={layouts.map((layout) => ({
                    id: layout.id,
                    label: t('dashboard.layoutName', {
                      n: dashboardLayoutNumber(layout.id),
                    }),
                  }))}
                />
              </div>
            )}
            <DashboardGrid layout={preview} />
          </div>
        }
      />
    </>
  )
}
