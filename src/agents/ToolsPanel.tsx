import { useEffect, useState } from 'react'
import { EmptyState, TableSkeleton } from '../design/Feedback'
import { formatToolOutput, formatWhen } from './format'
import type { AgentToolInfo } from './types'

type ToolRunState = {
  isRunning: boolean
  output?: unknown
  error?: string
  runId?: string
}

type ToolVersion = {
  version: number
  description?: string
  createdAt?: string
  riskLevel?: string
}

type ToolsPanelProps = {
  tools: AgentToolInfo[]
  isLoading: boolean
  locale: string
  versionsByTool?: Record<string, ToolVersion[]>
  labels: {
    title: string
    output: string
    run: string
    running: string
    empty: string
    outputTitle: string
    version: string
    risk: string
    history: string
  }
  onRun: (
    toolName: string,
  ) => Promise<{ output?: unknown; error?: string; runId?: string }>
  onLoadVersions?: (toolName: string) => Promise<ToolVersion[]>
}

export function ToolsPanel({
  tools,
  isLoading,
  locale,
  versionsByTool,
  labels,
  onRun,
  onLoadVersions,
}: ToolsPanelProps) {
  const [runs, setRuns] = useState<Record<string, ToolRunState>>({})
  const [versions, setVersions] = useState<Record<string, ToolVersion[]>>(
    versionsByTool ?? {},
  )

  useEffect(() => {
    if (versionsByTool) {
      setVersions(versionsByTool)
    }
  }, [versionsByTool])

  const runTool = async (toolName: string) => {
    setRuns((current) => ({
      ...current,
      [toolName]: { isRunning: true, output: undefined, error: undefined },
    }))
    const result = await onRun(toolName)
    setRuns((current) => ({
      ...current,
      [toolName]: {
        isRunning: false,
        output: result.output,
        error: result.error,
        runId: result.runId,
      },
    }))
  }

  const loadHistory = async (toolName: string) => {
    if (!onLoadVersions || versions[toolName]) {
      return
    }
    const items = await onLoadVersions(toolName)
    setVersions((current) => ({ ...current, [toolName]: items }))
  }

  if (isLoading && tools.length === 0) {
    return <TableSkeleton rows={3} label={labels.title} />
  }

  if (tools.length === 0) {
    return <EmptyState message={labels.empty} />
  }

  return (
    <div className="agents-tools-list">
      {tools.map((tool) => {
        const run = runs[tool.name]
        const history = versions[tool.name] ?? []
        return (
          <section className="card" key={tool.name}>
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  <code>{tool.name}</code>
                </h2>
                <p className="card-subtitle">{tool.description}</p>
              </div>
              <button
                className="btn-primary"
                type="button"
                onClick={() => void runTool(tool.name)}
                disabled={run?.isRunning}
              >
                {run?.isRunning ? labels.running : labels.run}
              </button>
            </div>
            <dl className="agents-meta">
              <div>
                <dt>{labels.output}</dt>
                <dd>{tool.outputDescription}</dd>
              </div>
              <div>
                <dt>{labels.version}</dt>
                <dd>v{tool.version ?? tool.catalogVersion ?? 1}</dd>
              </div>
              <div>
                <dt>{labels.risk}</dt>
                <dd>{tool.riskLevel ?? 'read'}</dd>
              </div>
            </dl>
            {onLoadVersions ? (
              <button
                className="btn-secondary"
                type="button"
                onClick={() => void loadHistory(tool.name)}
              >
                {labels.history}
              </button>
            ) : null}
            {history.length > 0 ? (
              <ul className="agents-coverage-list">
                {history.map((entry) => (
                  <li key={`${tool.name}-v${entry.version}`}>
                    <strong>v{entry.version}</strong>
                    {entry.createdAt
                      ? ` · ${formatWhen(entry.createdAt, locale)}`
                      : ''}
                    {entry.description ? (
                      <div className="card-subtitle">{entry.description}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {run?.error ? <p className="notice error">{run.error}</p> : null}
            {run?.output !== undefined ? (
              <>
                <h3 className="agents-coverage-title">{labels.outputTitle}</h3>
                <pre className="agents-json">{formatToolOutput(run.output)}</pre>
              </>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
