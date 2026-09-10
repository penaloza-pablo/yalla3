import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PROPERTY_TAB_METRIC_KEYS,
  type PropertyTabMetricKey,
  type PropertyReportMetricValues,
} from './property-report-metrics'

type ReportTab = 'property' | 'management' | 'owner'

type Props = {
  metrics: PropertyReportMetricValues
}

const formatMetric = (
  key: PropertyTabMetricKey,
  value: number,
  money: Intl.NumberFormat,
) => (key === 'bookingCount' ? String(value) : money.format(value))

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

export function PropertyClosedReportView({ metrics }: Props) {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<ReportTab>('property')
  const money = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language.startsWith('es') ? 'es-ES' : 'en-GB', {
        style: 'currency',
        currency: 'EUR',
      }),
    [i18n.language],
  )

  const metricLabel = (key: PropertyTabMetricKey) =>
    t(`propertyReports.metrics.${key}`)
  const metricHelp = (key: PropertyTabMetricKey) =>
    t(`propertyReports.metrics.${key}Help`)

  return (
    <section className="closed-report">
      <div className="closed-report-tabs" role="tablist">
        {(['property', 'management', 'owner'] as const).map((item) => (
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

      {tab === 'property' ? (
        <div className="closed-report-grid">
          {PROPERTY_TAB_METRIC_KEYS.map((key) => {
            const label = metricLabel(key)
            const help = metricHelp(key)
            const isHero = key === 'netProfit'
            return (
              <article
                key={key}
                className={`card closed-report-kpi${isHero ? ' is-hero' : ''}`}
              >
                <p className="card-label">{label}</p>
                <div className="closed-report-kpi-value">
                  <p className="card-value">
                    {formatMetric(key, metrics[key], money)}
                  </p>
                  <MetricHelp label={label} help={help} />
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <section className="card closed-report-placeholder">
          <h2 className="card-title">
            {t(`propertyReports.reportTab.${tab}`)}
          </h2>
          <p className="closed-report-placeholder-lead">
            {t('propertyReports.reportTabComingSoon')}
          </p>
          <p className="card-meta">{t('propertyReports.reportTabReference')}</p>
          <ul className="closed-report-reference-list">
            {PROPERTY_TAB_METRIC_KEYS.map((key) => (
              <li key={key}>
                <strong>{metricLabel(key)}</strong>
                <span> — {metricHelp(key)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
