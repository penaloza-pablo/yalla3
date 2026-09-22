import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authFetch } from '../lib/auth-fetch'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { EmptyState, TableSkeleton } from '../design/Feedback'
import { YlIcon } from '../design/icons'
import type { AgentRecord, AgentRun, CoverageItem } from './types'

type AgentsPanelProps = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
}

const formatWhen = (value: string | undefined, locale: string) => {
  if (!value) {
    return '—'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString(locale.startsWith('es') ? 'es-ES' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

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

export function AgentsPanel({ getEndpoint }: AgentsPanelProps) {
  const { t, i18n } = useTranslation()
  const [agents, setAgents] = useState<AgentRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<AgentRecord | null>(null)
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const endpoint = getEndpoint(
    'aiAgentsUrl',
    import.meta.env.VITE_AI_AGENTS_URL,
  )

  const selectedRun = useMemo(
    () => runs.find((run) => run.runId === selectedRunId) ?? null,
    [runs, selectedRunId],
  )

  const loadAgents = useCallback(async () => {
    if (!endpoint) {
      setError(t('agents.missingEndpoint'))
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const response = await authFetch(endpoint)
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const payload = (await response.json()) as { items?: AgentRecord[] }
      const items = payload.items ?? []
      setAgents(items)
      setSelectedId((current) => current ?? items[0]?.id ?? null)
    } catch {
      setError(t('agents.loadError'))
    } finally {
      setIsLoading(false)
    }
  }, [endpoint, t])

  const loadDetail = useCallback(
    async (agentId: string) => {
      if (!endpoint) {
        return
      }
      setIsDetailLoading(true)
      setError(null)
      try {
        const [detailResponse, runsResponse] = await Promise.all([
          authFetch(`${endpoint}?id=${encodeURIComponent(agentId)}`),
          authFetch(`${endpoint}?id=${encodeURIComponent(agentId)}&runs=1`),
        ])
        if (!detailResponse.ok || !runsResponse.ok) {
          throw new Error('detail')
        }
        const detailPayload = (await detailResponse.json()) as {
          item?: AgentRecord
          recentRuns?: AgentRun[]
        }
        const runsPayload = (await runsResponse.json()) as { items?: AgentRun[] }
        if (detailPayload.item) {
          setSelected(detailPayload.item)
        }
        const nextRuns = runsPayload.items ?? detailPayload.recentRuns ?? []
        setRuns(nextRuns)
        setSelectedRunId(nextRuns[0]?.runId ?? null)
      } catch {
        setError(t('agents.loadError'))
      } finally {
        setIsDetailLoading(false)
      }
    },
    [endpoint, t],
  )

  useEffect(() => {
    void loadAgents()
  }, [loadAgents])

  useEffect(() => {
    if (!selectedId) {
      setSelected(null)
      setRuns([])
      return
    }
    void loadDetail(selectedId)
  }, [loadDetail, selectedId])

  const runSelected = async () => {
    if (!endpoint || !selectedId) {
      setError(t('agents.missingEndpoint'))
      return
    }
    setIsRunning(true)
    setError(null)
    setMessage(null)
    try {
      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: selectedId }),
      })
      const payload = (await response.json()) as {
        run?: AgentRun
        message?: string
      }
      if (!payload.run) {
        throw new Error(payload.message || 'run')
      }
      setRuns((current) => [
        payload.run as AgentRun,
        ...current.filter((run) => run.runId !== payload.run?.runId),
      ])
      setSelectedRunId(payload.run.runId)
      setMessage(
        payload.run.status === 'succeeded'
          ? t('agents.runSuccess')
          : t('agents.runFailed'),
      )
      await loadAgents()
      await loadDetail(selectedId)
    } catch {
      setError(t('agents.runError'))
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('agents.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Agents')}</h1>
          </div>
          <p className="subtitle">{t('agents.subtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <div className="header-actions">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => void loadAgents()}
                disabled={isLoading}
                aria-label={t('common.refresh')}
              >
                <YlIcon name="arrow.clockwise" size={16} />
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => void runSelected()}
                disabled={!selectedId || isRunning || selected?.enabled === false}
              >
                {isRunning ? t('agents.running') : t('agents.runNow')}
              </button>
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {message ? <p className="notice success">{message}</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      {isLoading ? <TableSkeleton rows={4} label={t('agents.catalogTitle')} /> : null}
      {!isLoading && agents.length === 0 && !error ? (
        <EmptyState message={t('agents.emptyBody')} />
      ) : null}

      {agents.length > 0 ? (
        <div className="agents-layout">
          <section className="card agents-list-card">
            <div className="card-header">
              <div>
                <h2 className="card-title">{t('agents.catalogTitle')}</h2>
                <p className="card-subtitle">{t('agents.catalogSubtitle')}</p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('agents.name')}</th>
                    <th>{t('agents.provider')}</th>
                    <th>{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => (
                    <tr
                      key={agent.id}
                      className={agent.id === selectedId ? 'is-selected' : ''}
                    >
                      <td>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => setSelectedId(agent.id)}
                        >
                          {agent.name}
                        </button>
                        <div className="card-subtitle">{agent.purpose}</div>
                      </td>
                      <td>
                        {agent.provider} · {agent.model}
                      </td>
                      <td>{t(`agents.status.${agent.providerStatus}`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="agents-detail">
            {isDetailLoading && !selected ? (
              <TableSkeleton rows={6} label={t('agents.configTitle')} />
            ) : null}
            {selected ? (
              <>
                <section className="card">
                  <div className="card-header">
                    <div>
                      <h2 className="card-title">{selected.name}</h2>
                      <p className="card-subtitle">{selected.purpose}</p>
                    </div>
                  </div>
                  <dl className="agents-meta">
                    <div>
                      <dt>{t('agents.provider')}</dt>
                      <dd>
                        {selected.provider} · {selected.model}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('common.status')}</dt>
                      <dd>{t(`agents.status.${selected.providerStatus}`)}</dd>
                    </div>
                    <div>
                      <dt>{t('agents.schedule')}</dt>
                      <dd>
                        {selected.schedule.kind === 'cron'
                          ? selected.schedule.expression
                          : t('agents.scheduleManual')}
                        {selected.schedule.description
                          ? ` · ${selected.schedule.description}`
                          : ''}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('agents.lastRun')}</dt>
                      <dd>
                        {formatWhen(selected.lastRunAt, i18n.language)}
                        {selected.lastRunStatus
                          ? ` · ${t(`agents.runStatus.${selected.lastRunStatus}`)}`
                          : ''}
                      </dd>
                    </div>
                  </dl>
                </section>

                <section className="card">
                  <div className="card-header">
                    <div>
                      <h2 className="card-title">{t('agents.configTitle')}</h2>
                      <p className="card-subtitle">{t('agents.configSubtitle')}</p>
                    </div>
                  </div>
                  <h3 className="agents-coverage-title">{t('agents.instructions')}</h3>
                  <pre className="agents-pre">{selected.instructions}</pre>
                  <h3 className="agents-coverage-title">{t('agents.rules')}</h3>
                  <ul className="agents-coverage-list">
                    {selected.rules.map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ul>
                  <h3 className="agents-coverage-title">{t('agents.tools')}</h3>
                  <p>{selected.allowedTools.join(', ') || '—'}</p>
                </section>

                <section className="card">
                  <div className="card-header">
                    <div>
                      <h2 className="card-title">{t('agents.runsTitle')}</h2>
                      <p className="card-subtitle">{t('agents.runsSubtitle')}</p>
                    </div>
                  </div>
                  {runs.length === 0 ? (
                    <p className="card-subtitle">{t('agents.noRuns')}</p>
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>{t('agents.started')}</th>
                            <th>{t('common.status')}</th>
                            <th>{t('agents.trigger')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {runs.map((run) => (
                            <tr
                              key={run.runId}
                              className={
                                run.runId === selectedRunId ? 'is-selected' : ''
                              }
                            >
                              <td>
                                <button
                                  type="button"
                                  className="btn-link"
                                  onClick={() => setSelectedRunId(run.runId)}
                                >
                                  {formatWhen(run.startedAt, i18n.language)}
                                </button>
                              </td>
                              <td>{t(`agents.runStatus.${run.status}`)}</td>
                              <td>{t(`agents.triggerKind.${run.trigger}`)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                {selectedRun ? (
                  <section className="card">
                    <div className="card-header">
                      <div>
                        <h2 className="card-title">{t('agents.runDetail')}</h2>
                        <p className="card-subtitle">
                          {t(`agents.runStatus.${selectedRun.status}`)}
                          {selectedRun.usage?.outputTokens
                            ? ` · ${selectedRun.usage.outputTokens} ${t('agents.outputTokens')}`
                            : ''}
                        </p>
                      </div>
                    </div>
                    {selectedRun.error ? (
                      <p className="notice error">{selectedRun.error}</p>
                    ) : null}
                    {selectedRun.result ? (
                      <pre className="agents-pre">{selectedRun.result}</pre>
                    ) : null}
                    {selectedRun.findings && selectedRun.findings.length > 0 ? (
                      <ul className="agents-coverage-list">
                        {selectedRun.findings.map((finding) => (
                          <li key={`${finding.title}-${finding.detail}`}>
                            <strong>
                              {t(`agents.finding.${finding.severity}`)} ·{' '}
                              {finding.title}
                            </strong>
                            <div className="card-subtitle">{finding.detail}</div>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="agents-coverage-grid">
                      <CoverageList
                        title={t('agents.reviewed')}
                        items={selectedRun.coverage?.reviewed ?? []}
                        empty={t('agents.reviewedEmpty')}
                      />
                      <CoverageList
                        title={t('agents.unchecked')}
                        items={selectedRun.coverage?.unchecked ?? []}
                        empty={t('agents.uncheckedEmpty')}
                      />
                    </div>
                    {selectedRun.events && selectedRun.events.length > 0 ? (
                      <>
                        <h3 className="agents-coverage-title">
                          {t('agents.trace')}
                        </h3>
                        <ul className="agents-coverage-list">
                          {selectedRun.events.map((event, index) => (
                            <li key={`${event.at}-${event.name}-${index}`}>
                              <strong>
                                {event.type} · {event.name}
                              </strong>
                              {event.inputSummary ? (
                                <div className="card-subtitle">{event.inputSummary}</div>
                              ) : null}
                              {event.outputSummary ? (
                                <div className="card-subtitle">{event.outputSummary}</div>
                              ) : null}
                              {event.error ? (
                                <div className="card-subtitle">{event.error}</div>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                  </section>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
