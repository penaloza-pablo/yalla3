import { useState } from 'react'
import { EmptyState, TableSkeleton } from '../design/Feedback'
import type { AgentToolInfo } from './types'

type ToolRunState = {
  isRunning: boolean
  output?: unknown
  error?: string
}

type ToolsPanelProps = {
  tools: AgentToolInfo[]
  isLoading: boolean
  labels: {
    title: string
    output: string
    run: string
    running: string
    empty: string
    outputTitle: string
  }
  onRun: (toolName: string) => Promise<{ output?: unknown; error?: string }>
}

export const formatToolOutput = (value: unknown) => {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(JSON.parse(value), null, 2)
    } catch {
      return value
    }
  }
  return JSON.stringify(value, null, 2)
}

export function ToolsPanel({
  tools,
  isLoading,
  labels,
  onRun,
}: ToolsPanelProps) {
  const [runs, setRuns] = useState<Record<string, ToolRunState>>({})

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
      },
    }))
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
            </dl>
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
