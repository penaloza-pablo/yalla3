import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  REPORT_TABS,
  defaultReportVisibility,
  type ReportTabId,
  type ReportVisibility,
} from '../../amplify/functions/shared/property-report-settings'
import type { PropertyReportMetricValues } from './property-report-metrics'

type Props = {
  metrics: PropertyReportMetricValues
  visibility?: ReportVisibility | null
  hideManagementFee?: boolean
  feeFormula?: string
  contributionFormula?: string
  ourProfitFormula?: string
  netEarningsFormula?: string
}

const COUNT_IDS = new Set(['bookingCount'])

const formatMetric = (
  key: string,
  value: number,
  money: Intl.NumberFormat,
) => (COUNT_IDS.has(key) ? String(value) : money.format(value))

const MetricHelp = ({ label, help }: { label: string; help: string }) => (
  <span className="metric-help-wrap">
    <button
      className="metric-help"
      type="button"
      aria-label={`${label}. ${help}`}
    >
      ?
    </button>
    <span className="metric-help-tip" role="tooltip">
      {help}
    </span>
  </span>
)

export function PropertyClosedReportView({
  metrics,
  visibility,
  hideManagementFee = false,
  feeFormula,
  contributionFormula,
  ourProfitFormula,
  netEarningsFormula,
}: Props) {
  const { t, i18n } = useTranslation()
  const resolved = visibility ?? defaultReportVisibility()
  const tabs = REPORT_TABS.filter((item) => resolved[item].visible)
  const [tab, setTab] = useState<ReportTabId>(tabs[0] ?? 'property')
  const money = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language.startsWith('es') ? 'es-ES' : 'en-GB', {
        style: 'currency',
        currency: 'EUR',
      }),
    [i18n.language],
  )

  useEffect(() => {
    if (tabs.length > 0 && !tabs.includes(tab)) {
      setTab(tabs[0])
    }
  }, [tab, tabs])

  const metricLabel = (key: string) =>
    t(`propertyReports.metrics.${key}`, {
      defaultValue: t(`propertyReports.formulaVars.${key}`, { defaultValue: key }),
    })

  const metricHelp = (key: string) => {
    if (key === 'managementFee' && feeFormula) {
      return t('propertyReports.metrics.managementFeeHelp', { formula: feeFormula })
    }
    if (key === 'propertyContribution' && contributionFormula) {
      return t('propertyReports.metrics.propertyContributionHelp', {
        formula: contributionFormula,
      })
    }
    if (key === 'ourProfit') {
      return ourProfitFormula
        ? t('propertyReports.metrics.ourProfitHelp', { formula: ourProfitFormula })
        : t('propertyReports.metrics.ourProfitEmptyHelp')
    }
    if (key === 'netEarnings') {
      return netEarningsFormula
        ? t('propertyReports.metrics.netEarningsHelp', { formula: netEarningsFormula })
        : t('propertyReports.metrics.netEarningsEmptyHelp')
    }
    return t(`propertyReports.metrics.${key}Help`, { defaultValue: metricLabel(key) })
  }

  const metricValue = (key: string) => {
    const value = metrics[key as keyof PropertyReportMetricValues]
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
  }

  if (tabs.length === 0) {
    return (
      <section className="card closed-report-placeholder">
        <p className="closed-report-placeholder-lead">
          {t('propertyReports.noVisibleTabs')}
        </p>
      </section>
    )
  }

  const row = resolved[tab]
  const metricIds = row.metrics.filter(
    (id) => !(hideManagementFee && id === 'managementFee'),
  )

  return (
    <section className="closed-report">
      <div className="closed-report-tabs" role="tablist">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            className={`closed-report-tab${tab === item ? ' is-active' : ''}`}
            onClick={() => setTab(item)}
          >
            {t(`propertyReports.reportTab.${item}`)}
          </button>
        ))}
      </div>

      <div className="closed-report-grid">
        {metricIds.map((key) => {
          const label = metricLabel(key)
          const help = metricHelp(key)
          const isHero = key === row.primary
          return (
            <article
              key={key}
              className={`card closed-report-kpi${isHero ? ' is-hero' : ''}`}
            >
              <p className="card-label">{label}</p>
              <div className="closed-report-kpi-value">
                <p className="card-value">
                  {formatMetric(key, metricValue(key), money)}
                </p>
                <MetricHelp label={label} help={help} />
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
