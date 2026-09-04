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

type LogsQuickPreset = 'none' | 'today' | 'last100'

type LogsPanelProps = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  isMobileSearchOpen: boolean
  onToggleMobileSearch: () => void
  isSummaryInfoOpen: boolean
  onToggleSummaryInfo: () => void
}

const FEATURE_OPTIONS = [
  'Inventory',
  'Purchases',
  'Subtractions',
  'Alerts',
  'Properties',
  'Bookings',
  'Reviews',
  'Daily Operations',
  'Cleaning Plan',
  'Cleaning Incidents',
  'Cleaning Billing',
  'Cleaning settings',
  'Maintenance Plan',
  'Maintenance Incidents',
  'Maintenance Billing',
  'Maintenance settings',
  'Slack',
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

const isSameLocalDay = (isoValue: string, now = new Date()) => {
  const parsed = new Date(isoValue)
  if (Number.isNaN(parsed.getTime())) {
    return false
  }
  return (
    parsed.getFullYear() === now.getFullYear() &&
    parsed.getMonth() === now.getMonth() &&
    parsed.getDate() === now.getDate()
  )
}

export function LogsPanel({
  getEndpoint,
  searchQuery,
  onSearchQueryChange,
  isMobileSearchOpen,
  onToggleMobileSearch,
  isSummaryInfoOpen,
  onToggleSummaryInfo,
}: LogsPanelProps) {
  const { t, i18n } = useTranslation()
  const [rows, setRows] = useState<ActivityLogRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [featureFilters, setFeatureFilters] = useState<string[]>([])
  const [featureFilterDraft, setFeatureFilterDraft] = useState<string[]>([])
  const [quickPreset, setQuickPreset] = useState<LogsQuickPreset>('none')

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
  }, [getEndpoint, t])

  useEffect(() => {
    void fetchLogs()
  }, [fetchLogs])

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    let next = rows

    if (featureFilters.length > 0) {
      const selected = new Set(featureFilters)
      next = next.filter((row) => selected.has(row.feature))
    }

    if (query) {
      next = next.filter((row) => {
        const featureLabel = translatePage(t, row.feature).toLowerCase()
        return (
          row.userEmail.toLowerCase().includes(query) ||
          row.feature.toLowerCase().includes(query) ||
          featureLabel.includes(query) ||
          row.summary.toLowerCase().includes(query) ||
          (row.entityName ?? '').toLowerCase().includes(query)
        )
      })
    }

    if (quickPreset === 'today') {
      next = next.filter((row) => isSameLocalDay(row.createdAt))
    }

    if (quickPreset === 'last100') {
      next = next.slice(0, 100)
    }

    return next
  }, [featureFilters, quickPreset, rows, searchQuery, t])

  const uniqueUsers = useMemo(() => {
    return new Set(filteredRows.map((row) => row.userEmail).filter(Boolean)).size
  }, [filteredRows])

  const activeFilterCount = featureFilters.length
  const hasActiveFilters =
    activeFilterCount > 0 || Boolean(searchQuery.trim()) || quickPreset !== 'none'

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('logs.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Logs')}</h1>
            <button
              type="button"
              className={`btn-page-info ${isSummaryInfoOpen ? 'is-active' : ''}`}
              aria-label={
                isSummaryInfoOpen
                  ? t('common.hideSummaryInfo')
                  : t('common.showSummaryInfo')
              }
              aria-expanded={isSummaryInfoOpen}
              onClick={onToggleSummaryInfo}
            >
              i
            </button>
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
              <button
                className={`btn-ghost btn-filter ${isFilterOpen ? 'is-active' : ''}`}
                type="button"
                aria-label={t('common.filters')}
                onClick={() => {
                  setFeatureFilterDraft([...featureFilters])
                  setIsFilterOpen(true)
                }}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  width="16"
                  height="16"
                >
                  <path
                    d="M3 4h14l-5.5 6.2V16l-3-1.5v-4.3L3 4z"
                    fill="currentColor"
                  />
                </svg>
                {activeFilterCount > 0 ? (
                  <span className="filter-badge">{activeFilterCount}</span>
                ) : null}
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => void fetchLogs()}
                disabled={isLoading}
                aria-label={t('common.refresh')}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  width="16"
                  height="16"
                >
                  <path
                    d="M16 4v5h-5l1.8-1.8a4.5 4.5 0 1 0 1.3 4.3h1.9a6.5 6.5 0 1 1-1.9-4.6L16 4z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {error ? <div className="alert">{error}</div> : null}

      <section
        className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}
      >
        <div className="card card-compact">
          <p className="card-label">{t('logs.totalEvents')}</p>
          <p className="card-value">{filteredRows.length}</p>
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

        {isFilterOpen ? (
          <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="modal modal-scrollable">
              <div className="modal-header">
                <div>
                  <h3 className="modal-title">{t('common.filters')}</h3>
                  <p className="modal-subtitle">{t('logs.filterSubtitle')}</p>
                </div>
                <button
                  className="btn-icon"
                  type="button"
                  onClick={() => setIsFilterOpen(false)}
                  aria-label={t('common.closeFilters')}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <div className="filter-grid">
                  <div className="filter-group">
                    <p className="filter-title">{t('logs.feature')}</p>
                    <div className="filter-options">
                      {FEATURE_OPTIONS.map((option) => {
                        const isChecked = featureFilterDraft.includes(option)
                        return (
                          <label className="filter-option" key={option}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(event) => {
                                setFeatureFilterDraft((current) => {
                                  if (event.target.checked) {
                                    return [...current, option]
                                  }
                                  return current.filter((value) => value !== option)
                                })
                              }}
                            />
                            <span>{translatePage(t, option)}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setFeatureFilterDraft([])}
                >
                  {t('common.clear')}
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => {
                    setFeatureFilters([...featureFilterDraft])
                    setIsFilterOpen(false)
                  }}
                >
                  {t('common.applyFilters')}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <div className="table-wrapper" aria-busy={isLoading}>
          <table className="data-table data-table-logs">
            <thead>
              <tr>
                <th scope="col">{t('logs.user')}</th>
                <th scope="col">{t('logs.feature')}</th>
                <th scope="col">{t('common.date')}</th>
                <th scope="col" className="mobile-quick-filter-col">
                  <button
                    className={`btn-quick-filter ${
                      quickPreset === 'today' ? 'is-active' : ''
                    }`}
                    type="button"
                    aria-pressed={quickPreset === 'today'}
                    onClick={() =>
                      setQuickPreset((current) =>
                        current === 'today' ? 'none' : 'today',
                      )
                    }
                  >
                    {t('common.quickFilterToday')}
                    <span className="quick-filter-indicator" aria-hidden="true" />
                  </button>
                </th>
                <th scope="col" className="mobile-quick-filter-col">
                  <button
                    className={`btn-quick-filter ${
                      quickPreset === 'last100' ? 'is-active' : ''
                    }`}
                    type="button"
                    aria-pressed={quickPreset === 'last100'}
                    onClick={() =>
                      setQuickPreset((current) =>
                        current === 'last100' ? 'none' : 'last100',
                      )
                    }
                  >
                    {t('common.quickFilterLast100')}
                    <span className="quick-filter-indicator" aria-hidden="true" />
                  </button>
                </th>
                <th scope="col">{t('logs.summary')}</th>
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
                    {hasActiveFilters ? t('logs.emptyFiltered') : t('logs.empty')}
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
