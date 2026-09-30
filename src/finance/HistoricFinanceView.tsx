import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  REVIEW_METRIC_IDS,
  SOURCE_FIELD_MAP,
  annualSeries,
  compareToReference,
  ltmPeriods,
  metricAggregation,
  metricPolarity,
  parseDecimal,
  rescuedPercentWindow,
  sumWindow,
} from '../../amplify/functions/shared/finance-historic'
import { fetchJson } from '../operations/api'
import { PROPERTY_REPORT_FIELD_CATALOG } from './property-report-metrics'
import { HistoricCharts } from './HistoricCharts'
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

type Props = {
  mode: 'table' | 'charts'
  getEndpoint: (key: string, fallback?: string) => string | undefined
  properties: HistoricProperty[]
}

const metricIds = [
  ...Object.values(SOURCE_FIELD_MAP),
  ...REVIEW_METRIC_IDS,
  ...PROPERTY_REPORT_FIELD_CATALOG.map((field) => field.id).filter(
    (id) =>
      !Object.values(SOURCE_FIELD_MAP).includes(
        id as (typeof SOURCE_FIELD_MAP)[keyof typeof SOURCE_FIELD_MAP],
      ) && !(REVIEW_METRIC_IDS as readonly string[]).includes(id),
  ),
]

const unitOf = (metricId: string) => {
  if (metricId === 'cleaningPaidByGuest' || metricId === 'totalExpenses') {
    return 'money' as const
  }
  return (
    PROPERTY_REPORT_FIELD_CATALOG.find((field) => field.id === metricId)?.unit ??
    'money'
  )
}

