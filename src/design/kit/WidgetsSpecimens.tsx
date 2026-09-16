import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SegmentedControl } from '../SegmentedControl'
import { Specimen } from './Specimen'
import { DashboardGrid } from '../../dashboard/DashboardGrid'
import { DashboardLayoutEditor } from '../../dashboard/DashboardLayoutEditor'
import { IncidentsCheckinWidget } from '../../dashboard/checkin/IncidentsCheckinWidget'
import { ActivityDayWidget } from '../../dashboard/activity/ActivityDayWidget'
import { PlanningDayWidget } from '../../dashboard/planning/PlanningDayWidget'
import { DASHBOARD_LAYOUT_1 } from '../../dashboard/layouts'
import { useDashboardLayouts } from '../../dashboard/layout-store'
import { largestScale } from '../../dashboard/scale'
import { useDashboardWidgets } from '../../dashboard/widget-store'
import { layoutLabel } from '../../dashboard/labels'
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
      { id: 'span-1', widgetId: 'swatch.energy', colSpan: 2, rowSpan: 2 },
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
        refName="yl.widget.incidents"
        title={t('kit.widgetIncidents')}
        usage={t('kit.widgetIncidentsUsage')}
        desktop={
          <div className="yl-kit-checkin-stage">
            <IncidentsCheckinWidget colSpan={4} rowSpan={2} />
          </div>
        }
      />
      <Specimen
        refName="yl.widget.activity"
        title={t('kit.widgetActivity')}
        usage={t('kit.widgetActivityUsage')}
        desktop={
          <div className="yl-kit-variant-grid">
            <div className="yl-kit-variant-tile">
              <ActivityDayWidget
                name={t('dashboard.widgets.orbitOriginal')}
                colSpan={2}
                rowSpan={2}
                variant="arcs"
                tone="original"
              />
            </div>
            <div className="yl-kit-variant-tile">
              <ActivityDayWidget
                name={t('dashboard.widgets.orbitRose')}
                colSpan={2}
                rowSpan={2}
                variant="arcs"
                tone="rose"
              />
            </div>
            <div className="yl-kit-variant-tile">
              <ActivityDayWidget
                name={t('dashboard.widgets.orbitSlate')}
                colSpan={2}
                rowSpan={2}
                variant="arcs"
                tone="slate"
              />
            </div>
            <div className="yl-kit-variant-tile">
              <ActivityDayWidget
                name={t('dashboard.widgets.orbitBlue')}
                colSpan={2}
                rowSpan={2}
                variant="arcs"
                tone="blue"
              />
            </div>
            <div className="yl-kit-variant-tile is-wide">
              <ActivityDayWidget
                name={t('dashboard.widgets.human')}
                colSpan={4}
                rowSpan={1}
                variant="frequency"
              />
            </div>
          </div>
        }
      />
      <Specimen
        refName="yl.widget.planning"
        title={t('kit.widgetPlanning')}
        usage={t('kit.widgetPlanningUsage')}
        desktop={
          <div className="yl-kit-planning-stage">
            <div className="yl-kit-variant-tile">
              <PlanningDayWidget
                name={t('dashboard.widgets.planningRadarSlate')}
                colSpan={2}
                rowSpan={2}
                variant="rings"
                tone="slate"
              />
            </div>
            <div className="yl-kit-variant-tile">
              <PlanningDayWidget
                name={t('dashboard.widgets.planningRadarCream')}
                colSpan={2}
                rowSpan={2}
                variant="rings"
                tone="cream"
              />
            </div>
            <div className="yl-kit-variant-tile">
              <PlanningDayWidget
                name={t('dashboard.widgets.planningRadarGreen')}
                colSpan={2}
                rowSpan={2}
                variant="rings"
                tone="green"
              />
            </div>
            <div className="yl-kit-variant-tile">
              <PlanningDayWidget
                name={t('dashboard.widgets.planningLedger')}
                colSpan={2}
                rowSpan={2}
                variant="ledger"
              />
            </div>
          </div>
        }
      />
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
                      {layoutLabel(layout, t)}
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
                    label: layoutLabel(layout, t),
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
