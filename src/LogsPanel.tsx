import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ACTIVITY_LOG_VISIBLE_FROM,
  isVisitTaskActivitySummary,
  logMatchesProperty,
  logMatchesUsers,
  propertyMatchLabels,
} from '../amplify/functions/shared/activity-log-policy'
import { translatePage } from './i18n/display'
import { authFetch } from './lib/auth-fetch'
import { cognitoUserLabel, loadCognitoUserOptions, type CognitoUserOption } from './lib/cognito-users'
import { MobileBodyPortal } from './MobileBodyPortal'
import { YlIcon } from './design/icons'
import { fetchJson } from './operations/api'
import { filterPropertySelectOptions, getPropertyLabel } from './operations/propertyHelpers'
import type { PropertyOption } from './operations/types'

type ActivityLogRow = {
  id: string
  userEmail: string
  feature: string
  summary: string
  createdAt: string
  action?: string
  entityId?: string
  entityName?: string
  propertyId?: string
  propertyName?: string
}

type LogsApiResponse = {
  items?: ActivityLogRow[]
  count?: number
  lastEvaluatedKey?: Record<string, unknown> | null
  truncated?: boolean
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
  'Bookings Plan',
  'Check-in Tracker',
  'Bookings settings',
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
  'Property Reports',
  'Reports Settings',
  'Property Groups',
  'Movements',
  'Services & Subscriptions',
  'Slack',
  'Agent Studio',
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

const mapLogProperty = (item: Record<string, unknown>): PropertyOption => {
  const id = String(item.id ?? '')
  const nicknameRaw = String(item.nickname ?? item.Nickname ?? '')
  const listingNickname = String(item.ListingNickname ?? item.listingNickname ?? '')
  const title = String(item.title ?? '')
  const mtlPrincipalId = String(
    item.MTL_PRINCIPALID ?? item.mtlPrincipalId ?? item.MTL_PRINCIPAL_ID ?? '',
  ).trim()
  return {
    id,
    nickname: nicknameRaw,
    title,
    listingNickname,
    type: String(item.type ?? item.Type ?? '').trim() || undefined,
    abbreviation: String(item.abbreviation ?? '').trim() || undefined,
    mtlPrincipalId: mtlPrincipalId || undefined,
  }
}

const labelsForProperty = (property: PropertyOption) =>
  propertyMatchLabels([
    getPropertyLabel(property),
    property.nickname,
    property.listingNickname,
    property.title,
  ])

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
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [featureFilters, setFeatureFilters] = useState<string[]>([])
  const [featureFilterDraft, setFeatureFilterDraft] = useState<string[]>([])
  const [userFilters, setUserFilters] = useState<string[]>([])
  const [userFilterDraft, setUserFilterDraft] = useState<string[]>([])
  const [propertyFilters, setPropertyFilters] = useState<string[]>([])
  const [propertyFilterDraft, setPropertyFilterDraft] = useState<string[]>([])
  const [userListQuery, setUserListQuery] = useState('')
  const [propertyListQuery, setPropertyListQuery] = useState('')
  const [propertyOptions, setPropertyOptions] = useState<PropertyOption[]>([])
  const [cognitoUsers, setCognitoUsers] = useState<CognitoUserOption[]>([])
  const [quickPreset, setQuickPreset] = useState<LogsQuickPreset>('none')
  const [nextKey, setNextKey] = useState<Record<string, unknown> | null>(null)
  const [truncated, setTruncated] = useState(false)
  const requestSeq = useRef(0)
  const hiddenPageLoads = useRef(0)

  const fetchLogs = useCallback(
    async (options?: { cursor?: Record<string, unknown> | null }) => {
      const endpoint = getEndpoint(
        'getActivityLogsUrl',
        import.meta.env.VITE_GET_ACTIVITY_LOGS_URL,
      )
      if (!endpoint) {
        setError(t('logs.missingEndpoint'))
        return
      }

      const append = Boolean(options?.cursor)
      const seq = ++requestSeq.current
      if (append) {
        setIsLoadingMore(true)
      } else {
        hiddenPageLoads.current = 0
        setIsLoading(true)
        setNextKey(null)
        setTruncated(false)
      }
      setError(null)

      try {
        const params = new URLSearchParams()
        params.set('limit', quickPreset === 'last100' ? '100' : '200')
        if (featureFilters.length === 1) {
          params.set('feature', featureFilters[0])
        } else if (featureFilters.length > 1) {
          params.set('features', featureFilters.join(','))
        }
        const query = searchQuery.trim()
        if (query) {
          params.set('q', query)
        }
        const startOfToday = new Date()
        startOfToday.setHours(0, 0, 0, 0)
        const from =
          quickPreset === 'today' &&
          startOfToday.toISOString() > ACTIVITY_LOG_VISIBLE_FROM
            ? startOfToday.toISOString()
            : ACTIVITY_LOG_VISIBLE_FROM
        params.set('from', from)
        if (userFilters.length > 0) {
          params.set('users', userFilters.join(','))
        }
        if (propertyFilters.length > 0) {
          params.set('propertyIds', propertyFilters.join(','))
          const names = propertyOptions
            .filter((property) => propertyFilters.includes(property.id))
            .flatMap((property) => labelsForProperty(property))
          if (names.length > 0) {
            params.set('propertyNames', JSON.stringify([...new Set(names)]))
          }
        }
        if (options?.cursor) {
          params.set('exclusiveStartKey', JSON.stringify(options.cursor))
        }
        const separator = endpoint.includes('?') ? '&' : '?'
        const response = await authFetch(
          `${endpoint}${separator}${params.toString()}`,
        )
        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(
            `Logs request failed (${response.status}). ${errorText}`.trim(),
          )
        }
        const payload = (await response.json()) as LogsApiResponse
        if (seq !== requestSeq.current) {
          return
        }
        const items = Array.isArray(payload.items) ? payload.items : []
        setRows((current) => (append ? [...current, ...items] : items))
        setNextKey(payload.lastEvaluatedKey ?? null)
        setTruncated(Boolean(payload.truncated))
        setLastUpdated(new Date().toISOString())
      } catch (requestError) {
        if (seq !== requestSeq.current) {
          return
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : t('logs.loadError'),
        )
      } finally {
        if (seq === requestSeq.current) {
          setIsLoading(false)
          setIsLoadingMore(false)
        }
      }
    },
    [featureFilters, getEndpoint, propertyFilters, propertyOptions, quickPreset, searchQuery, t, userFilters],
  )

  useEffect(() => {
    const delay = searchQuery.trim() ? 400 : 0
    const handle = window.setTimeout(() => {
      void fetchLogs()
    }, delay)
    return () => window.clearTimeout(handle)
  }, [fetchLogs, searchQuery])

  useEffect(() => {
    const propertiesEndpoint = getEndpoint(
      'getPropertiesUrl',
      import.meta.env.VITE_GET_PROPERTIES_URL,
    )
    const usersEndpoint = getEndpoint(
      'getCognitoUsersUrl',
      import.meta.env.VITE_GET_COGNITO_USERS_URL,
    )
    let cancelled = false

    const loadFilterOptions = async () => {
      if (propertiesEndpoint) {
        try {
          const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
            propertiesEndpoint,
          )
          if (!cancelled) {
            setPropertyOptions(
              filterPropertySelectOptions(
                (payload.items ?? []).map(mapLogProperty),
              ),
            )
          }
        } catch {
          if (!cancelled) {
            setPropertyOptions([])
          }
        }
      }
      if (usersEndpoint) {
        try {
          const users = await loadCognitoUserOptions(usersEndpoint)
          if (!cancelled) {
            setCognitoUsers(users)
          }
        } catch {
          if (!cancelled) {
            setCognitoUsers([])
          }
        }
      }
    }

    void loadFilterOptions()
    return () => {
      cancelled = true
    }
  }, [getEndpoint])

  const selectedPropertyNames = useMemo(() => {
    const selected = new Set(propertyFilters)
    return [
      ...new Set(
        propertyOptions
          .filter((property) => selected.has(property.id))
          .flatMap((property) => labelsForProperty(property)),
      ),
    ]
  }, [propertyFilters, propertyOptions])

  const userOptions = useMemo(() => {
    const byEmail = new Map<string, string>()
    for (const user of cognitoUsers) {
      byEmail.set(user.email, cognitoUserLabel(user))
    }
    for (const row of rows) {
      const email = row.userEmail.trim().toLowerCase()
      if (!email || email === 'system' || byEmail.has(email)) {
        continue
      }
      byEmail.set(email, row.userEmail.trim())
    }
    return [...byEmail.entries()]
      .map(([email, label]) => ({ email, label }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
      )
  }, [cognitoUsers, rows])

  const filteredUserOptions = useMemo(() => {
    const query = userListQuery.trim().toLowerCase()
    if (!query) {
      return userOptions
    }
    return userOptions.filter(
      (option) =>
        option.email.includes(query) ||
        option.label.toLowerCase().includes(query),
    )
  }, [userListQuery, userOptions])

  const filteredPropertyOptions = useMemo(() => {
    const query = propertyListQuery.trim().toLowerCase()
    if (!query) {
      return propertyOptions
    }
    return propertyOptions.filter((property) =>
      getPropertyLabel(property).toLowerCase().includes(query),
    )
  }, [propertyListQuery, propertyOptions])

  const visibleRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    let next = rows.filter(
      (row) =>
        row.createdAt >= ACTIVITY_LOG_VISIBLE_FROM &&
        !isVisitTaskActivitySummary(row.summary),
    )

    if (featureFilters.length > 0) {
      const selected = new Set(featureFilters)
      next = next.filter((row) => selected.has(row.feature))
    }

    if (userFilters.length > 0) {
      next = next.filter((row) => logMatchesUsers(row.userEmail, userFilters))
    }

    if (propertyFilters.length > 0) {
      next = next.filter((row) =>
        logMatchesProperty(row, propertyFilters, selectedPropertyNames),
      )
    }

    if (query) {
      next = next.filter((row) => {
        const featureLabel = translatePage(t, row.feature).toLowerCase()
        return (
          row.userEmail.toLowerCase().includes(query) ||
          row.feature.toLowerCase().includes(query) ||
          featureLabel.includes(query) ||
          row.summary.toLowerCase().includes(query) ||
          (row.action ?? '').toLowerCase().includes(query) ||
          (row.entityName ?? '').toLowerCase().includes(query) ||
          (row.propertyName ?? '').toLowerCase().includes(query)
        )
      })
    }

    if (quickPreset === 'today') {
      next = next.filter((row) => isSameLocalDay(row.createdAt))
    }

    return next
  }, [
    featureFilters,
    propertyFilters,
    quickPreset,
    rows,
    searchQuery,
    selectedPropertyNames,
    t,
    userFilters,
  ])

  useEffect(() => {
    if (
      isLoading ||
      isLoadingMore ||
      !nextKey ||
      quickPreset === 'last100' ||
      rows.length === 0 ||
      visibleRows.length > 0 ||
      hiddenPageLoads.current >= 6
    ) {
      return
    }
    hiddenPageLoads.current += 1
    void fetchLogs({ cursor: nextKey })
  }, [
    fetchLogs,
    isLoading,
    isLoadingMore,
    nextKey,
    quickPreset,
    rows.length,
    visibleRows.length,
  ])

  const uniqueUsers = useMemo(() => {
    return new Set(visibleRows.map((row) => row.userEmail).filter(Boolean)).size
  }, [visibleRows])

  const activeFilterCount =
    featureFilters.length + userFilters.length + propertyFilters.length
  const hasActiveFilters =
    activeFilterCount > 0 || Boolean(searchQuery.trim()) || quickPreset !== 'none'
  const canLoadMore =
    Boolean(nextKey) && quickPreset !== 'last100' && !isLoading

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
              <YlIcon name="info.circle" size={14} />
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
                  <YlIcon name="xmark" size={16} />
                ) : (
                  <YlIcon name="magnifyingglass" size={16} />
                )}
              </button>
              <button
                className={`btn-ghost btn-filter ${isFilterOpen ? 'is-active' : ''}`}
                type="button"
                aria-label={t('common.filters')}
                onClick={() => {
                  setFeatureFilterDraft([...featureFilters])
                  setUserFilterDraft([...userFilters])
                  setPropertyFilterDraft([...propertyFilters])
                  setUserListQuery('')
                  setPropertyListQuery('')
                  setIsFilterOpen(true)
                }}
              >
                <YlIcon name="line.3.horizontal.decrease" size={16} />
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
                <YlIcon name="arrow.clockwise" size={16} />
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
          <p className="card-value">{visibleRows.length}</p>
          <p className="card-meta">
            {canLoadMore
              ? t('logs.loadedWithMore')
              : t('logs.loadedEvents', { count: visibleRows.length })}
          </p>
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
            <div className="modal modal-wide modal-scrollable">
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
                  <YlIcon name="xmark" size={16} />
                </button>
              </div>
              <div className="modal-body">
                <div className="filter-grid filter-grid-3">
                  <div className="filter-group">
                    <p className="filter-title">{t('logs.user')}</p>
                    <input
                      className="search-input filter-list-search"
                      type="search"
                      value={userListQuery}
                      placeholder={t('logs.searchUsers')}
                      aria-label={t('logs.searchUsers')}
                      onChange={(event) => setUserListQuery(event.target.value)}
                    />
                    <div className="filter-options filter-options-scroll">
                      {filteredUserOptions.length === 0 ? (
                        <p className="filter-empty">{t('logs.noFilterOptions')}</p>
                      ) : (
                        filteredUserOptions.map((option) => {
                          const isChecked = userFilterDraft.includes(option.email)
                          return (
                            <label className="filter-option" key={option.email}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(event) => {
                                  setUserFilterDraft((current) => {
                                    if (event.target.checked) {
                                      return [...current, option.email]
                                    }
                                    return current.filter(
                                      (value) => value !== option.email,
                                    )
                                  })
                                }}
                              />
                              <span>{option.label}</span>
                            </label>
                          )
                        })
                      )}
                    </div>
                  </div>
                  <div className="filter-group">
                    <p className="filter-title">{t('logs.property')}</p>
                    <input
                      className="search-input filter-list-search"
                      type="search"
                      value={propertyListQuery}
                      placeholder={t('logs.searchProperties')}
                      aria-label={t('logs.searchProperties')}
                      onChange={(event) =>
                        setPropertyListQuery(event.target.value)
                      }
                    />
                    <div className="filter-options filter-options-scroll">
                      {filteredPropertyOptions.length === 0 ? (
                        <p className="filter-empty">{t('logs.noFilterOptions')}</p>
                      ) : (
                        filteredPropertyOptions.map((property) => {
                          const isChecked = propertyFilterDraft.includes(property.id)
                          return (
                            <label className="filter-option" key={property.id}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(event) => {
                                  setPropertyFilterDraft((current) => {
                                    if (event.target.checked) {
                                      return [...current, property.id]
                                    }
                                    return current.filter(
                                      (value) => value !== property.id,
                                    )
                                  })
                                }}
                              />
                              <span>{getPropertyLabel(property)}</span>
                            </label>
                          )
                        })
                      )}
                    </div>
                  </div>
                  <div className="filter-group">
                    <p className="filter-title">{t('logs.feature')}</p>
                    <div className="filter-options filter-options-scroll">
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
                  onClick={() => {
                    setFeatureFilterDraft([])
                    setUserFilterDraft([])
                    setPropertyFilterDraft([])
                    setUserListQuery('')
                    setPropertyListQuery('')
                  }}
                >
                  {t('common.clear')}
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() => {
                    setFeatureFilters([...featureFilterDraft])
                    setUserFilters([...userFilterDraft])
                    setPropertyFilters([...propertyFilterDraft])
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
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td className="table-empty" colSpan={4}>
                    {hasActiveFilters ? t('logs.emptyFiltered') : t('logs.empty')}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.id || `${row.createdAt}-${row.summary}`}>
                    <td data-label={t('logs.user')}>{row.userEmail || 'system'}</td>
                    <td data-label={t('logs.feature')}>{translatePage(t, row.feature)}</td>
                    <td data-label={t('common.date')}>{formatLogDate(row.createdAt, i18n.language)}</td>
                    <td data-label={t('logs.summary')}>{row.summary}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {truncated ? (
          <p className="notice">{t('logs.truncated')}</p>
        ) : null}
        {canLoadMore ? (
          <div className="logs-load-more">
            <button
              className="btn-secondary"
              type="button"
              disabled={isLoadingMore}
              onClick={() => void fetchLogs({ cursor: nextKey })}
            >
              {isLoadingMore ? t('logs.loadingMore') : t('logs.loadMore')}
            </button>
          </div>
        ) : null}
      </section>
    </>
  )
}
