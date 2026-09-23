import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authFetch } from '../lib/auth-fetch'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { EmptyState, TableSkeleton } from '../design/Feedback'
import { YlIcon } from '../design/icons'
import { formatCost, formatDuration, formatWhen, shortRunId } from './format'
import { RunTimeline } from './RunTimeline'
import type { AgentRun } from './types'

type RuntimePanelProps = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
}

export function RuntimePanel({ getEndpoint }: RuntimePanelProps) {
  const { t, i18n } = useTranslation()
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endpoint = getEndpoint('aiAgentsUrl', import.meta.env.VITE_AI_AGENTS_URL)

  const selectedRun = useMemo(
    () => runs.find((run) => run.runId === selectedRunId) ?? null,
    [runs, selectedRunId],
  )

  const loadRuns = useCallback(async () => {
    if (!endpoint) {
      setError(t('agents.missingEndpoint'))
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const response = await authFetch(`${endpoint}?view=runtime&limit=50`)
      if (!response.ok) {
        throw new Error('runtime')
      }
      const payload = (await response.json()) as { items?: AgentRun[] }
      const items = payload.items ?? []
      setRuns(items)
      setSelectedRunId((current) =>
        current && items.some((run) => run.runId === current)
          ? current
          : (items[0]?.runId ?? null),
      )
    } catch {
      setError(t('agents.loadError'))
    } finally {
      setIsLoading(false)
    }
  }, [endpoint, t])

  useEffect(() => {
    void loadRuns()
  }, [loadRuns])

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('agents.studioEyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Agent Runtime')}</h1>
          </div>
          <p className="subtitle">{t('agents.runtimeSubtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <div className="header-actions">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => void loadRuns()}
                disabled={isLoading}
                aria-label={t('common.refresh')}
              >
                <YlIcon name="arrow.clockwise" size={16} />
              </button>
            </div>
          </div>
        </MobileBodyPortal>
      </header>
      {error ? <p className="notice error">{error}</p> : null}
      {isLoading ? <TableSkeleton rows={6} label={t('agents.runtimeTitle')} /> : null}
      {!isLoading && runs.length === 0 && !error ? (
        <EmptyState message={t('agents.runtimeEmpty')} />
      ) : null}
      {runs.length > 0 ? (
        <div className="agents-layout">
          <section className="card agents-list-card">
            <div className="card-header">
              <div>
                <h2 className="card-title">{t('agents.runtimeTitle')}</h2>
                <p className="card-subtitle">{t('agents.runtimeTableSubtitle')}</p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('agents.runId')}</th>
                    <th>{t('agents.name')}</th>
                    <th>{t('common.status')}</th>
                    <th>{t('agents.duration')}</th>
                    <th>{t('agents.cost')}</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr
                      key={run.runId}
                      className={run.runId === selectedRunId ? 'is-selected' : ''}
                    >
                      <td>
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => setSelectedRunId(run.runId)}
                        >
                          {shortRunId(run.runId)}
                        </button>
                        <div className="card-subtitle">
                          {formatWhen(run.startedAt, i18n.language)}
                        </div>
                      </td>
                      <td>
                        {run.agentName || run.toolId || run.agentId}
                        <div className="card-subtitle">
                          {run.model || run.trigger}
                          {run.agentVersion ? ` · v${run.agentVersion}` : ''}
                        </div>
                      </td>
                      <td>
                        {t(`agents.runStatus.${run.status}`, {
                          defaultValue: run.status,
                        })}
                      </td>
                      <td>{formatDuration(run.latencyMs)}</td>
                      <td>{formatCost(run.estimatedCostUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="agents-detail">
            {selectedRun ? (
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">{t('agents.runDetail')}</h2>
                    <p className="card-subtitle">
                      {t(`agents.runStatus.${selectedRun.status}`, {
                        defaultValue: selectedRun.status,
                      })}
                      {selectedRun.usage?.outputTokens
                        ? ` · ${selectedRun.usage.outputTokens} ${t('agents.outputTokens')}`
                        : ''}
                      {selectedRun.estimatedCostUsd
                        ? ` · ${formatCost(selectedRun.estimatedCostUsd)}`
                        : ''}
                    </p>
                  </div>
                </div>
                <RunTimeline
                  run={selectedRun}
                  labels={{
                    status: (status) =>
                      t(`agents.runStatus.${status}`, { defaultValue: status }),
                    finding: (severity) =>
                      t(`agents.finding.${severity}`, { defaultValue: severity }),
                    outputTokens: t('agents.outputTokens'),
                    reviewed: t('agents.reviewed'),
                    unchecked: t('agents.unchecked'),
                    reviewedEmpty: t('agents.reviewedEmpty'),
                    uncheckedEmpty: t('agents.uncheckedEmpty'),
                    trace: t('agents.trace'),
                  }}
                />
              </section>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
