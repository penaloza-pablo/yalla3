import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authFetch } from '../lib/auth-fetch'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { EmptyState, TableSkeleton } from '../design/Feedback'
import { YlIcon } from '../design/icons'
import { AgentConfigForm } from './AgentConfigForm'
import { draftFromAgent, emptyAgentDraft, type AgentDraft } from './form'
import type { AgentRecord, AgentRun, AgentToolInfo, CoverageItem } from './types'

type AgentsPanelProps = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
}

const FALLBACK_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4.1-mini',
  'gpt-4.1',
  'o4-mini',
]

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
  const [tools, setTools] = useState<AgentToolInfo[]>([])
  const [models, setModels] = useState<string[]>(FALLBACK_MODELS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selected, setSelected] = useState<AgentRecord | null>(null)
  const [draft, setDraft] = useState<AgentDraft>(emptyAgentDraft(FALLBACK_MODELS[0]))
  const [isCreating, setIsCreating] = useState(false)
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const isCreatingRef = useRef(false)

  const endpoint = getEndpoint(
    'aiAgentsUrl',
    import.meta.env.VITE_AI_AGENTS_URL,
  )

  const selectedRun = useMemo(
    () => runs.find((run) => run.runId === selectedRunId) ?? null,
    [runs, selectedRunId],
  )

  const applyResources = (payload: {
    tools?: AgentToolInfo[]
    models?: string[]
  }) => {
    if (payload.tools && payload.tools.length > 0) {
      setTools(payload.tools)
    }
    if (payload.models && payload.models.length > 0) {
      setModels(payload.models)
    }
  }

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
      const payload = (await response.json()) as {
        items?: AgentRecord[]
        tools?: AgentToolInfo[]
        models?: string[]
      }
      const items = payload.items ?? []
      setAgents(items)
      applyResources(payload)
      setSelectedId((current) => {
        if (isCreatingRef.current) {
          return current
        }
        return current ?? items[0]?.id ?? null
      })
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
          tools?: AgentToolInfo[]
          models?: string[]
        }
        const runsPayload = (await runsResponse.json()) as { items?: AgentRun[] }
        applyResources(detailPayload)
        if (detailPayload.item) {
          setSelected(detailPayload.item)
          setDraft(draftFromAgent(detailPayload.item))
        }
        const nextRuns = runsPayload.items ?? detailPayload.recentRuns ?? []
        setRuns(nextRuns)
        setSelectedRunId((current) =>
          current && nextRuns.some((run) => run.runId === current)
            ? current
            : (nextRuns[0]?.runId ?? null),
        )
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
    if (isCreating) {
      return
    }
    if (!selectedId) {
      setSelected(null)
      setRuns([])
      return
    }
    void loadDetail(selectedId)
  }, [isCreating, loadDetail, selectedId])

  const startCreate = () => {
    isCreatingRef.current = true
    setIsCreating(true)
    setSelectedId(null)
    setSelected(null)
    setRuns([])
    setSelectedRunId(null)
    setDraft(emptyAgentDraft(models[0] ?? FALLBACK_MODELS[0]))
    setMessage(null)
    setError(null)
  }

  const cancelCreate = () => {
    isCreatingRef.current = false
    setIsCreating(false)
    setSelectedId(agents[0]?.id ?? null)
  }

  const saveDraft = async () => {
    if (!endpoint) {
      setError(t('agents.missingEndpoint'))
      return
    }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    const paragraphs = Number(draft.expectedParagraphs)
    try {
      const response = await authFetch(endpoint, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: isCreating ? undefined : draft.id,
          name: draft.name,
          purpose: draft.purpose,
          instructions: draft.instructions,
          rules: draft.rules,
          allowedTools: draft.allowedTools,
          model: draft.model,
          enabled: draft.enabled,
          coveragePolicy: {
            type: draft.coverageType,
            expectedParagraphs:
              draft.coverageType === 'mention_in_output' &&
              Number.isInteger(paragraphs) &&
              paragraphs > 0
                ? paragraphs
                : undefined,
          },
        }),
      })
      const payload = (await response.json()) as {
        item?: AgentRecord
        message?: string
        tools?: AgentToolInfo[]
        models?: string[]
      }
      if (!response.ok || !payload.item) {
        throw new Error(payload.message || 'save')
      }
      applyResources(payload)
      isCreatingRef.current = false
      setIsCreating(false)
      setSelected(payload.item)
      setDraft(draftFromAgent(payload.item))
      setSelectedId(payload.item.id)
      setMessage(t('agents.saveSuccess'))
      await loadAgents()
    } catch {
      setError(t('agents.saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  const runSelected = async () => {
    if (!endpoint || !selectedId) {
      setError(t('agents.missingEndpoint'))
      return
    }
    if (isRunning || isCreating) {
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

  const formLabels = {
    name: t('common.name'),
    purpose: t('agents.purpose'),
    purposeHelp: t('agents.purposeHelp'),
    enabled: t('agents.enabled'),
    enabledOn: t('agents.enabledOn'),
    enabledOff: t('agents.enabledOff'),
    model: t('agents.model'),
    modelHelp: t('agents.modelHelp'),
    coverage: t('agents.coverage'),
    coverageHelp: t('agents.coverageHelp'),
    coverageTool: t('agents.coverageTool'),
    coverageMention: t('agents.coverageMention'),
    paragraphs: t('agents.paragraphs'),
    paragraphsHelp: t('agents.paragraphsHelp'),
    instructions: t('agents.instructions'),
    instructionsHelp: t('agents.instructionsHelp'),
    rules: t('agents.rules'),
    rulesHelp: t('agents.rulesHelp'),
    addRule: t('agents.addRule'),
    removeRule: t('agents.removeRule'),
    tools: t('agents.tools'),
    toolsHelp: t('agents.toolsHelp'),
    noTools: t('agents.noRegisteredTools'),
    save: t('common.save'),
    saving: t('common.saving'),
    cancel: t('common.cancel'),
  }

  const showDetail = isCreating || selected || isDetailLoading

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
                onClick={() => {
                  void loadAgents()
                  if (selectedId && !isCreating) {
                    void loadDetail(selectedId)
                  }
                }}
                disabled={isLoading}
                aria-label={t('common.refresh')}
              >
                <YlIcon name="arrow.clockwise" size={16} />
              </button>
              <button
                className="btn-secondary"
                type="button"
                onClick={startCreate}
                disabled={isCreating}
              >
                {t('agents.newAgent')}
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => void runSelected()}
                disabled={
                  !selectedId ||
                  isRunning ||
                  isCreating ||
                  selected?.enabled === false
                }
              >
                {isRunning ? t('agents.running') : t('agents.runNow')}
              </button>
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {message ? <p className="notice success">{message}</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('agents.toolsCatalogTitle')}</h2>
            <p className="card-subtitle">{t('agents.toolsCatalogSubtitle')}</p>
          </div>
        </div>
        {tools.length === 0 ? (
          <p className="card-subtitle">{t('agents.noRegisteredTools')}</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('agents.toolName')}</th>
                  <th>{t('agents.toolDescription')}</th>
                  <th>{t('agents.toolOutput')}</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((tool) => (
                  <tr key={tool.name}>
                    <td>
                      <code>{tool.name}</code>
                    </td>
                    <td>{tool.description}</td>
                    <td>{tool.outputDescription}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isLoading ? <TableSkeleton rows={4} label={t('agents.catalogTitle')} /> : null}
      {!isLoading && agents.length === 0 && !isCreating && !error ? (
        <EmptyState message={t('agents.emptyBody')} />
      ) : null}

      {agents.length > 0 || isCreating ? (
        <div className="agents-layout">
          <section className="card agents-list-card">
            <div className="card-header">
              <div>
                <h2 className="card-title">{t('agents.catalogTitle')}</h2>
                <p className="card-subtitle">{t('agents.catalogSubtitle')}</p>
              </div>
            </div>
            {agents.length === 0 ? (
              <p className="card-subtitle">{t('agents.emptyBody')}</p>
            ) : (
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
                        className={
                          !isCreating && agent.id === selectedId ? 'is-selected' : ''
                        }
                      >
                        <td>
                          <button
                            type="button"
                            className="btn-link"
                            onClick={() => {
                              isCreatingRef.current = false
                              setIsCreating(false)
                              setSelectedId(agent.id)
                            }}
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
            )}
          </section>

          <div className="agents-detail">
            {isDetailLoading && !selected && !isCreating ? (
              <TableSkeleton rows={6} label={t('agents.configTitle')} />
            ) : null}
            {showDetail && (isCreating || selected) ? (
              <>
                <section className="card">
                  <div className="card-header">
                    <div>
                      <h2 className="card-title">
                        {isCreating
                          ? t('agents.newAgent')
                          : selected?.name || t('agents.configTitle')}
                      </h2>
                      <p className="card-subtitle">{t('agents.configSubtitle')}</p>
                    </div>
                  </div>
                  {!isCreating && selected ? (
                    <dl className="agents-meta">
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
                  ) : null}
                  <AgentConfigForm
                    draft={draft}
                    tools={tools}
                    models={models}
                    isNew={isCreating}
                    isSaving={isSaving}
                    labels={formLabels}
                    onChange={setDraft}
                    onSave={() => void saveDraft()}
                    onCancel={cancelCreate}
                  />
                </section>

                {!isCreating ? (
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
                ) : null}

                {!isCreating && selectedRun ? (
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
