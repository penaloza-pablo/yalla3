import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  NATIVE_PERIOD_START,
  REVIEW_METRIC_IDS,
  SOURCE_FIELD_MAP,
  amountToDecimalString,
  annualSeries,
  ltmPeriods,
  metricAggregation,
  parseDecimal,
  rescuedPercentWindow,
  sumWindow,
} from '../../amplify/functions/shared/finance-historic'
import { YlIcon, YlSortIcon } from '../design/icons'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { DismissibleNotice } from '../operations/DismissibleNotice'
import { fetchJson } from '../operations/api'
import { HistoricCharts } from './HistoricCharts'
import {
  loadGlobalReportSettings,
  metricsFromPropertyReportPayload,
} from './property-report-live-metrics'
import { CALENDAR_METRIC_IDS } from '../../amplify/functions/shared/calendar-occupancy'
import {
  reviewPresentation,
  type MetricReviewEntry,
} from '../../amplify/functions/shared/historic-metric-review'
import { PROPERTY_REPORT_FIELD_CATALOG } from './property-report-metrics'
import './historic-finance.css'

type HistoricProperty = {
  id: string
  nickname: string
  title: string
  listingNickname: string
  active: boolean
}

type MonthRow = {
  period: string
  dataOrigin: string | null
  metrics: Record<string, string | null>
  metricReview?: Record<string, MetricReviewEntry>
  hasReviewIssues?: boolean
  qualityFlags: string[]
  reviewsLive: boolean
  rescuedUnderFiveStarReviewCount: number | null
  nativeClose: string | null
}

type Benchmark = {
  benchmarkKey: string
  label: string
  asOfDateLabel: string | null
  metrics: Record<string, string | null>
  qualityFlags: string[]
}

type HistoricEvent = {
  eventId: string
  date: string
  title: string
  note: string | null
}

type HistoricResponse = {
  months: MonthRow[]
  benchmarks: Benchmark[]
  events: HistoricEvent[]
  blockedExternalPeriods: string[]
}

type ReportOverlay = {
  metrics: Record<string, string | null> | null
  warning: 'open' | 'ready' | 'missing' | 'grouped' | 'error' | null
  detail?: string
}

type Filters = {
  propertyId: string
  metricIds: string[]
  from: string
  to: string
  benchmarkKey: string
}

type Props = {
  mode: 'table' | 'charts'
  getEndpoint: (key: string, fallback?: string) => string | undefined
  properties: HistoricProperty[]
}

const SERIES_COLORS = ['#3d5b58', '#c45c4e', '#415364', '#7a8a96', '#2e90fa', '#b54708']

const metricIds = [
  ...Object.values(SOURCE_FIELD_MAP),
  'checkInBookingCount',
  ...REVIEW_METRIC_IDS,
  ...PROPERTY_REPORT_FIELD_CATALOG.map((field) => field.id).filter(
    (id) =>
      !Object.values(SOURCE_FIELD_MAP).includes(
        id as (typeof SOURCE_FIELD_MAP)[keyof typeof SOURCE_FIELD_MAP],
      ) && !(REVIEW_METRIC_IDS as readonly string[]).includes(id),
  ),
]

const FILTERS_KEY = 'yalla-historic-filters'
const COLUMN_DRAG_MIME = 'application/x-yalla-historic-column'

