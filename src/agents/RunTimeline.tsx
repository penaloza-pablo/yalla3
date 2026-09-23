import type { AgentRun, CoverageItem } from './types'
import { formatToolOutput } from './format'

const CoverageList = ({
  title,
  items,
  empty,
}: {
  title: string
  items: CoverageItem[]
  empty: string
}) => (
  <div className="agents-coverage-col">
    <h3 className="agents-coverage-title">{title}</h3>
    {items.length === 0 ? (
      <p className="card-subtitle">{empty}</p>
    ) : (
      <ul className="agents-coverage-list">
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.label}</strong>
            {item.detail ? <span> · {item.detail}</span> : null}
            {item.reason ? <div className="card-subtitle">{item.reason}</div> : null}
            {item.source ? <div className="card-subtitle">{item.source}</div> : null}
          </li>
        ))}
      </ul>
    )}
  </div>
)

type RunTimelineProps = {
  run: AgentRun
  labels: {
    status: (status: string) => string
    finding: (severity: string) => string
    outputTokens: string
    reviewed: string
    unchecked: string
    reviewedEmpty: string
    uncheckedEmpty: string
    trace: string
  }
}

export function RunTimeline({ run, labels }: RunTimelineProps) {
  const steps = (run.steps && run.steps.length > 0
    ? run.steps
    : (run.events ?? []).map((event) => ({
        at: event.at,
        type: event.type,
        name: event.name,
        input: event.inputSummary,
        output: event.outputSummary,
        error: event.error,
        latencyMs: undefined as number | undefined,
      }))
  )

  return (
    <div className="agents-timeline">
      {run.error ? <p className="notice error">{run.error}</p> : null}
      {run.result ? <pre className="agents-pre">{run.result}</pre> : null}
      {run.findings && run.findings.length > 0 ? (
        <ul className="agents-coverage-list">
          {run.findings.map((finding) => (
            <li key={`${finding.title}-${finding.detail}`}>
              <strong>
                {labels.finding(finding.severity)} · {finding.title}
              </strong>
              <div className="card-subtitle">{finding.detail}</div>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="agents-coverage-grid">
        <CoverageList
          title={labels.reviewed}
          items={run.coverage?.reviewed ?? []}
          empty={labels.reviewedEmpty}
        />
        <CoverageList
          title={labels.unchecked}
          items={run.coverage?.unchecked ?? []}
          empty={labels.uncheckedEmpty}
        />
      </div>
      {steps.length > 0 ? (
        <>
          <h3 className="agents-coverage-title">{labels.trace}</h3>
          <ol className="agents-steps">
            {steps.map((step, index) => (
              <li key={`${step.at}-${step.name}-${index}`}>
                <div className="agents-step-head">
                  <code>{step.type}</code>
                  <span>{step.name}</span>
                  {step.latencyMs != null ? (
                    <span className="card-subtitle">{step.latencyMs} ms</span>
                  ) : null}
                </div>
                {step.input !== undefined ? (
                  <pre className="agents-json">{formatToolOutput(step.input)}</pre>
                ) : null}
                {step.output !== undefined ? (
                  <pre className="agents-json">{formatToolOutput(step.output)}</pre>
                ) : null}
                {step.error ? (
                  <p className="notice error">{step.error}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </div>
  )
}
