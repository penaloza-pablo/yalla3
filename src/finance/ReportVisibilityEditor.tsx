import { useTranslation } from 'react-i18next'
import {
  REPORT_TABS,
  type ReportTabId,
  type ReportVisibility,
} from '../../amplify/functions/shared/property-report-settings'
import { VISIBILITY_METRIC_IDS } from '../../amplify/functions/shared/property-report-formula'

type Props = {
  value: ReportVisibility
  onChange: (value: ReportVisibility) => void
  metricLabel: (id: string) => string
}

export function ReportVisibilityEditor({ value, onChange, metricLabel }: Props) {
  const { t } = useTranslation()

  const updateTab = (
    tab: ReportTabId,
    patch: Partial<ReportVisibility[ReportTabId]>,
  ) => {
    const current = value[tab]
    const next = { ...current, ...patch }
    if (patch.metrics) {
      const metrics = patch.metrics
      if (!metrics.includes(next.primary)) {
        next.primary = metrics[0] ?? current.primary
      }
    }
    onChange({ ...value, [tab]: next })
  }

  const toggleMetric = (tab: ReportTabId, id: string, checked: boolean) => {
    const current = value[tab]
    const metrics = checked
      ? [...current.metrics, id]
      : current.metrics.filter((item) => item !== id)
    updateTab(tab, { metrics })
  }

  return (
    <div className="report-visibility-grid">
      {REPORT_TABS.map((tab) => {
        const row = value[tab]
        return (
          <section key={tab} className="report-visibility-tab">
            <div className="report-visibility-tab-head">
              <h5 className="card-title">
                {t(`propertyReports.reportTab.${tab}`)}
              </h5>
              <label className="report-visibility-switch">
                <input
                  type="checkbox"
                  checked={row.visible}
                  onChange={(event) =>
                    updateTab(tab, { visible: event.target.checked })
                  }
                />
                <span>{t('propertyReports.visibilityShowTab')}</span>
              </label>
            </div>
            <label className="form-field">
              <span>{t('propertyReports.visibilityPrimary')}</span>
              <select
                value={row.primary}
                disabled={!row.visible}
                onChange={(event) =>
                  updateTab(tab, { primary: event.target.value })
                }
              >
                {(row.metrics.length ? row.metrics : VISIBILITY_METRIC_IDS).map(
                  (id) => (
                    <option key={id} value={id}>
                      {metricLabel(id)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <div className="report-visibility-metrics">
              {VISIBILITY_METRIC_IDS.map((id) => (
                <label key={id} className="report-visibility-metric">
                  <input
                    type="checkbox"
                    checked={row.metrics.includes(id)}
                    disabled={!row.visible}
                    onChange={(event) =>
                      toggleMetric(tab, id, event.target.checked)
                    }
                  />
                  <span>{metricLabel(id)}</span>
                </label>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
