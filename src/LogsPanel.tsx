import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { translatePage } from './i18n/display'
import { authFetch } from './lib/auth-fetch'
import { MobileBodyPortal } from './MobileBodyPortal'

type ActivityLogRow = {
  id: string
  userEmail: string
  feature: string
  summary: string
  createdAt: string
  action?: string
  entityId?: string
  entityName?: string
}

type LogsApiResponse = {
  items?: ActivityLogRow[]
  count?: number
}

type LogsPanelProps = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  isMobileSearchOpen: boolean
  onToggleMobileSearch: () => void
}

const FEATURE_OPTIONS = [
  'Inventory',
  'Purchases',
  'Subtractions',
  'Alerts',
  'Properties',
  'Reviews',
  'Daily Operations',
] as const

const formatLogDate = (value: string, locale: string) => {
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

export function LogsPanel({
  getEndpoint,
  searchQuery,
  onSearchQueryChange,
  isMobileSearchOpen,
  onToggleMobileSearch,
}: LogsPanelProps) {
  const { t, i18n } = useTranslation()
  const [rows, setRows] = useState<ActivityLogRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [featureFilter, setFeatureFilter] = useState('')
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    const endpoint = getEndpoint(
      'getActivityLogsUrl',
      import.meta.env.VITE_GET_ACTIVITY_LOGS_URL,
    )
    if (!endpoint) {
      setError(t('logs.missingEndpoint'))
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.set('limit', '200')
      if (featureFilter) {
        params.set('feature', featureFilter)
      }
      const separator = endpoint.includes('?') ? '&' : '?'
      const response = await authFetch(`${endpoint}${separator}${params.toString()}`)
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `Logs request failed (${response.status}). ${errorText}`.trim(),
        )
      }
      const payload = (await response.json()) as LogsApiResponse
      setRows(Array.isArray(payload.items) ? payload.items : [])
      setLastUpdated(new Date().toISOString())
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('logs.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [featureFilter, getEndpoint, t])

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return rows
    }
    return rows.filter((row) => {
      const featureLabel = translatePage(t, row.feature).toLowerCase()
      return (
        row.userEmail.toLowerCase().includes(query) ||
        row.feature.toLowerCase().includes(query) ||
        featureLabel.includes(query) ||
        row.summary.toLowerCase().includes(query) ||
        (row.entityName ?? '').toLowerCase().includes(query)
      )
    })
  }, [rows, searchQuery, t])

  const uniqueUsers = useMemo(() => {
    return new Set(rows.map((row) => row.userEmail).filter(Boolean)).size
  }, [rows])

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('logs.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Logs')}</h1>
          </div>
          <p className="subtitle">{t('logs.subtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div
            className={`page-action-bar ${
              isMobileSearchOpen ? 'is-search-open' : ''
            }`}
          >
            <input
              className="search-input"
              placeholder={t('logs.search')}
              type="search"
              aria-label={t('logs.search')}
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
            />
            <div className="header-actions">
              <button
                className={`btn-ghost btn-search-toggle ${
                  isMobileSearchOpen ? 'is-active' : ''
                }`}
                type="button"
                aria-label={
                  isMobileSearchOpen
                    ? t('common.hideSearch')
                    : t('common.showSearch')
                }
                aria-expanded={isMobileSearchOpen}
                onClick={onToggleMobileSearch}
              >
                {isMobileSearchOpen ? (
                  <span aria-hidden="true">✕</span>
                ) : (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    width="16"
                    height="16"
                  >
                    <path
                      d="M8.5 3a5.5 5.5 0 0 1 4.38 8.82l3.65 3.65-1.41 1.41-3.65-3.65A5.5 5.5 0 1 1 8.5 3zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"
                      fill="currentColor"
                    />
                  </svg>
                )}
              </button>
              <label className="logs-feature-filter">
                <span className="visually-hidden">{t('logs.feature')}</span>
                <select
                  value={featureFilter}
                  onChange={(event) => setFeatureFilter(event.target.value)}
                  aria-label={t('logs.feature')}
                >
                  <option value="">{t('logs.allFeatures')}</option>
                  {FEATURE_OPTIONS.map((feature) => (
                    <option key={feature} value={feature}>
                      {translatePage(t, feature)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => void fetchLogs()}
              >
                {t('common.refresh')}
              </button>
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {error ? <div className="alert">{error}</div> : null}

      <section className="summary-cards is-open">
        <div className="card card-compact">
          <p className="card-label">{t('logs.totalEvents')}</p>
          <p className="card-value">{rows.length}</p>
          <p className="card-meta">{t('logs.recentEvents')}</p>
        </div>
        <div className="card card-compact">
          <p className="card-label">{t('logs.uniqueUsers')}</p>
          <p className="card-value">{uniqueUsers}</p>
          <p className="card-meta">{t('logs.visibleInList')}</p>
        </div>
        <div className="card card-compact">
          <p className="card-label">{t('common.lastRefresh')}</p>
          <p className="card-value">
            {lastUpdated
              ? formatLogDate(lastUpdated, i18n.language)
              : t('common.notSyncedYet')}
          </p>
          <p className="card-meta">{t('common.productionDynamoDb')}</p>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('logs.cardTitle')}</h2>
            <p className="card-subtitle">{t('logs.cardSubtitle')}</p>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="data-table data-table-logs">
            <thead>
              <tr>
                <th>{t('logs.user')}</th>
                <th>{t('logs.feature')}</th>
                <th>{t('common.date')}</th>
                <th>{t('logs.summary')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td className="table-empty" colSpan={4}>
                    {t('logs.loading')}
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td className="table-empty" colSpan={4}>
                    {searchQuery || featureFilter
                      ? t('logs.emptyFiltered')
                      : t('logs.empty')}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id || `${row.createdAt}-${row.summary}`}>
                    <td>{row.userEmail || 'system'}</td>
                    <td>{translatePage(t, row.feature)}</td>
                    <td>{formatLogDate(row.createdAt, i18n.language)}</td>
                    <td>{row.summary}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
