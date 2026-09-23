import { useEffect, useState } from 'react'
import { EmptyState, TableSkeleton } from '../design/Feedback'
import { formatToolOutput, formatWhen } from './format'
import {
  collectToolArguments,
  defaultToolArgumentValues,
  toolInputFields,
} from './tool-schema'
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
    argsTitle: string
    argsHint: string
    argsMissing: string
    required: string
    optional: string
    cancel: string
  }
  onRun: (
    toolName: string,
    args: Record<string, unknown>,
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
  const [prompting, setPrompting] = useState<string | null>(null)
  const [argValues, setArgValues] = useState<
    Record<string, Record<string, string | boolean>>
  >({})
  const [argError, setArgError] = useState<Record<string, string | undefined>>(
    {},
  )

  useEffect(() => {
    if (versionsByTool) {
      setVersions(versionsByTool)
    }
  }, [versionsByTool])

  const executeTool = async (
    toolName: string,
    args: Record<string, unknown>,
  ) => {
    setArgError((current) => ({ ...current, [toolName]: undefined }))
    setRuns((current) => ({
      ...current,
      [toolName]: { isRunning: true, output: undefined, error: undefined },
    }))
    const result = await onRun(toolName, args)
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

  const runTool = async (tool: AgentToolInfo) => {
    const fields = toolInputFields(tool.inputSchema)
    if (fields.length > 0 && prompting !== tool.name) {
      setPrompting(tool.name)
      setArgValues((current) => ({
        ...current,
        [tool.name]: current[tool.name] ?? defaultToolArgumentValues(fields),
      }))
      setArgError((current) => ({
        ...current,
        [tool.name]: undefined,
      }))
      return
    }
    if (fields.length > 0) {
      const collected = collectToolArguments(
        fields,
        argValues[tool.name] ?? defaultToolArgumentValues(fields),
      )
      if (!collected.ok) {
        setArgError((current) => ({
          ...current,
          [tool.name]: labels.argsMissing,
        }))
        return
      }
      await executeTool(tool.name, collected.arguments)
      return
    }
    await executeTool(tool.name, {})
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
        const fields = toolInputFields(tool.inputSchema)
        const isPrompting = prompting === tool.name
        const values = argValues[tool.name] ?? defaultToolArgumentValues(fields)
        return (
          <section className="card" key={tool.name}>
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  <code>{tool.name}</code>
                </h2>
                <p className="card-subtitle">{tool.description}</p>
              </div>
              <div className="agents-tool-actions">
                {isPrompting ? (
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => setPrompting(null)}
                    disabled={run?.isRunning}
                  >
                    {labels.cancel}
                  </button>
                ) : null}
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => void runTool(tool)}
                  disabled={run?.isRunning}
                >
                  {run?.isRunning ? labels.running : labels.run}
                </button>
              </div>
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
            {isPrompting && fields.length > 0 ? (
              <form
                className="agents-tool-args"
                onSubmit={(event) => {
                  event.preventDefault()
                  void runTool(tool)
                }}
              >
                <h3 className="agents-coverage-title">{labels.argsTitle}</h3>
                <p className="card-subtitle">{labels.argsHint}</p>
                {fields.map((field) => (
                  <label key={field.name} className="agents-tool-arg">
                    <span>
                      <code>{field.name}</code>
                      {field.required ? (
                        <span className="agents-tool-arg-flag">
                          {' '}
                          {labels.required}
                        </span>
                      ) : (
                        <span className="agents-tool-arg-flag is-optional">
                          {' '}
                          {labels.optional}
                        </span>
                      )}
                    </span>
                    {field.description ? (
                      <span className="card-subtitle">{field.description}</span>
                    ) : null}
                    {field.type === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={values[field.name] === true}
                        onChange={(event) =>
                          setArgValues((current) => ({
                            ...current,
                            [tool.name]: {
                              ...values,
                              [field.name]: event.target.checked,
                            },
                          }))
                        }
                      />
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        required={field.required}
                        value={String(values[field.name] ?? '')}
                        onChange={(event) =>
                          setArgValues((current) => ({
                            ...current,
                            [tool.name]: {
                              ...values,
                              [field.name]: event.target.value,
                            },
                          }))
                        }
                      />
                    )}
                  </label>
                ))}
                {argError[tool.name] ? (
                  <p className="notice error">{argError[tool.name]}</p>
                ) : null}
              </form>
            ) : null}
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
