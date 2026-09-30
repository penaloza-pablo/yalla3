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

type Point = {
  period: string
  actual: number | null
  reference: number | null
}

type AnnualRow = Record<string, string | number | null>

type Props = {
  points: Point[]
  annualRows: AnnualRow[]
  years: string[]
  eventMarks: { period: string; label: string }[]
  formatValue: (value: number | null) => string
  evolutionTitle: string
  annualTitle: string
  actualLabel: string
  referenceLabel: string
}

const COLORS = ['#3d5b58', '#c45c4e', '#a1b1c8', '#415364']

export function HistoricCharts({
  points,
  annualRows,
  years,
  eventMarks,
  formatValue,
  evolutionTitle,
  annualTitle,
  actualLabel,
  referenceLabel,
}: Props) {
  return (
    <div className="historic-finance">
      <section className="card">
        <h2 className="page-title">{evolutionTitle}</h2>
        <div className="historic-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <CartesianGrid stroke="#e4e7ec" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip
                formatter={(value) =>
                  formatValue(typeof value === 'number' ? value : null)
                }
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="actual"
                name={actualLabel}
                stroke="#3d5b58"
                connectNulls={false}
                dot
              />
              <Line
                type="monotone"
                dataKey="reference"
                name={referenceLabel}
                stroke="#c45c4e"
                strokeDasharray="4 4"
                connectNulls={false}
                dot={false}
              />
              {eventMarks.map((mark) => (
                <ReferenceLine
                  key={`${mark.period}-${mark.label}`}
                  x={mark.period}
                  stroke="#7a8a96"
                  label={mark.label}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="card">
        <h2 className="page-title">{annualTitle}</h2>
        <div className="historic-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={annualRows}>
              <CartesianGrid stroke="#e4e7ec" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip
                formatter={(value) =>
                  formatValue(typeof value === 'number' ? value : null)
                }
              />
              <Legend />
              {years.map((year, index) => (
                <Line
                  key={year}
                  type="monotone"
                  dataKey={year}
                  name={year}
                  stroke={COLORS[index % COLORS.length]}
                  connectNulls={false}
                  dot
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  )
}
