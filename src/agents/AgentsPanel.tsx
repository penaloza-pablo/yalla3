import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authFetch } from '../lib/auth-fetch'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { EmptyState, TableSkeleton } from '../design/Feedback'
import { YlIcon } from '../design/icons'
import { AgentConfigForm } from './AgentConfigForm'
import { draftFromAgent, emptyAgentDraft, type AgentDraft } from './form'
import { formatCost, formatDuration, formatWhen } from './format'
import { RunTimeline } from './RunTimeline'
import type {
  AgentRecord,
  AgentRun,
  AgentToolInfo,
  AgentVersionInfo,
} from './types'

type CatalogTab = 'definition' | 'versions' | 'test' | 'runs'

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
  const [versions, setVersions] = useState<AgentVersionInfo[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isDetailLoading, setIsDetailLoading] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [tab, setTab] = useState<CatalogTab>('definition')
  const [testInput, setTestInput] = useState('')
  const [testVersion, setTestVersion] = useState<'draft' | 'published'>('draft')
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
          versions?: AgentVersionInfo[]
          tools?: AgentToolInfo[]
          models?: string[]
        }
        const runsPayload = (await runsResponse.json()) as { items?: AgentRun[] }
        applyResources(detailPayload)
        if (detailPayload.item) {
          setSelected(detailPayload.item)
          setDraft(draftFromAgent(detailPayload.item))
        }
        setVersions(detailPayload.versions ?? [])
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
      setVersions([])
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
    setVersions([])
    setSelectedRunId(null)
    setTab('definition')
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
          runtimeLimits: {
            maxTurns: Number(draft.maxTurns),
            maxToolCalls: Number(draft.maxToolCalls),
            maxCostUsd: Number(draft.maxCostUsd),
            timeoutMs: Number(draft.timeoutMs),
          },
        }),
      })
      const payload = (await response.json()) as {
        item?: AgentRecord
        message?: string
        details?: string
        tools?: AgentToolInfo[]
        models?: string[]
      }
      if (!response.ok || !payload.item) {
        throw new Error(payload.details || payload.message || 'save')
      }
      applyResources(payload)
      isCreatingRef.current = false
      setIsCreating(false)
      setSelected(payload.item)
      setDraft(draftFromAgent(payload.item))
      setSelectedId(payload.item.id)
      setMessage(t('agents.saveDraftSuccess'))
      await loadAgents()
    } catch (caught) {
      const detail =
        caught instanceof Error && caught.message && caught.message !== 'save'
          ? ` ${caught.message}`
          : ''
      setError(`${t('agents.saveError')}${detail}`)
    } finally {
      setIsSaving(false)
    }
  }

  const publishSelected = async () => {
    if (!endpoint || !selectedId || isCreating) {
      return
    }
    setIsPublishing(true)
    setError(null)
    setMessage(null)
    try {
      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'publish', agentId: selectedId }),
      })
      const payload = (await response.json()) as {
        item?: AgentRecord
        message?: string
      }
      if (!response.ok || !payload.item) {
        throw new Error(payload.message || 'publish')
      }
      setSelected(payload.item)
      setDraft(draftFromAgent(payload.item))
      setMessage(t('agents.publishSuccess'))
      await loadAgents()
      await loadDetail(selectedId)
    } catch {
      setError(t('agents.publishError'))
    } finally {
      setIsPublishing(false)
    }
  }

  const runAgentRequest = async (options: {
    executionMode: 'production' | 'test'
    version?: 'draft' | 'published'
    input?: string
  }) => {
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
        body: JSON.stringify({
          agentId: selectedId,
          executionMode: options.executionMode,
          version: options.version,
          input: options.input,
        }),
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
      setTab('runs')
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
    limits: t('agents.limits'),
    maxTurns: t('agents.maxTurns'),
    maxToolCalls: t('agents.maxToolCalls'),
    maxCostUsd: t('agents.maxCostUsd'),
    timeoutMs: t('agents.timeoutMs'),
    save: t('agents.saveDraft'),
    saving: t('common.saving'),
    cancel: t('common.cancel'),
  }

  const timelineLabels = {
    status: (status: string) =>
      t(`agents.runStatus.${status}`, { defaultValue: status }),
    finding: (severity: string) =>
      t(`agents.finding.${severity}`, { defaultValue: severity }),
    outputTokens: t('agents.outputTokens'),
    reviewed: t('agents.reviewed'),
    unchecked: t('agents.unchecked'),
    reviewedEmpty: t('agents.reviewedEmpty'),
    uncheckedEmpty: t('agents.uncheckedEmpty'),
    trace: t('agents.trace'),
  }

  const showDetail = isCreating || selected || isDetailLoading
  const canPublish =
    Boolean(selected) &&
    !isCreating &&
    (selected?.hasUnpublishedChanges || !selected?.publishedVersion)

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('agents.studioEyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Agent Catalog')}</h1>
          </div>
          <p className="subtitle">{t('agents.catalogPageSubtitle')}</p>
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
                className="btn-secondary"
                type="button"
                onClick={() => void publishSelected()}
                disabled={!canPublish || isPublishing}
              >
                {isPublishing ? t('agents.publishing') : t('agents.publish')}
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() =>
                  void runAgentRequest({ executionMode: 'production' })
                }
                disabled={
                  !selectedId ||
                  isRunning ||
                  isCreating ||
                  selected?.enabled === false ||
                  !selected?.publishedVersion
                }
              >
                {isRunning ? t('agents.running') : t('agents.runPublished')}
              </button>
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {message ? <p className="notice success">{message}</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      {isLoading ? (
        <TableSkeleton rows={4} label={t('agents.catalogTitle')} />
      ) : null}
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
                              setTab('definition')
                            }}
                          >
                            {agent.name}
                          </button>
                          <div className="card-subtitle">{agent.purpose}</div>
                        </td>
                        <td>
                          {agent.provider} · {agent.model}
                        </td>
                        <td>
                          {agent.publishedVersion
                            ? `${t('agents.published')} v${agent.publishedVersion}`
                            : t('agents.draft')}
                          {agent.hasUnpublishedChanges
                            ? ` · ${t('agents.unpublishedChanges')}`
                            : ''}
                        </td>
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
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">
                      {isCreating
                        ? t('agents.newAgent')
                        : selected?.name || t('agents.configTitle')}
                    </h2>
                    <p className="card-subtitle">
                      {isCreating
                        ? t('agents.configSubtitle')
                        : [
                            selected?.publishedVersion
                              ? `${t('agents.published')} v${selected.publishedVersion}`
                              : t('agents.neverPublished'),
                            `${t('agents.draft')} v${selected?.draftVersion ?? 1}`,
                          ].join(' · ')}
                    </p>
                  </div>
                </div>
                {!isCreating ? (
                  <div className="agents-tabs">
                    {(['definition', 'versions', 'test', 'runs'] as CatalogTab[]).map(
                      (item) => (
                        <button
                          key={item}
                          type="button"
                          className={`btn-secondary ${tab === item ? 'is-selected' : ''}`}
                          onClick={() => setTab(item)}
                        >
                          {t(`agents.tabs.${item}`)}
                        </button>
                      ),
                    )}
                  </div>
                ) : null}

                {isCreating || tab === 'definition' ? (
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
                ) : null}

                {!isCreating && tab === 'versions' ? (
                  versions.length === 0 ? (
                    <p className="card-subtitle">{t('agents.noVersions')}</p>
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>{t('agents.version')}</th>
                            <th>{t('agents.model')}</th>
                            <th>{t('agents.publishedAt')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {versions.map((entry) => (
                            <tr key={entry.version}>
                              <td>
                                v{entry.version}
                                {selected?.publishedVersion === entry.version
                                  ? ` · ${t('agents.published')}`
                                  : ''}
                                {selected?.draftVersion === entry.version
                                  ? ` · ${t('agents.draft')}`
                                  : ''}
                              </td>
                              <td>
                                {entry.provider} · {entry.model}
                              </td>
                              <td>
                                {formatWhen(entry.publishedAt, i18n.language)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : null}

                {!isCreating && tab === 'test' ? (
                  <div className="agents-test">
                    <label>
                      {t('agents.testVersion')}
                      <select
                        value={testVersion}
                        onChange={(event) =>
                          setTestVersion(
                            event.target.value === 'published'
                              ? 'published'
                              : 'draft',
                          )
                        }
                      >
                        <option value="draft">{t('agents.draft')}</option>
                        <option
                          value="published"
                          disabled={!selected?.publishedVersion}
                        >
                          {t('agents.published')}
                        </option>
                      </select>
                    </label>
                    <label className="form-field-span">
                      {t('agents.testInput')}
                      <textarea
                        value={testInput}
                        onChange={(event) => setTestInput(event.target.value)}
                        rows={4}
                        placeholder={t('agents.testInputHelp')}
                      />
                    </label>
                    <div className="agents-form-actions">
                      <button
                        className="btn-primary"
                        type="button"
                        onClick={() =>
                          void runAgentRequest({
                            executionMode: 'test',
                            version: testVersion,
                            input: testInput,
                          })
                        }
                        disabled={isRunning || selected?.enabled === false}
                      >
                        {isRunning ? t('agents.running') : t('agents.runTest')}
                      </button>
                    </div>
                    {selectedRun ? (
                      <RunTimeline run={selectedRun} labels={timelineLabels} />
                    ) : null}
                  </div>
                ) : null}

                {!isCreating && tab === 'runs' ? (
                  <>
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
                              <th>{t('agents.cost')}</th>
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
                                  <div className="card-subtitle">
                                    {run.agentVersion
                                      ? `v${run.agentVersion}`
                                      : ''}
                                    {run.latencyMs
                                      ? ` · ${formatDuration(run.latencyMs)}`
                                      : ''}
                                  </div>
                                </td>
                                <td>
                                  {t(`agents.runStatus.${run.status}`, {
                                    defaultValue: run.status,
                                  })}
                                </td>
                                <td>
                                  {t(`agents.triggerKind.${run.trigger}`, {
                                    defaultValue: run.trigger,
                                  })}
                                </td>
                                <td>{formatCost(run.estimatedCostUsd)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {selectedRun ? (
                      <RunTimeline run={selectedRun} labels={timelineLabels} />
                    ) : null}
                  </>
                ) : null}
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
