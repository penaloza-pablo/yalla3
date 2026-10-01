import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type Unit = 'money' | 'count' | 'percent'

export type HistoricChartSeries = {
  id: string
  label: string
  unit: Unit
  color: string
  reference: number | null
}

type AnnualRow = Record<string, string | number | null>

export type HistoricAnnualChart = {
  id: string
  title: string
  rows: AnnualRow[]
  years: string[]
  formatValue: (value: number | null) => string
  reviewNote?: string
}

type Point = Record<string, string | number | null>

type Props = {
  points: Point[]
  series: HistoricChartSeries[]
  annuals: HistoricAnnualChart[]
  eventMarks: { period: string; label: string }[]
  evolutionTitle: string
  referenceLabel: string
  formatValue: (metricId: string, value: number | null) => string
  reviewLabel: string
  pendingReviewLabel: string
  loading: boolean
  loadingLabel: string
}

type ChartReason = { message?: string; suggestedAction?: string }

const reasonsOf = (point: Record<string, unknown> | undefined, metricId: string) => {
  const raw = point?.[`review:${metricId}`]
  if (typeof raw !== 'string' || !raw) return []
  try {
    const parsed = JSON.parse(raw) as ChartReason[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const YEAR_COLORS = ['#3d5b58', '#c45c4e', '#a1b1c8', '#415364']

const axisIdFor = (unit: Unit, units: Unit[]) => {
  if (units.length <= 1) return 'left'
  return unit === units[0] ? 'left' : 'right'
}

const TrendChart = ({
  points,
  series,
  eventMarks,
  title,
  referenceLabel,
  formatValue,
  reviewLabel,
  pendingReviewLabel,
}: {
  points: Point[]
  series: HistoricChartSeries[]
  eventMarks: { period: string; label: string }[]
  title: string
  referenceLabel: string
  formatValue: (metricId: string, value: number | null) => string
  reviewLabel: string
  pendingReviewLabel: string
}) => {
  const units = [...new Set(series.map((item) => item.unit))]
  return (
    <section className="card">
      <h2 className="page-title">{title}</h2>
      <div className="historic-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <CartesianGrid stroke="#e4e7ec" />
            <XAxis dataKey="period" />
            <YAxis yAxisId="left" />
            {units.length > 1 ? <YAxis yAxisId="right" orientation="right" /> : null}
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const point = payload[0]?.payload as Record<string, unknown> | undefined
                return (
                  <div className="historic-chart-tip">
                    <p className="historic-chart-tip-period">{label}</p>
                    {series.map((item) => {
                      const value = point?.[item.id]
                      const numeric = typeof value === 'number' ? value : null
                      const reasons = reasonsOf(point, item.id)
                      const reviewed = reasons.length > 0
                      return (
                        <div key={item.id}>
                          <p className={reviewed ? 'is-review' : undefined}>
                            {item.label}:{' '}
                            {numeric == null && reviewed
                              ? pendingReviewLabel
                              : formatValue(item.id, numeric)}
                            {reviewed ? ` · ${reviewLabel}` : ''}
                          </p>
                          {reasons.map((reason) => (
                            <p key={`${item.id}-${reason.message}`} className="is-review">
                              {reason.message}
                              {reason.suggestedAction ? ` ${reason.suggestedAction}` : ''}
                            </p>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )
              }}
            />
            <Legend />
            {series.map((item) => (
              <Line
                key={item.id}
                type="monotone"
                yAxisId={axisIdFor(item.unit, units)}
                dataKey={item.id}
                name={item.label}
                stroke={item.color}
                connectNulls={false}
                dot={(dotProps) => {
                  const { cx, cy, payload, value } = dotProps
                  if (cx == null || cy == null || typeof value !== 'number') return <g />
                  const reviewed = reasonsOf(
                    payload as Record<string, unknown>,
                    item.id,
                  ).length > 0
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={reviewed ? 5 : 3}
                      fill={reviewed ? '#b42318' : item.color}
                      stroke={reviewed ? '#b42318' : item.color}
                    >
                      {reviewed ? <title>{reviewLabel}</title> : null}
                    </circle>
                  )
                }}
              />
            ))}
            {series
              .filter((item) => item.reference != null)
              .map((item) => (
                <Line
                  key={`ref:${item.id}`}
                  type="monotone"
                  yAxisId={axisIdFor(item.unit, units)}
                  dataKey={`ref:${item.id}`}
                  name={`${item.label} · ${referenceLabel}`}
                  stroke={item.color}
                  strokeDasharray="4 4"
                  connectNulls={false}
                  dot={false}
                />
              ))}
            {eventMarks.map((mark) => (
              <ReferenceLine
                key={`${mark.period}-${mark.label}`}
                x={mark.period}
                yAxisId="left"
                stroke="#7a8a96"
                label={mark.label}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

export function HistoricCharts({
  points,
  series,
  annuals,
  eventMarks,
  evolutionTitle,
  referenceLabel,
  formatValue,
  reviewLabel,
  pendingReviewLabel,
  loading,
  loadingLabel,
}: Props) {
  const units = [...new Set(series.map((item) => item.unit))]
  const groups =
    units.length <= 2
      ? [series]
      : units.map((unit) => series.filter((item) => item.unit === unit))

  return (
    <div className={`historic-stage ${loading ? 'is-loading' : ''}`}>
      {loading ? (
        <div className="historic-loading" role="status">
          <div className="page-loader-spinner" />
          <p>{loadingLabel}</p>
        </div>
      ) : null}
      <div className="historic-stage-body">
        {groups.map((group) => (
          <TrendChart
            key={group.map((item) => item.id).join('-')}
            points={points}
            series={group}
            eventMarks={eventMarks}
            title={
              groups.length === 1
                ? evolutionTitle
                : `${evolutionTitle} · ${group.map((item) => item.label).join(', ')}`
            }
            referenceLabel={referenceLabel}
            formatValue={formatValue}
            reviewLabel={reviewLabel}
            pendingReviewLabel={pendingReviewLabel}
          />
        ))}
        {annuals.map((annual) => (
          <section className="card" key={annual.id}>
            <h2 className="page-title">{annual.title}</h2>
            {annual.reviewNote ? (
              <p className="historic-review-coverage">{annual.reviewNote}</p>
            ) : null}
            <div className="historic-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={annual.rows}>
                  <CartesianGrid stroke="#e4e7ec" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip
                    formatter={(value) =>
                      annual.formatValue(typeof value === 'number' ? value : null)
                    }
                  />
                  <Legend />
                  {annual.years.map((year, index) => (
                    <Line
                      key={year}
                      type="monotone"
                      dataKey={year}
                      name={year}
                      stroke={YEAR_COLORS[index % YEAR_COLORS.length]}
                      connectNulls={false}
                      dot
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
