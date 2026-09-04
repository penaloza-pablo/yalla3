import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ACTION_KEYS } from '../amplify/functions/shared/rbac-catalog'
import { usePermissions } from './rbac/PermissionsProvider'
import { displayInventoryName, translatePage } from './i18n/display'
import { authFetch } from './lib/auth-fetch'
import { MobileBodyPortal } from './MobileBodyPortal'

type SpotCheckRow = {
  id: string
  userEmail: string
  location: string
  locationKey: string
  createdAt: string
  itemCount: number
  changedCount: number
  categories: string[]
}

type InventoryItem = {
  id: string
  name: string
  nameEs: string
  location: string
  category: string
  quantity: number
}

type ItemDisposition = 'none' | 'check' | 'skip'

type DraftItem = InventoryItem & {
  draftQuantity: number
  disposition: ItemDisposition
}

type LocationQuickFilter = 'none' | 'JCL' | 'P2'
type WizardStep = 'filters' | 'count'

type SpotCheckPanelProps = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  isMobileSearchOpen: boolean
  onToggleMobileSearch: () => void
  isSummaryInfoOpen: boolean
  onToggleSummaryInfo: () => void
}

const formatSpotCheckDate = (value: string, locale: string) => {
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

const matchesLocationKey = (location: string, key: LocationQuickFilter) => {
  if (key === 'none') {
    return true
  }
  if (key === 'JCL') {
    return /jcl/i.test(location)
  }
  return /p2/i.test(location)
}

const clampQuantity = (value: number) => Math.max(0, Math.trunc(value))

const CheckIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
    <path
      d="M7.8 13.4 4.6 10.2l1.4-1.4 1.8 1.8 5.4-5.4 1.4 1.4-6.8 6.8z"
      fill="currentColor"
    />
  </svg>
)

const ResetIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
    <path
      d="M10 3.2a6.8 6.8 0 1 0 6.4 8.9l-1.6-.6A5.2 5.2 0 1 1 10 4.8V7l3.2-3.2L10 .6V3.2z"
      fill="currentColor"
    />
  </svg>
)

const SkipIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
    <path d="M4 4.5v11l7.5-5.5L4 4.5zm9.5 0h2v11h-2v-11z" fill="currentColor" />
  </svg>
)

const BackIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
    <path
      d="M12.7 4.3 7 10l5.7 5.7 1.4-1.4L9.8 10l4.3-4.3-1.4-1.4z"
      fill="currentColor"
    />
  </svg>
)

const CompleteIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
    <path
      d="M10 1.8a8.2 8.2 0 1 0 0 16.4 8.2 8.2 0 0 0 0-16.4zm0 1.6a6.6 6.6 0 1 1 0 13.2 6.6 6.6 0 0 1 0-13.2zm3.3 3.7-4.7 4.7-2.2-2.2-1.3 1.3 3.5 3.5 6-6-1.3-1.3z"
      fill="currentColor"
    />
  </svg>
)