const reorderMetricIds = (ids: string[], fromId: string, toId: string) => {
  const from = ids.indexOf(fromId)
  const to = ids.indexOf(toId)
  if (from < 0 || to < 0 || from === to) return ids
  const next = [...ids]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

const defaultFilters = (propertyId = ''): Filters => ({
  propertyId,
  metricIds: ['paidByGuest'],
  from: '2025-01',
  to: '2026-09',
  benchmarkKey: '',
})

const readFilters = (propertyId: string): Filters => {
  try {
    const raw = sessionStorage.getItem(FILTERS_KEY)
    if (!raw) return defaultFilters(propertyId)
    const parsed = JSON.parse(raw) as Partial<Filters>
    if (!parsed.propertyId || !Array.isArray(parsed.metricIds) || parsed.metricIds.length === 0) {
      return defaultFilters(propertyId)
    }
    return {
      propertyId: parsed.propertyId,
      metricIds: parsed.metricIds.filter((id) => typeof id === 'string'),
      from: typeof parsed.from === 'string' ? parsed.from : '2025-01',
      to: typeof parsed.to === 'string' ? parsed.to : '2026-09',
      benchmarkKey: typeof parsed.benchmarkKey === 'string' ? parsed.benchmarkKey : '',
    }
  } catch {
    return defaultFilters(propertyId)
  }
}

const unitOf = (metricId: string) => {
  if (metricId === 'checkInBookingCount') return 'count' as const
  if (metricId === 'cleaningPaidByGuest' || metricId === 'totalExpenses') {
    return 'money' as const
  }
  return (
    PROPERTY_REPORT_FIELD_CATALOG.find((field) => field.id === metricId)?.unit ??
    'money'
  )
}

const isReviewMetric = (metricId: string) =>
  (REVIEW_METRIC_IDS as readonly string[]).includes(metricId)

const isCalendarMetric = (metricId: string) =>
  (CALENDAR_METRIC_IDS as readonly string[]).includes(metricId)

const MonthTip = ({
  icon,
  label,
  text,
  warning = false,
}: {
  icon: 'info.circle' | 'exclamationmark.triangle'
  label: string
  text: string
  warning?: boolean
}) => (
  <span className={`historic-tip ${warning ? 'is-warning' : ''}`}>
    <button type="button" className="btn-page-info" aria-label={label}>
      <YlIcon name={icon} size={14} />
    </button>
    <span className="historic-tip-bubble" role="tooltip">
      {text}
    </span>
  </span>
)

export function HistoricFinanceView({
  mode,
  getEndpoint,
  properties,
}: Props) {
  const { t, i18n } = useTranslation()
  const [filters, setFilters] = useState<Filters>(() =>
    readFilters(properties[0]?.id ?? ''),
  )
  const [draft, setDraft] = useState<Filters>(() =>
    readFilters(properties[0]?.id ?? ''),
  )
  const [filterOpen, setFilterOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [payload, setPayload] = useState<HistoricResponse | null>(null)
  const [reportByPeriod, setReportByPeriod] = useState<Record<string, ReportOverlay>>(
    {},
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<Record<string, Record<string, string>>>(
    {},
  )
  const [savingEdits, setSavingEdits] = useState(false)
  const [editMessage, setEditMessage] = useState<string | null>(null)
  const [editTone, setEditTone] = useState<'error' | 'success'>('success')
  const [eventDate, setEventDate] = useState('2025-01-01')
  const [eventTitle, setEventTitle] = useState('')
  const [eventNote, setEventNote] = useState('')
  const [eventMessage, setEventMessage] = useState<string | null>(null)
  const [draggingMetricId, setDraggingMetricId] = useState<string | null>(null)
  const [dropMetricId, setDropMetricId] = useState<string | null>(null)
  const [monthOrder, setMonthOrder] = useState<'asc' | 'desc'>('desc')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [openReviewKey, setOpenReviewKey] = useState<string | null>(null)

  useEffect(() => {
    if (filters.propertyId) {
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify(filters))
    }
  }, [filters])

  useEffect(() => {
    if (!filters.propertyId && properties[0]) {
      const next = defaultFilters(properties[0].id)
      setFilters(next)
      setDraft(next)
    }
  }, [filters.propertyId, properties])

  const load = useCallback(async () => {
    const endpoint =
      getEndpoint('getFinanceHistoricUrl') || getEndpoint('getPropertyReportUrl')
    if (!endpoint) {
      setError(t('historicFinance.missingEndpoint'))
      return
    }
    if (!filters.propertyId) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        propertyId: filters.propertyId,
        from: filters.from,
        to: filters.to,
        historic: '1',
      })
      const next = await fetchJson<HistoricResponse>(
        `${endpoint}?${params.toString()}`,
      )
      const reportUrl = getEndpoint('getPropertyReportUrl') || endpoint
      const nativeMonths = next.months.filter(
        (month) => month.period >= NATIVE_PERIOD_START,
      )
      const overlays: Record<string, ReportOverlay> = {}
      if (reportUrl && nativeMonths.length > 0) {
        const globalSettings = await loadGlobalReportSettings(reportUrl, fetchJson)
        const pages = []
        for (let index = 0; index < nativeMonths.length; index += 2) {
          pages.push(nativeMonths.slice(index, index + 2))
        }
        for (const page of pages) {
          await Promise.all(
            page.map(async (month) => {
              try {
                const report = await fetchJson<Record<string, unknown>>(
                  `${reportUrl}?propertyId=${encodeURIComponent(filters.propertyId)}&month=${encodeURIComponent(month.period)}`,
                )
                const computed = metricsFromPropertyReportPayload(
                  report,
                  month.period,
                  globalSettings,
                )
                const metrics: Record<string, string | null> = {}
                for (const [key, value] of Object.entries(computed.values)) {
                  if (typeof value === 'number' && Number.isFinite(value)) {
                    metrics[key] = amountToDecimalString(value)
                  }
                }
                overlays[month.period] = {
                  metrics,
                  warning: computed.closed
                    ? null
                    : computed.status === 'READY_TO_CLOSE'
                      ? 'ready'
                      : 'open',
                }
              } catch (reportError) {
                const message =
                  reportError instanceof Error ? reportError.message : ''
                const grouped = message.match(/reported together under (.+?)\.?$/i)
                overlays[month.period] = {
                  metrics: null,
                  warning: grouped
                    ? 'grouped'
                    : /not available/i.test(message)
                      ? 'missing'
                      : 'error',
                  detail: grouped?.[1],
                }
              }
            }),
          )
        }
      }
      setReportByPeriod(overlays)
      setPayload(next)
      setFilters((current) =>
        next.benchmarks.some((item) => item.benchmarkKey === current.benchmarkKey)
          ? current
          : {
              ...current,
              benchmarkKey: next.benchmarks[0]?.benchmarkKey ?? '',
            },
      )
    } catch (loadError) {
      setPayload(null)
      setReportByPeriod({})
      setError(
        loadError instanceof Error
          ? loadError.message
          : t('historicFinance.loadError'),
      )
    } finally {
      setLoading(false)
    }
  }, [filters.from, filters.propertyId, filters.to, getEndpoint, t])

  useEffect(() => {
    void load()
  }, [load])

  const selectedMetrics = filters.metricIds.length > 0 ? filters.metricIds : ['paidByGuest']
  const tableMonths = useMemo(() => {
    const months = [...(payload?.months ?? [])]
      .filter((month) => !reviewOnly || month.hasReviewIssues)
      .sort((left, right) => left.period.localeCompare(right.period))
    return monthOrder === 'asc' ? months : months.reverse()
  }, [monthOrder, payload?.months, reviewOnly])
  const canReorderColumns = selectedMetrics.length > 1

  const moveMetricColumn = (fromId: string, toId: string) => {
    setFilters((current) => {
      const ids = current.metricIds.length > 0 ? current.metricIds : ['paidByGuest']
      const metricIds = reorderMetricIds(ids, fromId, toId)
      if (metricIds === ids) return current
      return { ...current, metricIds }
    })
  }
  const benchmark = payload?.benchmarks.find(
    (item) => item.benchmarkKey === filters.benchmarkKey,
  )

  const metricLabel = useCallback(
    (id: string) =>
      t(`historicFinance.metrics.${id}`, {
        defaultValue: t(`propertyReports.formulaVars.${id}`, { defaultValue: id }),
      }),
    [t],
  )

  const metricHelp = useCallback(
    (id: string) =>
      t(`historicFinance.metricHelp.${id}`, {
        defaultValue: '',
      }),
    [t],
  )

  const formatMetric = useCallback(
    (metricId: string, value: number | null) => {
      if (value == null) return '—'
      const locale = i18n.language.startsWith('es') ? 'es-ES' : 'en-GB'
      const unit = unitOf(metricId)
      if (unit === 'percent') {
        return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)} %`
      }
      if (unit === 'count') {
        return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
          value,
        )
      }
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EUR',
      }).format(value)
    },
    [i18n.language],
  )

  const metricsFor = useCallback(
    (month: MonthRow) => {
      const overlay = reportByPeriod[month.period]
      if (!overlay?.metrics) return month.metrics
      return { ...month.metrics, ...overlay.metrics }
    },
    [reportByPeriod],
  )

  const warningFor = (month: MonthRow) => {
    if (month.period < NATIVE_PERIOD_START) return null
    return reportByPeriod[month.period]?.warning ?? null
  }

  const warningText = (overlay: ReportOverlay | undefined) => {
    const code = overlay?.warning
    if (code === 'ready') return t('historicFinance.reportReady')
    if (code === 'missing') return t('historicFinance.reportMissing')
    if (code === 'grouped') {
      return t('historicFinance.reportGrouped', { name: overlay?.detail ?? '' })
    }
    if (code === 'error') return t('historicFinance.reportError')
    if (code === 'open') return t('historicFinance.reportOpen')
    return ''
  }

  const points = useMemo(() => {
    const rows = payload?.months ?? []
    return rows.map((month) => {
      const metrics = metricsFor(month)
      const row: Record<string, string | number | null> = { period: month.period }
      for (const metricId of selectedMetrics) {
        row[metricId] = parseDecimal(metrics[metricId])
        row[`ref:${metricId}`] = parseDecimal(benchmark?.metrics[metricId])
        const review = month.metricReview?.[metricId]
        row[`review:${metricId}`] =
          review?.needsReview === true ? JSON.stringify(review.reasons) : null
      }
      return row
    })
  }, [benchmark?.metrics, metricsFor, payload?.months, selectedMetrics])

  const chartSeries = selectedMetrics.map((metricId, index) => ({
    id: metricId,
    label: metricLabel(metricId),
    unit: unitOf(metricId),
    color: SERIES_COLORS[index % SERIES_COLORS.length],
    reference: parseDecimal(benchmark?.metrics[metricId]),
  }))

  const reviewCoverage = (metricId: string) => {
    const months = payload?.months ?? []
    const pending = months.filter(
      (month) => month.metricReview?.[metricId]?.needsReview === true,
    ).length
    if (pending === 0) return ''
    return t('historicFinance.reviewCoverage', {
      pending,
      total: months.length,
    })
  }

  const annuals = selectedMetrics.map((metricId) => {
    const annual = annualSeries(
      (payload?.months ?? []).map((month) => ({
        period: month.period,
        value: parseDecimal(metricsFor(month)[metricId]),
      })),
    )
    return {
      id: metricId,
      title: `${t('historicFinance.annualTitle')} · ${metricLabel(metricId)}`,
      rows: annual.rows,
      years: annual.years,
      formatValue: (value: number | null) => formatMetric(metricId, value),
      reviewNote: reviewCoverage(metricId),
    }
  })

  const activeFilterCount = useMemo(() => {
    const defaults = defaultFilters(properties[0]?.id ?? '')
    const metricsChanged =
      selectedMetrics.length !== 1 || selectedMetrics[0] !== 'paidByGuest'
    return (
      (filters.propertyId && filters.propertyId !== defaults.propertyId ? 1 : 0) +
      (metricsChanged ? 1 : 0) +
      (filters.from !== defaults.from ? 1 : 0) +
      (filters.to !== defaults.to ? 1 : 0)
    )
  }, [filters.from, filters.propertyId, filters.to, properties, selectedMetrics])

  const dirtyCount = Object.values(editDraft).reduce(
    (sum, fields) => sum + Object.keys(fields).length,
    0,
  )

  const saveEvent = async () => {
    const endpoint =
      getEndpoint('upsertFinanceHistoricEventUrl') ||
      getEndpoint('upsertPropertyReportUrl')
    if (!endpoint) {
      setEventMessage(t('historicFinance.missingEndpoint'))
      return
    }
    try {
      await fetchJson(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          propertyId: filters.propertyId,
          action: 'historic-event',
          eventAction: 'create',
          date: eventDate,
          title: eventTitle,
          note: eventNote,
        }),
      })
      setEventTitle('')
      setEventNote('')
      setEventMessage(t('historicFinance.eventSaved'))
      await load()
    } catch (saveError) {
      setEventMessage(
        saveError instanceof Error
          ? saveError.message
          : t('historicFinance.eventError'),
      )
    }
  }

  const deleteEvent = async (event: HistoricEvent) => {
    const endpoint =
      getEndpoint('upsertFinanceHistoricEventUrl') ||
      getEndpoint('upsertPropertyReportUrl')
    if (!endpoint) return
    await fetchJson(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        propertyId: filters.propertyId,
        action: 'historic-event',
        eventAction: 'delete',
        eventId: event.eventId,
        date: event.date,
        title: event.title,
      }),
    })
    await load()
  }

  const saveEdits = async () => {
    const endpoint =
      getEndpoint('upsertFinanceHistoricEventUrl') ||
      getEndpoint('upsertPropertyReportUrl')
    if (!endpoint) {
      setEditMessage(t('historicFinance.missingEndpoint'))
      return
    }
    setSavingEdits(true)
    setEditMessage(null)
    try {
      for (const [period, fields] of Object.entries(editDraft)) {
        if (Object.keys(fields).length === 0) continue
        await fetchJson(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'historic-values',
            propertyId: filters.propertyId,
            period,
            metrics: fields,
          }),
        })
      }
      setEditing(false)
      setEditDraft({})
      setEditTone('success')
      setEditMessage(t('historicFinance.editSaved'))
      await load()
    } catch (saveError) {
      setEditTone('error')
      setEditMessage(
        saveError instanceof Error
          ? saveError.message
          : t('historicFinance.editError'),
      )
    } finally {
      setSavingEdits(false)
    }
  }

  const openFilters = () => {
    setDraft({
      ...filters,
      metricIds: [...selectedMetrics],
    })
    setFilterOpen(true)
  }

  const toggleMetric = (metricId: string, checked: boolean) => {
    setDraft((current) => {
      const metricIds = checked
        ? [...current.metricIds, metricId]
        : current.metricIds.filter((id) => id !== metricId)
      return { ...current, metricIds }
    })
  }

  return (
    <section className="historic-finance">
      <header className="page-header">
        <div className="page-header-leading">
          <div className="page-title-row">
            <h1 className="page-title">
              {mode === 'table' ? 'Historic table' : 'Historic Charts'}
            </h1>
            <button
              type="button"
              className={`btn-page-info ${summaryOpen ? 'is-active' : ''}`}
              aria-label={
                summaryOpen ? t('common.hideSummaryInfo') : t('common.showSummaryInfo')
              }
              aria-expanded={summaryOpen}
              onClick={() => setSummaryOpen((current) => !current)}
            >
              <YlIcon name="info.circle" size={14} />
            </button>
          </div>
          <p className="subtitle">
            {mode === 'table'
              ? t('historicFinance.tableSubtitle')
              : t('historicFinance.chartsSubtitle')}
          </p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <div className="header-actions">
              {mode === 'table' && editing ? (
                <>
                  <button
                    className="btn-ghost"
                    type="button"
                    aria-label={t('historicFinance.cancelEdits')}
                    title={t('historicFinance.cancelEdits')}
                    onClick={() => {
                      setEditing(false)
                      setEditDraft({})
                    }}
                    disabled={savingEdits}
                  >
                    <YlIcon name="xmark" size={16} />
                  </button>
                  <button
                    className="btn-primary"
                    type="button"
                    aria-label={t('historicFinance.saveEdits')}
                    title={t('historicFinance.saveEdits')}
                    onClick={() => void saveEdits()}
                    disabled={savingEdits || dirtyCount === 0}
                  >
                    <YlIcon name="checkmark" size={16} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={`btn-ghost btn-filter ${filterOpen ? 'is-active' : ''}`}
                    type="button"
                    aria-label={t('common.filters')}
                    onClick={openFilters}
                    disabled={loading}
                  >
                    <YlIcon name="line.3.horizontal.decrease" size={16} />
                    {activeFilterCount > 0 ? (
                      <span className="filter-badge">{activeFilterCount}</span>
                    ) : null}
                  </button>
                  <button
                    className="btn-ghost"
                    type="button"
                    aria-label={t('common.refresh')}
                    title={t('common.refresh')}
                    onClick={() => void load()}
                    disabled={loading}
                  >
                    <YlIcon name="arrow.clockwise" size={16} />
                  </button>
                  {mode === 'table' ? (
                    <button
                      className={`btn-ghost historic-review-filter ${reviewOnly ? 'is-active' : ''}`}
                      type="button"
                      aria-pressed={reviewOnly}
                      onClick={() => setReviewOnly((current) => !current)}
                      disabled={loading || !payload}
                    >
                      {t('historicFinance.reviewOnly')}
                    </button>
                  ) : null}
                  {mode === 'table' ? (
                    <button
                      className="btn-primary"
                      type="button"
                      aria-label={t('historicFinance.edit')}
                      title={t('historicFinance.edit')}
                      onClick={() => {
                        setEditing(true)
                        setEditDraft({})
                        setEditMessage(null)
                      }}
                      disabled={loading || !payload}
                    >
                      <YlIcon name="pencil" size={16} />
                    </button>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {error ? (
        <DismissibleNotice dismissLabel={t('common.close')} onDismiss={() => setError(null)}>
          {error}
        </DismissibleNotice>
      ) : null}
      {editMessage ? (
        <DismissibleNotice
          variant={editTone}
          dismissLabel={t('common.close')}
          onDismiss={() => setEditMessage(null)}
        >
          {editMessage}
        </DismissibleNotice>
      ) : null}

      {summaryOpen && payload ? (
        <section className="summary-cards is-open">
          {selectedMetrics.map((metricId) => {
            const values = (payload.months ?? []).map((month) =>
              parseDecimal(metricsFor(month)[metricId]),
            )
            const window = sumWindow(values)
            const ltm = sumWindow(
              ltmPeriods(filters.to)
                .filter((period) => period >= filters.from)
                .map(
                  (period) =>
                    values[
                      (payload.months ?? []).findIndex((month) => month.period === period)
                    ] ?? null,
                ),
            )
            const rescued =
              metricId === 'rescuedUnderFiveStarReviewPercent'
                ? rescuedPercentWindow(
                    (payload.months ?? []).map(
                      (month) => month.rescuedUnderFiveStarReviewCount,
                    ),
                    (payload.months ?? []).map((month) =>
                      parseDecimal(metricsFor(month).underFiveStarReviewCount),
                    ),
                  )
                : null
            return (
              <div className="card card-compact" key={metricId}>
                <p className="card-label">{metricLabel(metricId)}</p>
                <p className="card-value">
                  {rescued
                    ? formatMetric(metricId, rescued.percent)
                    : metricAggregation(metricId) === 'sum'
                      ? formatMetric(metricId, window.total)
                      : formatMetric(metricId, window.average)}
                </p>
                <p className="card-meta">
                  {t('historicFinance.monthsAvailable', {
                    available: window.monthsAvailable,
                    total: window.monthsInWindow,
                  })}
                  . {t('historicFinance.ltm')}: {ltm.monthsAvailable}/{ltm.monthsInWindow}
                </p>
                {reviewCoverage(metricId) ? (
                  <p className="historic-review-coverage">{reviewCoverage(metricId)}</p>
                ) : null}
              </div>
            )
          })}
        </section>
      ) : null}

      {filterOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-scrollable">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('common.filters')}</h3>
                <p className="modal-subtitle">{t('historicFinance.filterSubtitle')}</p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setFilterOpen(false)}
                aria-label={t('common.closeFilters')}
              >
                <YlIcon name="xmark" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="filter-grid">
                <div className="filter-group">
                  <p className="filter-title">{t('historicFinance.property')}</p>
                  <label className="form-field">
                    <span>{t('historicFinance.property')}</span>
                    <select
                      className="select-input"
                      value={draft.propertyId}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          propertyId: event.target.value,
                        }))
                      }
                    >
                      {properties.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.nickname} (
                          {property.active
                            ? t('historicFinance.active')
                            : t('historicFinance.inactive')}
                          )
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="filter-group">
                  <p className="filter-title">{t('historicFinance.metricsLabel')}</p>
                  <div className="filter-options historic-metric-options">
                    {metricIds.map((id) => (
                      <label className="filter-option" key={id}>
                        <input
                          type="checkbox"
                          checked={draft.metricIds.includes(id)}
                          onChange={(event) => toggleMetric(id, event.target.checked)}
                        />
                        <span title={metricHelp(id) || undefined}>{metricLabel(id)}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="filter-group">
                  <p className="filter-title">{t('historicFinance.from')}</p>
                  <div className="filter-options">
                    <label className="form-field">
                      <span>{t('historicFinance.from')}</span>
                      <input
                        type="month"
                        value={draft.from}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            from: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="form-field">
                      <span>{t('historicFinance.to')}</span>
                      <input
                        type="month"
                        value={draft.to}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            to: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
                {payload && payload.benchmarks.length > 0 ? (
                  <div className="filter-group">
                    <p className="filter-title">{t('historicFinance.benchmark')}</p>
                    <label className="form-field">
                      <span>{t('historicFinance.benchmark')}</span>
                      <select
                        className="select-input"
                        value={draft.benchmarkKey}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            benchmarkKey: event.target.value,
                          }))
                        }
                      >
                        {payload.benchmarks.map((item) => (
                          <option key={item.benchmarkKey} value={item.benchmarkKey}>
                            {item.label}
                            {item.asOfDateLabel ? ` (${item.asOfDateLabel})` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={() =>
                  setDraft(defaultFilters(properties[0]?.id ?? filters.propertyId))
                }
              >
                {t('common.clear')}
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={draft.metricIds.length === 0 || draft.from > draft.to}
                onClick={() => {
                  setFilters({
                    ...draft,
                    metricIds: [...draft.metricIds],
                  })
                  setEditing(false)
                  setEditDraft({})
                  setFilterOpen(false)
                }}
              >
                {t('common.applyFilters')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {payload?.blockedExternalPeriods.length ? (
        <p className="historic-note">
          {t('historicFinance.blockedExternal', {
            periods: payload.blockedExternalPeriods.join(', '),
          })}
        </p>
      ) : null}
      {editing ? <p className="historic-note">{t('historicFinance.editHint')}</p> : null}
      {selectedMetrics.some(isCalendarMetric) ? (
        <p className="historic-note">{t('historicFinance.calendarNote')}</p>
      ) : null}

      {mode === 'charts' && payload ? (
        <HistoricCharts
          points={points}
          reviewLabel={t('historicFinance.reviewTag')}
          pendingReviewLabel={t('historicFinance.pendingReview')}
          series={chartSeries}
          annuals={annuals}
          eventMarks={(payload.events ?? [])
            .filter(
              (event) =>
                event.date.slice(0, 7) >= filters.from &&
                event.date.slice(0, 7) <= filters.to,
            )
            .map((event) => ({
              period: event.date.slice(0, 7),
              label: event.title,
            }))}
          evolutionTitle={t('historicFinance.evolutionTitle')}
          referenceLabel={t('historicFinance.reference')}
          formatValue={formatMetric}
          loading={loading}
          loadingLabel={t('historicFinance.loading')}
        />
      ) : null}

      {mode === 'table' ? (
        <div className={`historic-stage ${loading ? 'is-loading' : ''}`}>
          {loading ? (
            <div className="historic-loading" role="status">
              <div className="page-loader-spinner" />
              <p>{t('historicFinance.loading')}</p>
            </div>
          ) : null}
          <div className="historic-stage-body table-wrap">
            {!loading && payload && payload.months.length === 0 ? (
              <p className="historic-note">{t('historicFinance.empty')}</p>
            ) : null}
            {!loading && payload && payload.months.length > 0 && tableMonths.length === 0 ? (
              <p className="historic-note">{t('historicFinance.reviewEmpty')}</p>
            ) : null}
            {payload ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th
                      scope="col"
                      aria-sort={monthOrder === 'desc' ? 'descending' : 'ascending'}
                    >
                      <button
                        className="btn-sort is-active"
                        type="button"
                        aria-label={t(
                          monthOrder === 'desc'
                            ? 'historicFinance.sortMonthsNewest'
                            : 'historicFinance.sortMonthsOldest',
                        )}
                        onClick={() =>
                          setMonthOrder((current) => (current === 'desc' ? 'asc' : 'desc'))
                        }
                      >
                        {t('historicFinance.period')}
                        <span className="sort-indicator">
                          <YlSortIcon direction={monthOrder} />
                        </span>
                      </button>
                    </th>
                    {selectedMetrics.map((metricId) => {
                      const label = metricLabel(metricId)
                      const help = metricHelp(metricId)
                      const isDragging = draggingMetricId === metricId
                      const isDropTarget =
                        dropMetricId === metricId && draggingMetricId !== metricId
                      return (
                        <th
                          key={metricId}
                          className={
                            isDropTarget ? 'historic-column-head is-drop-target' : undefined
                          }
                          title={help || undefined}
                        >
                          <span
                            className={`historic-column-grip${isDragging ? ' is-dragging' : ''}`}
                            draggable={canReorderColumns}
                            role={canReorderColumns ? 'button' : undefined}
                            tabIndex={canReorderColumns ? 0 : undefined}
                            aria-grabbed={canReorderColumns ? isDragging : undefined}
                            aria-label={
                              canReorderColumns
                                ? t('historicFinance.dragColumn', { name: label })
                                : undefined
                            }
                            onDragStart={
                              canReorderColumns
                                ? (event) => {
                                    event.dataTransfer.setData(COLUMN_DRAG_MIME, metricId)
                                    event.dataTransfer.effectAllowed = 'move'
                                    setDraggingMetricId(metricId)
                                  }
                                : undefined
                            }
                            onDragEnd={
                              canReorderColumns
                                ? () => {
                                    setDraggingMetricId(null)
                                    setDropMetricId(null)
                                  }
                                : undefined
                            }
                            onDragOver={
                              canReorderColumns
                                ? (event) => {
                                    event.preventDefault()
                                    event.dataTransfer.dropEffect = 'move'
                                    if (dropMetricId !== metricId) setDropMetricId(metricId)
                                  }
                                : undefined
                            }
                            onDragLeave={
                              canReorderColumns
                                ? () => {
                                    setDropMetricId((current) =>
                                      current === metricId ? null : current,
                                    )
                                  }
                                : undefined
                            }
                            onDrop={
                              canReorderColumns
                                ? (event) => {
                                    event.preventDefault()
                                    const fromId =
                                      event.dataTransfer.getData(COLUMN_DRAG_MIME) ||
                                      draggingMetricId
                                    setDropMetricId(null)
                                    setDraggingMetricId(null)
                                    if (fromId) moveMetricColumn(fromId, metricId)
                                  }
                                : undefined
                            }
                            onKeyDown={
                              canReorderColumns
                                ? (event) => {
                                    const index = selectedMetrics.indexOf(metricId)
                                    const targetId =
                                      event.key === 'ArrowLeft'
                                        ? selectedMetrics[index - 1]
                                        : event.key === 'ArrowRight'
                                          ? selectedMetrics[index + 1]
                                          : ''
                                    if (!targetId) return
                                    event.preventDefault()
                                    moveMetricColumn(metricId, targetId)
                                  }
                                : undefined
                            }
                          >
                            {label}
                          </span>
                        </th>
                      )
                    })}
                    <th>{t('historicFinance.eventsTitle')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tableMonths.map((month) => {
                    const metrics = metricsFor(month)
                    const warning = warningFor(month)
                    const warningOverlay = reportByPeriod[month.period]
                    const flags = month.qualityFlags
                    const editable =
                      editing && month.dataOrigin === 'legacy_excel'
                    const events = (payload.events ?? []).filter(
                      (event) => event.date.slice(0, 7) === month.period,
                    )
                    return (
                      <tr key={month.period}>
                        <td>
                          <span className="historic-month-label">
                            {month.period}
                            {warning ? (
                              <MonthTip
                                icon="exclamationmark.triangle"
                                warning
                                label={t('historicFinance.reportWarning')}
                                text={warningText(warningOverlay)}
                              />
                            ) : null}
                            {month.hasReviewIssues ? (
                              <MonthTip
                                icon="exclamationmark.triangle"
                                warning
                                label={t('historicFinance.reviewRow')}
                                text={t('historicFinance.reviewRow')}
                              />
                            ) : null}
                            {flags.length > 0 ? (
                              <MonthTip
                                icon="info.circle"
                                label={t('historicFinance.qualityInfo')}
                                text={flags
                                  .map((flag) =>
                                    t(`historicFinance.quality.${flag}`, {
                                      defaultValue: flag,
                                    }),
                                  )
                                  .join('\n')}
                              />
                            ) : null}
                          </span>
                        </td>
                        {selectedMetrics.map((metricId) => {
                          const stored = metrics[metricId] ?? ''
                          const draftValue = editDraft[month.period]?.[metricId]
                          if (editable && !isReviewMetric(metricId)) {
                            return (
                              <td key={metricId}>
                                <input
                                  className="historic-edit-input"
                                  inputMode="decimal"
                                  aria-label={`${month.period} ${metricLabel(metricId)}`}
                                  value={draftValue ?? stored}
                                  onChange={(event) => {
                                    const value = event.target.value
                                    setEditDraft((current) => {
                                      const fields = { ...(current[month.period] ?? {}) }
                                      if (value === stored) {
                                        delete fields[metricId]
                                      } else {
                                        fields[metricId] = value
                                      }
                                      const next = { ...current }
                                      if (Object.keys(fields).length === 0) {
                                        delete next[month.period]
                                      } else {
                                        next[month.period] = fields
                                      }
                                      return next
                                    })
                                  }}
                                />
                              </td>
                            )
                          }
                          const numeric = parseDecimal(stored || null)
                          const help = metricHelp(metricId)
                          const review = month.metricReview?.[metricId]
                          const presentation = reviewPresentation(stored || null, review)
                          const title =
                            help && numeric == null && isCalendarMetric(metricId) && !presentation.pending
                              ? `${help} ${t('historicFinance.insufficient')}`
                              : help || undefined
                          const reviewKey = `${month.period}:${metricId}`
                          const reasons = review?.reasons ?? []
                          return (
                            <td key={metricId} title={presentation.marked ? undefined : title}>
                              {presentation.marked ? (
                                <span className="historic-review-value">
                                  <span className="historic-review-figure">
                                    {presentation.pending
                                      ? t('historicFinance.pendingReview')
                                      : formatMetric(metricId, numeric)}
                                  </span>
                                  <span
                                    className={`historic-tip is-review ${openReviewKey === reviewKey ? 'is-open' : ''}`}
                                  >
                                    <button
                                      type="button"
                                      className="historic-review-tag"
                                      aria-expanded={openReviewKey === reviewKey}
                                      aria-label={t('historicFinance.reviewTag')}
                                      onClick={() =>
                                        setOpenReviewKey((current) =>
                                          current === reviewKey ? null : reviewKey,
                                        )
                                      }
                                    >
                                      {t('historicFinance.reviewTag')}
                                    </button>
                                    <span className="historic-tip-bubble" role="tooltip">
                                      {reasons.map((reason) => (
                                        <span className="historic-review-reason" key={reason.code}>
                                          {reason.message}
                                          {reason.suggestedAction ? (
                                            <>
                                              {' '}
                                              {reason.suggestedAction}
                                            </>
                                          ) : null}
                                        </span>
                                      ))}
                                    </span>
                                  </span>
                                </span>
                              ) : (
                                formatMetric(metricId, numeric)
                              )}
                            </td>
                          )
                        })}
                        <td>
                          {events.map((event) => (
                            <div key={event.eventId}>
                              {event.date.slice(8)} {event.title}
                              {event.note ? `: ${event.note}` : ''}
                            </div>
                          ))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : null}
          </div>
        </div>
      ) : null}

      {mode === 'charts' ? (
        <section className="card historic-events">
          <h2 className="page-title">{t('historicFinance.eventsTitle')}</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void saveEvent()
            }}
          >
            <label>
              {t('historicFinance.eventDate')}
              <input
                type="date"
                value={eventDate}
                onChange={(event) => setEventDate(event.target.value)}
              />
            </label>
            <label>
              {t('historicFinance.eventTitle')}
              <input
                value={eventTitle}
                onChange={(event) => setEventTitle(event.target.value)}
                required
              />
            </label>
            <label>
              {t('historicFinance.eventNote')}
              <input
                value={eventNote}
                onChange={(event) => setEventNote(event.target.value)}
              />
            </label>
            <button className="btn-primary" type="submit">
              {t('historicFinance.eventSave')}
            </button>
          </form>
          {eventMessage ? <p className="historic-note">{eventMessage}</p> : null}
          <div className="historic-event-list">
            {(payload?.events ?? []).map((event) => (
              <article key={event.eventId}>
                <div>
                  <strong>
                    {event.date} {event.title}
                  </strong>
                  {event.note ? <div className="historic-note">{event.note}</div> : null}
                </div>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => void deleteEvent(event)}
                >
                  {t('historicFinance.eventDelete')}
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  )
}
