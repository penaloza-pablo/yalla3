import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  REPORT_TABS,
  defaultReportVisibility,
  type ReportTabId,
  type ReportVisibility,
} from '../../amplify/functions/shared/property-report-settings'
import type { PropertyReportMetricValues } from './property-report-metrics'
import {
  buildMetricDetailSections,
  metricHasDetail,
  type MetricDetailSources,
} from './property-report-metric-detail'

type Props = {
  metrics: PropertyReportMetricValues
  detailSources: MetricDetailSources
  visibility?: ReportVisibility | null
  hideManagementFee?: boolean
  feeFormula?: string
  contributionFormula?: string
  ourProfitFormula?: string
  netEarningsFormula?: string
}

const COUNT_IDS = new Set(['bookingCount', 'nights'])

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
      onClick={(event) => event.stopPropagation()}
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
  detailSources,
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
  const [detailId, setDetailId] = useState<string | null>(null)
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

  useEffect(() => {
    setDetailId(null)
  }, [tab])

  useEffect(() => {
    if (!detailId) {
      return
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDetailId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailId])

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
  const detailSections = detailId
    ? buildMetricDetailSections(detailId, detailSources)
    : []
  const formatDetailAmount = (value: number) =>
    detailId && COUNT_IDS.has(detailId) ? String(value) : money.format(value)

  const closeDetail = () => setDetailId(null)

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
          const canOpenDetail = metricHasDetail(key)
          return (
            <article
              key={key}
              className={`card closed-report-kpi${isHero ? ' is-hero' : ''}${canOpenDetail ? ' is-clickable' : ''}`}
              role={canOpenDetail ? 'button' : undefined}
              tabIndex={canOpenDetail ? 0 : undefined}
              onClick={canOpenDetail ? () => setDetailId(key) : undefined}
              onKeyDown={
                canOpenDetail
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setDetailId(key)
                      }
                    }
                  : undefined
              }
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

      {detailId ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={closeDetail}
        >
          <div
            className="modal modal-scrollable"
            role="dialog"
            aria-modal="true"
            aria-labelledby="metric-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 className="modal-title" id="metric-detail-title">
                  {metricLabel(detailId)}
                </h3>
                <p className="modal-subtitle">
                  {formatMetric(detailId, metricValue(detailId), money)}
                </p>
              </div>
              <button
                type="button"
                className="btn-ghost"
                onClick={closeDetail}
              >
                {t('common.close')}
              </button>
            </div>
            <div className="modal-body">
              {detailSections.length === 0 ? (
                <p className="modal-subtitle">
                  {t('propertyReports.metricDetailEmpty')}
                </p>
              ) : (
                detailSections.map((item) => (
                  <section key={item.id} className="metric-detail-section">
                    {detailSections.length > 1 ? (
                      <h4 className="metric-detail-section-title">
                        {t(item.titleKey)}
                      </h4>
                    ) : null}
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>{t('common.title')}</th>
                            <th>{t('common.amount')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.rows.map((line) => (
                            <tr key={line.id}>
                              <td>{line.title || '—'}</td>
                              <td>{formatDetailAmount(line.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