export function HistoricFinanceView({
  mode,
  getEndpoint,
  properties,
}: Props) {
  const { t } = useTranslation()
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '')
  const [metricId, setMetricId] = useState('paidByGuest')
  const [from, setFrom] = useState('2025-01')
  const [to, setTo] = useState('2026-09')
  const [benchmarkKey, setBenchmarkKey] = useState('')
  const [payload, setPayload] = useState<HistoricResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [eventDate, setEventDate] = useState('2025-01-01')
  const [eventTitle, setEventTitle] = useState('')
  const [eventNote, setEventNote] = useState('')
  const [eventMessage, setEventMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!propertyId && properties[0]) setPropertyId(properties[0].id)
  }, [properties, propertyId])

  const load = useCallback(async () => {
    const endpoint = getEndpoint('getFinanceHistoricUrl')
    if (!endpoint || !propertyId) {
      setError(t('historicFinance.missingEndpoint'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ propertyId, from, to })
      const next = await fetchJson<HistoricResponse>(
        `${endpoint}?${params.toString()}`,
      )
      setPayload(next)
      setBenchmarkKey((current) =>
        next.benchmarks.some((item) => item.benchmarkKey === current)
          ? current
          : (next.benchmarks[0]?.benchmarkKey ?? ''),
      )
    } catch (loadError) {
      setPayload(null)
      setError(
        loadError instanceof Error
          ? loadError.message
          : t('historicFinance.loadError'),
      )
    } finally {
      setLoading(false)
    }
  }, [from, getEndpoint, propertyId, t, to])

  useEffect(() => {
    void load()
  }, [load])

  const benchmark = payload?.benchmarks.find(
    (item) => item.benchmarkKey === benchmarkKey,
  )
  const referenceValue = parseDecimal(benchmark?.metrics[metricId])
  const unit = unitOf(metricId)
  const polarity = metricPolarity(metricId)

  const formatValue = useCallback(
    (value: number | null) => {
      if (value == null) return '—'
      if (unit === 'percent') {
        return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(value)} %`
      }
      if (unit === 'count') {
        return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(
          value,
        )
      }
      return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
      }).format(value)
    },
    [unit],
  )

  const points = useMemo(
    () =>
      (payload?.months ?? []).map((month) => ({
        period: month.period,
        actual: parseDecimal(month.metrics[metricId]),
        reference: referenceValue,
      })),
    [metricId, payload?.months, referenceValue],
  )

  const annual = useMemo(
    () =>
      annualSeries(
        points.map((point) => ({ period: point.period, value: point.actual })),
      ),
    [points],
  )

  const window = sumWindow(points.map((point) => point.actual))
  const ltm = sumWindow(
    ltmPeriods(to)
      .filter((period) => period >= from)
      .map(
        (period) =>
          points.find((point) => point.period === period)?.actual ?? null,
      ),
  )
  const rescuedWindow = rescuedPercentWindow(
    (payload?.months ?? []).map((month) => month.rescuedUnderFiveStarReviewCount),
    (payload?.months ?? []).map((month) =>
      parseDecimal(month.metrics.underFiveStarReviewCount),
    ),
  )

  const saveEvent = async () => {
    const endpoint = getEndpoint('upsertFinanceHistoricEventUrl')
    if (!endpoint) {
      setEventMessage(t('historicFinance.missingEndpoint'))
      return
    }
    try {
      await fetchJson(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          action: 'create',
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
    const endpoint = getEndpoint('upsertFinanceHistoricEventUrl')
    if (!endpoint) return
    await fetchJson(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        propertyId,
        action: 'delete',
        eventId: event.eventId,
        date: event.date,
        title: event.title,
      }),
    })
    await load()
  }

  const metricLabel = (id: string) =>
    t(`historicFinance.metrics.${id}`, {
      defaultValue: t(`propertyReports.formulaVars.${id}`, { defaultValue: id }),
    })

  const nativeLabel = (value: string | null) => {
    if (value === 'missing') return t('historicFinance.nativeMissing')
    if (value === 'open') return t('historicFinance.nativeOpen')
    if (value === 'closed_without_snapshot') return t('historicFinance.nativePending')
    return null
  }

  return (
    <section className="historic-finance">
      <header>
        <h1 className="page-title">
          {mode === 'table' ? 'Historic table' : 'Historic Charts'}
        </h1>
        <p className="subtitle">
          {mode === 'table'
            ? t('historicFinance.tableSubtitle')
            : t('historicFinance.chartsSubtitle')}
        </p>
      </header>
      <div className="historic-finance-filters">
        <label>
          {t('historicFinance.property')}
          <select
            value={propertyId}
            onChange={(event) => setPropertyId(event.target.value)}
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
        <label>
          {t('historicFinance.metric')}
          <select
            value={metricId}
            onChange={(event) => setMetricId(event.target.value)}
          >
            {metricIds.map((id) => (
              <option key={id} value={id}>
                {metricLabel(id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('historicFinance.from')}
          <input
            type="month"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label>
          {t('historicFinance.to')}
          <input
            type="month"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        {payload && payload.benchmarks.length > 0 ? (
          <label>
            {t('historicFinance.benchmark')}
            <select
              value={benchmarkKey}
              onChange={(event) => setBenchmarkKey(event.target.value)}
            >
              {payload.benchmarks.map((item) => (
                <option key={item.benchmarkKey} value={item.benchmarkKey}>
                  {item.label}
                  {item.asOfDateLabel ? ` (${item.asOfDateLabel})` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {payload?.blockedExternalPeriods.length ? (
        <p className="historic-note">
          {t('historicFinance.blockedExternal', {
            periods: payload.blockedExternalPeriods.join(', '),
          })}
        </p>
      ) : null}
      {loading ? <p className="historic-note">{t('historicFinance.loading')}</p> : null}
      {error ? <p className="historic-note">{error}</p> : null}
      {!loading && payload && payload.months.length === 0 ? (
        <p className="historic-note">{t('historicFinance.empty')}</p>
      ) : null}
      {payload ? (
        <p className="historic-note">
          {t('historicFinance.window')}: {t('historicFinance.calendarYear')}{' '}
          {from.slice(0, 4)}–{to.slice(0, 4)}. {t('historicFinance.ltm')}:{' '}
          {t('historicFinance.monthsAvailable', {
            available: ltm.monthsAvailable,
            total: ltm.monthsInWindow,
          })}
          .{' '}
          {metricAggregation(metricId) === 'sum' ? (
            <>
              {t('historicFinance.total')} {formatValue(window.total)}. {' '}
              {t('historicFinance.average')} {formatValue(window.average)} (
              {t('historicFinance.monthsAvailable', {
                available: window.monthsAvailable,
                total: window.monthsInWindow,
              })}
              ).
            </>
          ) : metricId === 'rescuedUnderFiveStarReviewPercent' ? (
            <>
              {t('historicFinance.average')} {formatValue(rescuedWindow.percent)} (
              {t('historicFinance.monthsAvailable', {
                available: rescuedWindow.monthsAvailable,
                total: payload.months.length,
              })}
              ).
            </>
          ) : null}{' '}
          {t('historicFinance.reviewsLive')}
        </p>
      ) : null}
      {mode === 'charts' && payload ? (
        <HistoricCharts
          points={points}
          annualRows={annual.rows}
          years={annual.years}
          eventMarks={(payload.events ?? [])
            .filter((event) => event.date.slice(0, 7) >= from && event.date.slice(0, 7) <= to)
            .map((event) => ({
              period: event.date.slice(0, 7),
              label: event.title,
            }))}
          formatValue={formatValue}
          evolutionTitle={t('historicFinance.evolutionTitle')}
          annualTitle={t('historicFinance.annualTitle')}
          actualLabel={t('historicFinance.actual')}
          referenceLabel={t('historicFinance.reference')}
        />
      ) : null}
      {payload ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('historicFinance.period')}</th>
                <th>{t('historicFinance.actual')}</th>
                <th>{t('historicFinance.reference')}</th>
                <th>{t('historicFinance.deviation')}</th>
                <th>{t('historicFinance.deviationPercent')}</th>
                <th>{t('historicFinance.eventsTitle')}</th>
              </tr>
            </thead>
            <tbody>
              {payload.months.map((month) => {
                const actual = parseDecimal(month.metrics[metricId])
                const deviation = compareToReference(
                  actual,
                  referenceValue,
                  polarity,
                )
                const events = (payload.events ?? []).filter(
                  (event) => event.date.slice(0, 7) === month.period,
                )
                const note = nativeLabel(month.nativeClose)
                return (
                  <tr key={month.period}>
                    <td>
                      {month.period}
                      {month.qualityFlags.map((flag) => (
                        <div key={flag} className="historic-note">
                          {t(`historicFinance.quality.${flag}`, {
                            defaultValue: flag,
                          })}
                        </div>
                      ))}
                      {note ? <div className="historic-note">{note}</div> : null}
                    </td>
                    <td>{formatValue(actual)}</td>
                    <td>
                      {referenceValue == null
                        ? t('historicFinance.noReference')
                        : formatValue(referenceValue)}
                    </td>
                    <td
                      className={
                        deviation.favorable == null
                          ? undefined
                          : deviation.favorable
                            ? 'historic-favorable'
                            : 'historic-unfavorable'
                      }
                    >
                      {formatValue(deviation.amount)}
                      {deviation.favorable == null
                        ? ''
                        : ` (${deviation.favorable ? t('historicFinance.favorable') : t('historicFinance.unfavorable')})`}
                    </td>
                    <td>
                      {deviation.percent == null
                        ? t('historicFinance.percentUnavailable')
                        : `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(deviation.percent)} %`}
                    </td>
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
