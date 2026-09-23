import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authFetch } from '../lib/auth-fetch'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { YlIcon } from '../design/icons'
import { ToolsPanel } from './ToolsPanel'
import type { AgentToolInfo } from './types'

type ToolsStudioProps = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
}

export function ToolsStudio({ getEndpoint }: ToolsStudioProps) {
  const { t, i18n } = useTranslation()
  const [tools, setTools] = useState<AgentToolInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endpoint = getEndpoint('aiAgentsUrl', import.meta.env.VITE_AI_AGENTS_URL)

  const loadTools = useCallback(async () => {
    if (!endpoint) {
      setError(t('agents.missingEndpoint'))
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const response = await authFetch(`${endpoint}?view=tools`)
      if (!response.ok) {
        throw new Error('tools')
      }
      const payload = (await response.json()) as {
        items?: AgentToolInfo[]
        tools?: AgentToolInfo[]
      }
      const fromView = payload.items ?? []
      const listed = payload.tools ?? []
      const looksLikeTools =
        fromView.length > 0 &&
        fromView.every(
          (item) => 'outputDescription' in item || 'riskLevel' in item,
        )
      setTools(listed.length > 0 ? listed : looksLikeTools ? fromView : [])
    } catch {
      setError(t('agents.loadError'))
    } finally {
      setIsLoading(false)
    }
  }, [endpoint, t])

  useEffect(() => {
    void loadTools()
  }, [loadTools])

  const runTool = async (toolName: string) => {
    if (!endpoint) {
      return { error: t('agents.missingEndpoint') }
    }
    try {
      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tool: toolName }),
      })
      const payload = (await response.json()) as {
        output?: unknown
        message?: string
        run?: { runId?: string }
      }
      if (!response.ok) {
        return { error: payload.message || t('agents.toolRunError') }
      }
      return { output: payload.output, runId: payload.run?.runId }
    } catch {
      return { error: t('agents.toolRunError') }
    }
  }

  const loadVersions = async (toolName: string) => {
    if (!endpoint) {
      return []
    }
    const response = await authFetch(
      `${endpoint}?view=tool-versions&tool=${encodeURIComponent(toolName)}`,
    )
    if (!response.ok) {
      return []
    }
    const payload = (await response.json()) as {
      items?: Array<{
        version: number
        description?: string
        createdAt?: string
        riskLevel?: string
      }>
    }
    return payload.items ?? []
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('agents.studioEyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Tools')}</h1>
          </div>
          <p className="subtitle">{t('agents.toolsPageSubtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <div className="header-actions">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => void loadTools()}
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
      <ToolsPanel
        tools={tools}
        isLoading={isLoading}
        locale={i18n.language}
        labels={{
          title: t('agents.toolsCatalogTitle'),
          output: t('agents.toolOutput'),
          run: t('agents.runTool'),
          running: t('agents.runningTool'),
          empty: t('agents.noRegisteredTools'),
          outputTitle: t('agents.toolOutputTitle'),
          version: t('agents.version'),
          risk: t('agents.riskLevel'),
          history: t('agents.versionHistory'),
        }}
        onRun={runTool}
        onLoadVersions={loadVersions}
      />
    </>
  )
}