export function SpotCheckPanel({
  getEndpoint,
  searchQuery,
  onSearchQueryChange,
  isMobileSearchOpen,
  onToggleMobileSearch,
  isSummaryInfoOpen,
  onToggleSummaryInfo,
}: SpotCheckPanelProps) {
  const { t, i18n } = useTranslation()
  const { can } = usePermissions()
  const [rows, setRows] = useState<SpotCheckRow[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wizardError, setWizardError] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc')
  const [locationFilter, setLocationFilter] =
    useState<LocationQuickFilter>('none')
  const [isListFilterOpen, setIsListFilterOpen] = useState(false)
  const [filters, setFilters] = useState<{
    locations: string[]
    categories: string[]
  }>({
    locations: [],
    categories: [],
  })
  const [filterDraft, setFilterDraft] = useState<{
    locations: string[]
    categories: string[]
  }>({
    locations: [],
    categories: [],
  })
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<WizardStep>('filters')
  const [selectedLocation, setSelectedLocation] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])

  const isCounting = wizardStep === 'count' && draftItems.length > 0

  const fetchSpotChecks = useCallback(async () => {
    const endpoint = getEndpoint(
      'getSpotChecksUrl',
      import.meta.env.VITE_GET_SPOT_CHECKS_URL,
    )
    if (!endpoint) {
      setError(t('spotCheck.missingEndpoint'))
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const response = await authFetch(`${endpoint}?limit=200`)
      if (!response.ok) {
        throw new Error('Failed to load spot checks.')
      }
      const payload = (await response.json()) as { items?: SpotCheckRow[] }
      setRows(
        Array.isArray(payload.items)
          ? payload.items.map((item) => ({
              ...item,
              categories: Array.isArray(item.categories) ? item.categories : [],
            }))
          : [],
      )
    } catch {
      setError(t('spotCheck.loadError'))
    } finally {
      setIsLoading(false)
    }
  }, [getEndpoint, t])

  const fetchInventoryItems = useCallback(async () => {
    const endpoint = getEndpoint(
      'getInventoryUrl',
      import.meta.env.VITE_GET_INVENTORY_URL,
    )
    if (!endpoint) {
      return
    }
    try {
      const response = await authFetch(endpoint)
      if (!response.ok) {
        return
      }
      const payload = (await response.json()) as {
        items?: Record<string, unknown>[]
      }
      const mapped = (payload.items ?? []).map((entry) => ({
        id: String(entry.id ?? ''),
        name: String(entry['Item name'] ?? entry.name ?? ''),
        nameEs: String(entry.nameEs ?? ''),
        location: String(entry.Location ?? entry.location ?? ''),
        category: String(entry.category ?? ''),
        quantity: Number(entry.Quantity ?? entry.quantity ?? 0) || 0,
      }))
      setInventoryItems(mapped.filter((item) => item.id && item.location))
    } catch {
      // Inventory options stay empty; wizard will show the empty state.
    }
  }, [getEndpoint])

  useEffect(() => {
    void fetchSpotChecks()
    void fetchInventoryItems()
  }, [fetchInventoryItems, fetchSpotChecks])

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return rows.filter((row) => {
      if (!matchesLocationKey(row.location, locationFilter)) {
        return false
      }
      if (
        filters.locations.length > 0 &&
        !filters.locations.includes(row.location)
      ) {
        return false
      }
      if (
        filters.categories.length > 0 &&
        !row.categories.some((category) =>
          filters.categories.includes(category),
        )
      ) {
        return false
      }
      if (!query) {
        return true
      }
      return [row.userEmail, row.location, row.id, ...row.categories]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [filters.categories, filters.locations, locationFilter, rows, searchQuery])

  const sortedRows = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1
    return [...filteredRows].sort((a, b) => {
      const left = new Date(a.createdAt).getTime() || 0
      const right = new Date(b.createdAt).getTime() || 0
      return (left - right) * direction
    })
  }, [filteredRows, sortDirection])

  const locationOptions = useMemo(() => {
    const unique = new Set(
      inventoryItems.map((item) => item.location).filter(Boolean),
    )
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [inventoryItems])

  const categoryOptions = useMemo(() => {
    const unique = new Set(
      inventoryItems
        .filter((item) => !selectedLocation || item.location === selectedLocation)
        .map((item) => item.category)
        .filter(Boolean),
    )
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [inventoryItems, selectedLocation])

  const listLocationOptions = useMemo(() => {
    const unique = new Set<string>()
    inventoryItems.forEach((item) => {
      if (item.location) {
        unique.add(item.location)
      }
    })
    rows.forEach((row) => {
      if (row.location) {
        unique.add(row.location)
      }
    })
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [inventoryItems, rows])

  const listCategoryOptions = useMemo(() => {
    const unique = new Set<string>()
    inventoryItems.forEach((item) => {
      if (item.category) {
        unique.add(item.category)
      }
    })
    rows.forEach((row) => {
      row.categories.forEach((category) => {
        if (category) {
          unique.add(category)
        }
      })
    })
    return Array.from(unique).sort((a, b) => a.localeCompare(b))
  }, [inventoryItems, rows])

  const activeFilterCount = filters.locations.length + filters.categories.length

  const pendingCount = draftItems.filter(
    (item) => item.disposition === 'none',
  ).length
  const skippedCount = draftItems.filter(
    (item) => item.disposition === 'skip',
  ).length

  const openWizard = () => {
    setWizardStep('filters')
    setSelectedLocation(locationOptions[0] ?? '')
    setSelectedCategories([])
    setDraftItems([])
    setWizardError(null)
    setIsFilterModalOpen(true)
    if (inventoryItems.length === 0) {
      void fetchInventoryItems()
    }
  }

  const closeFilterModal = () => {
    if (isSaving) {
      return
    }
    setIsFilterModalOpen(false)
  }

  const leaveCountSession = () => {
    if (isSaving) {
      return
    }
    setWizardStep('filters')
    setDraftItems([])
    setWizardError(null)
    setIsFilterModalOpen(true)
  }

  const goToCountStep = () => {
    if (!selectedLocation) {
      setWizardError(t('spotCheck.locationRequired'))
      return
    }
    if (selectedCategories.length === 0) {
      setWizardError(t('spotCheck.categoryRequired'))
      return
    }
    const nextItems = inventoryItems
      .filter(
        (item) =>
          item.location === selectedLocation &&
          selectedCategories.includes(item.category),
      )
      .map((item) => ({
        ...item,
        draftQuantity: item.quantity,
        disposition: 'none' as const,
      }))
    if (nextItems.length === 0) {
      setWizardError(t('spotCheck.noMatchingItems'))
      return
    }
    setWizardError(null)
    setDraftItems(nextItems)
    setWizardStep('count')
    setIsFilterModalOpen(false)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const adjustQuantity = (id: string, delta: number) => {
    setDraftItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              draftQuantity: clampQuantity(item.draftQuantity + delta),
            }
          : item,
      ),
    )
  }

  const setQuantity = (id: string, value: string) => {
    const parsed = Number(value)
    setDraftItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              draftQuantity: Number.isFinite(parsed)
                ? clampQuantity(parsed)
                : item.draftQuantity,
            }
          : item,
      ),
    )
  }

  const setDisposition = (id: string, disposition: ItemDisposition) => {
    setDraftItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, disposition } : item,
      ),
    )
  }

  const resetItem = (id: string) => {
    setDraftItems((current) =>
      current.map((item) =>
        item.id === id
          ? {
              ...item,
              draftQuantity: item.quantity,
              disposition: 'none',
            }
          : item,
      ),
    )
  }

  const completeSpotCheck = async () => {
    if (draftItems.length === 0) {
      return
    }
    if (pendingCount > 0) {
      window.alert(t('spotCheck.allMustBeResolved', { count: pendingCount }))
      return
    }
    if (skippedCount > 0) {
      const shouldContinue = window.confirm(
        t('spotCheck.skippedWarning', { count: skippedCount }),
      )
      if (!shouldContinue) {
        return
      }
    }

    const endpoint = getEndpoint(
      'completeSpotCheckUrl',
      import.meta.env.VITE_COMPLETE_SPOT_CHECK_URL,
    )
    if (!endpoint) {
      setError(t('spotCheck.missingCompleteEndpoint'))
      return
    }

    setIsSaving(true)
    setWizardError(null)
    setError(null)
    try {
      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          location: selectedLocation,
          categories: selectedCategories,
          items: draftItems.map((item) => ({
            id: item.id,
            quantity: item.draftQuantity,
            skipped: item.disposition === 'skip',
          })),
        }),
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText)
      }
      setWizardStep('filters')
      setDraftItems([])
      await fetchSpotChecks()
      await fetchInventoryItems()
    } catch {
      setWizardError(t('spotCheck.saveError'))
    } finally {
      setIsSaving(false)
    }
  }

  const toggleLocationFilter = (key: Exclude<LocationQuickFilter, 'none'>) => {
    setLocationFilter((current) => (current === key ? 'none' : key))
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('spotCheck.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{translatePage(t, 'Spot Check')}</h1>
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
          <p className="subtitle">{t('spotCheck.subtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div
            className={`page-action-bar ${
              isMobileSearchOpen ? 'is-search-open' : ''
            }`}
          >
            {!isCounting ? (
              <input
                className="search-input"
                placeholder={t('spotCheck.search')}
                type="search"
                aria-label={t('spotCheck.search')}
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
              />
            ) : null}
            <div className="header-actions">
              {isCounting ? (
                <>
                  <button
                    className="btn-ghost"
                    type="button"
                    onClick={leaveCountSession}
                    disabled={isSaving}
                    aria-label={t('common.back')}
                  >
                    <BackIcon />
                  </button>
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={() => void completeSpotCheck()}
                    disabled={isSaving || pendingCount > 0}
                    aria-label={t('spotCheck.complete')}
                    title={
                      pendingCount > 0
                        ? t('spotCheck.allMustBeResolved', { count: pendingCount })
                        : t('spotCheck.complete')
                    }
                  >
                    {isSaving ? (
                      t('common.saving')
                    ) : (
                      <>
                        <CompleteIcon />
                        <span className="spot-check-complete-label">
                          {t('spotCheck.complete')}
                        </span>
                      </>
                    )}
                  </button>
                </>
              ) : (
                <>
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
                    className={`btn-ghost btn-filter ${
                      isListFilterOpen ? 'is-active' : ''
                    }`}
                    type="button"
                    aria-label={t('common.filters')}
                    onClick={() => {
                      setFilterDraft({
                        locations: [...filters.locations],
                        categories: [...filters.categories],
                      })
                      setIsListFilterOpen(true)
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
                  {can(ACTION_KEYS.spotCheckCreate) ? (
                  <button
                    className="btn-ghost"
                    type="button"
                    onClick={openWizard}
                    aria-label={t('spotCheck.new')}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      width="16"
                      height="16"
                    >
                      <path
                        d="M9 4h2v5h5v2h-5v5H9v-5H4V9h5V4z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                  ) : null}
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={() => void fetchSpotChecks()}
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
                </>
              )}
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {error ? <div className="alert">{error}</div> : null}
      {isCounting && wizardError ? (
        <div className="alert">{wizardError}</div>
      ) : null}

      {isCounting ? (
        <ul className="spot-check-list">
          {draftItems.map((item) => (
            <li
              className={`spot-check-item ${
                item.disposition === 'check'
                  ? 'is-confirmed'
                  : item.disposition === 'skip'
                    ? 'is-skipped'
                    : ''
              }`}
              key={item.id}
            >
              <div className="spot-check-item-header">
                <p className="spot-check-item-name">
                  {displayInventoryName(i18n.language, item.name, item.nameEs)}
                </p>
                <p className="spot-check-item-meta">{item.category}</p>
              </div>
              <div className="spot-check-qty-row">
                <button
                  className="btn-secondary spot-check-qty-btn"
                  type="button"
                  onClick={() => adjustQuantity(item.id, -10)}
                  disabled={item.disposition === 'skip'}
                >
                  {t('spotCheck.minus10')}
                </button>
                <button
                  className="btn-secondary spot-check-qty-btn"
                  type="button"
                  onClick={() => adjustQuantity(item.id, -1)}
                  disabled={item.disposition === 'skip'}
                >
                  {t('spotCheck.minus1')}
                </button>
                <input
                  className="spot-check-qty-input"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={item.draftQuantity}
                  onChange={(event) => setQuantity(item.id, event.target.value)}
                  aria-label={t('common.quantity')}
                  disabled={item.disposition === 'skip'}
                />
                <button
                  className="btn-secondary spot-check-qty-btn"
                  type="button"
                  onClick={() => adjustQuantity(item.id, 1)}
                  disabled={item.disposition === 'skip'}
                >
                  {t('spotCheck.plus1')}
                </button>
                <button
                  className="btn-secondary spot-check-qty-btn"
                  type="button"
                  onClick={() => adjustQuantity(item.id, 10)}
                  disabled={item.disposition === 'skip'}
                >
                  {t('spotCheck.plus10')}
                </button>
              </div>
              <div className="spot-check-item-actions">
                <button
                  className={`btn-icon btn-icon-ghost ${
                    item.disposition === 'check' ? 'is-task-complete' : ''
                  }`}
                  type="button"
                  onClick={() => setDisposition(item.id, 'check')}
                  aria-label={t('spotCheck.confirm')}
                  aria-pressed={item.disposition === 'check'}
                >
                  <CheckIcon />
                </button>
                <button
                  className="btn-icon btn-icon-ghost"
                  type="button"
                  onClick={() => resetItem(item.id)}
                  aria-label={t('spotCheck.reset')}
                >
                  <ResetIcon />
                </button>
                <button
                  className={`btn-icon btn-icon-ghost ${
                    item.disposition === 'skip' ? 'is-skipped' : ''
                  }`}
                  type="button"
                  onClick={() => setDisposition(item.id, 'skip')}
                  aria-label={t('spotCheck.skip')}
                  aria-pressed={item.disposition === 'skip'}
                >
                  <SkipIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <section
            className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}
          >
            <div className="card card-compact">
              <p className="card-label">{t('spotCheck.totalChecks')}</p>
              <p className="card-value">{filteredRows.length}</p>
              <p className="card-meta">{t('spotCheck.recentChecks')}</p>
            </div>
            <div className="card card-compact">
              <p className="card-label">{t('common.location')}</p>
              <p className="card-value">
                {locationFilter === 'none'
                  ? t('spotCheck.allLocations')
                  : locationFilter}
              </p>
              <p className="card-meta">{t('spotCheck.visibleInList')}</p>
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">{t('spotCheck.cardTitle')}</h2>
                <p className="card-subtitle">{t('spotCheck.cardSubtitle')}</p>
              </div>
            </div>
            <div className="table-wrapper" aria-busy={isLoading}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <button
                        className={`btn-sort ${sortDirection ? 'is-active' : ''}`}
                        type="button"
                        onClick={() =>
                          setSortDirection((current) =>
                            current === 'desc' ? 'asc' : 'desc',
                          )
                        }
                      >
                        {t('common.date')}
                        <span className="sort-indicator">
                          {sortDirection === 'asc' ? '▲' : '▼'}
                        </span>
                      </button>
                    </th>
                    <th scope="col">{t('logs.user')}</th>
                    <th scope="col">{t('common.location')}</th>
                    <th scope="col" className="mobile-quick-filter-col">
                      <button
                        className={`btn-quick-filter ${
                          locationFilter === 'JCL' ? 'is-active' : ''
                        }`}
                        type="button"
                        aria-pressed={locationFilter === 'JCL'}
                        onClick={() => toggleLocationFilter('JCL')}
                      >
                        JCL
                        <span
                          className="quick-filter-indicator"
                          aria-hidden="true"
                        />
                      </button>
                    </th>
                    <th scope="col" className="mobile-quick-filter-col">
                      <button
                        className={`btn-quick-filter ${
                          locationFilter === 'P2' ? 'is-active' : ''
                        }`}
                        type="button"
                        aria-pressed={locationFilter === 'P2'}
                        onClick={() => toggleLocationFilter('P2')}
                      >
                        P2
                        <span
                          className="quick-filter-indicator"
                          aria-hidden="true"
                        />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td className="table-empty" colSpan={5}>
                        {t('spotCheck.loading')}
                      </td>
                    </tr>
                  ) : sortedRows.length === 0 ? (
                    <tr>
                      <td className="table-empty" colSpan={5}>
                        {rows.length === 0
                          ? t('spotCheck.empty')
                          : t('spotCheck.emptyFiltered')}
                      </td>
                    </tr>
                  ) : (
                    sortedRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          {formatSpotCheckDate(row.createdAt, i18n.language)}
                        </td>
                        <td>{row.userEmail || '—'}</td>
                        <td>{row.location}</td>
                        <td className="mobile-quick-filter-col" />
                        <td className="mobile-quick-filter-col" />
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {isListFilterOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-scrollable">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('common.filters')}</h3>
                <p className="modal-subtitle">{t('spotCheck.filterSubtitle')}</p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsListFilterOpen(false)}
                aria-label={t('common.closeFilters')}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="filter-grid">
                <div className="filter-group">
                  <p className="filter-title">{t('common.location')}</p>
                  <div className="filter-options">
                    {listLocationOptions.map((option) => {
                      const isChecked = filterDraft.locations.includes(option)
                      return (
                        <label className="filter-option" key={option}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(event) => {
                              setFilterDraft((current) => {
                                if (event.target.checked) {
                                  return {
                                    ...current,
                                    locations: [...current.locations, option],
                                  }
                                }
                                return {
                                  ...current,
                                  locations: current.locations.filter(
                                    (value) => value !== option,
                                  ),
                                }
                              })
                            }}
                          />
                          <span>{option}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div className="filter-group">
                  <p className="filter-title">{t('common.category')}</p>
                  <div className="filter-options">
                    {listCategoryOptions.map((option) => {
                      const isChecked = filterDraft.categories.includes(option)
                      return (
                        <label className="filter-option" key={option}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(event) => {
                              setFilterDraft((current) => {
                                if (event.target.checked) {
                                  return {
                                    ...current,
                                    categories: [...current.categories, option],
                                  }
                                }
                                return {
                                  ...current,
                                  categories: current.categories.filter(
                                    (value) => value !== option,
                                  ),
                                }
                              })
                            }}
                          />
                          <span>{option}</span>
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
                  setFilterDraft({
                    locations: [],
                    categories: [],
                  })
                }}
              >
                {t('common.clear')}
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  setFilters({
                    locations: [...filterDraft.locations],
                    categories: [...filterDraft.categories],
                  })
                  setIsListFilterOpen(false)
                }}
              >
                {t('common.applyFilters')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isFilterModalOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={closeFilterModal}
        >
          <div
            className="modal modal-scrollable modal-spot-check"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('spotCheck.wizardTitle')}</h3>
                <p className="modal-subtitle">{t('spotCheck.wizardSubtitle')}</p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={closeFilterModal}
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {wizardError ? <div className="alert">{wizardError}</div> : null}
              <fieldset className="spot-check-fieldset">
                <legend>{t('common.location')}</legend>
                <div className="filter-options">
                  {locationOptions.map((location) => (
                    <label className="filter-option" key={location}>
                      <input
                        type="radio"
                        name="spot-check-location"
                        checked={selectedLocation === location}
                        onChange={() => {
                          setSelectedLocation(location)
                          setSelectedCategories([])
                        }}
                      />
                      <span>{location}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="spot-check-fieldset">
                <legend>{t('common.category')}</legend>
                <div className="filter-options">
                  {categoryOptions.map((category) => {
                    const isChecked = selectedCategories.includes(category)
                    return (
                      <label className="filter-option" key={category}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(event) => {
                            setSelectedCategories((current) =>
                              event.target.checked
                                ? [...current, category]
                                : current.filter((value) => value !== category),
                            )
                          }}
                        />
                        <span>{category}</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={closeFilterModal}
              >
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={goToCountStep}
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
