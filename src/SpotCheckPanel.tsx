import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
}

type InventoryItem = {
  id: string
  name: string
  nameEs: string
  location: string
  category: string
  quantity: number
}

type DraftItem = InventoryItem & {
  draftQuantity: number
  confirmed: boolean
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
  const [rows, setRows] = useState<SpotCheckRow[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wizardError, setWizardError] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'desc' | 'asc'>('desc')
  const [locationFilter, setLocationFilter] =
    useState<LocationQuickFilter>('none')
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<WizardStep>('filters')
  const [selectedLocation, setSelectedLocation] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])

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
      setRows(Array.isArray(payload.items) ? payload.items : [])
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
      if (!query) {
        return true
      }
      return [row.userEmail, row.location, row.id]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [locationFilter, rows, searchQuery])

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

  const confirmedCount = draftItems.filter((item) => item.confirmed).length
  const unconfirmedCount = draftItems.length - confirmedCount

  const openWizard = () => {
    setWizardStep('filters')
    setSelectedLocation(locationOptions[0] ?? '')
    setSelectedCategories([])
    setDraftItems([])
    setWizardError(null)
    setIsWizardOpen(true)
    if (inventoryItems.length === 0) {
      void fetchInventoryItems()
    }
  }

  const closeWizard = () => {
    if (isSaving) {
      return
    }
    setIsWizardOpen(false)
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
        confirmed: false,
      }))
    if (nextItems.length === 0) {
      setWizardError(t('spotCheck.noMatchingItems'))
      return
    }
    setWizardError(null)
    setDraftItems(nextItems)
    setWizardStep('count')
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

  const confirmItem = (id: string) => {
    setDraftItems((current) =>
      current.map((item) =>
        item.id === id ? { ...item, confirmed: true } : item,
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
              confirmed: false,
            }
          : item,
      ),
    )
  }

  const completeSpotCheck = async () => {
    if (draftItems.length === 0) {
      return
    }
    if (confirmedCount === 0) {
      window.alert(t('spotCheck.noneConfirmed'))
      return
    }
    if (unconfirmedCount > 0) {
      const shouldContinue = window.confirm(
        t('spotCheck.unconfirmedWarning', { count: unconfirmedCount }),
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

    const confirmedItems = draftItems.filter((item) => item.confirmed)
    setIsSaving(true)
    setError(null)
    try {
      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          location: selectedLocation,
          categories: selectedCategories,
          items: confirmedItems.map((item) => ({
            id: item.id,
            quantity: item.draftQuantity,
          })),
        }),
      })
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(errorText)
      }
      setIsWizardOpen(false)
      setWizardError(null)
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
            <input
              className="search-input"
              placeholder={t('spotCheck.search')}
              type="search"
              aria-label={t('spotCheck.search')}
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
                  <path d="M9 4h2v5h5v2h-5v5H9v-5H4V9h5V4z" fill="currentColor" />
                </svg>
              </button>
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
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {error ? <div className="alert">{error}</div> : null}

      <section className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}>
        <div className="card card-compact">
          <p className="card-label">{t('spotCheck.totalChecks')}</p>
          <p className="card-value">{filteredRows.length}</p>
          <p className="card-meta">{t('spotCheck.recentChecks')}</p>
        </div>
        <div className="card card-compact">
          <p className="card-label">{t('common.location')}</p>
          <p className="card-value">
            {locationFilter === 'none' ? t('spotCheck.allLocations') : locationFilter}
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
                    <span className="quick-filter-indicator" aria-hidden="true" />
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
                    <span className="quick-filter-indicator" aria-hidden="true" />
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
                    <td>{formatSpotCheckDate(row.createdAt, i18n.language)}</td>
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

      {isWizardOpen ? (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={closeWizard}
        >
          <div
            className="modal modal-scrollable modal-spot-check"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {wizardStep === 'filters'
                    ? t('spotCheck.wizardTitle')
                    : t('spotCheck.countTitle')}
                </h3>
                <p className="modal-subtitle">
                  {wizardStep === 'filters'
                    ? t('spotCheck.wizardSubtitle')
                    : t('spotCheck.countSubtitle', {
                        confirmed: confirmedCount,
                        total: draftItems.length,
                      })}
                </p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={closeWizard}
                aria-label={t('common.close')}
                disabled={isSaving}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              {wizardError ? <div className="alert">{wizardError}</div> : null}
              {wizardStep === 'filters' ? (
                <>
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
                </>
              ) : (
                <ul className="spot-check-list">
                  {draftItems.map((item) => (
                    <li
                      className={`spot-check-item ${
                        item.confirmed ? 'is-confirmed' : ''
                      }`}
                      key={item.id}
                    >
                      <div className="spot-check-item-header">
                        <p className="spot-check-item-name">
                          {displayInventoryName(
                            i18n.language,
                            item.name,
                            item.nameEs,
                          )}
                        </p>
                        <p className="spot-check-item-meta">{item.category}</p>
                      </div>
                      <div className="spot-check-qty-row">
                        <button
                          className="btn-secondary spot-check-qty-btn"
                          type="button"
                          onClick={() => adjustQuantity(item.id, -10)}
                        >
                          {t('spotCheck.minus10')}
                        </button>
                        <button
                          className="btn-secondary spot-check-qty-btn"
                          type="button"
                          onClick={() => adjustQuantity(item.id, -1)}
                        >
                          {t('spotCheck.minus1')}
                        </button>
                        <input
                          className="spot-check-qty-input"
                          type="number"
                          min="0"
                          value={item.draftQuantity}
                          onChange={(event) =>
                            setQuantity(item.id, event.target.value)
                          }
                          aria-label={t('common.quantity')}
                        />
                        <button
                          className="btn-secondary spot-check-qty-btn"
                          type="button"
                          onClick={() => adjustQuantity(item.id, 1)}
                        >
                          {t('spotCheck.plus1')}
                        </button>
                        <button
                          className="btn-secondary spot-check-qty-btn"
                          type="button"
                          onClick={() => adjustQuantity(item.id, 10)}
                        >
                          {t('spotCheck.plus10')}
                        </button>
                      </div>
                      <div className="spot-check-item-actions">
                        <button
                          className={`btn-primary ${
                            item.confirmed ? 'is-quiet' : ''
                          }`}
                          type="button"
                          onClick={() => confirmItem(item.id)}
                        >
                          {item.confirmed
                            ? t('spotCheck.confirmed')
                            : t('spotCheck.confirm')}
                        </button>
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() => resetItem(item.id)}
                        >
                          {t('spotCheck.reset')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="modal-footer">
              {wizardStep === 'filters' ? (
                <>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={closeWizard}
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
                </>
              ) : (
                <>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => setWizardStep('filters')}
                    disabled={isSaving}
                  >
                    {t('common.back')}
                  </button>
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={() => void completeSpotCheck()}
                    disabled={isSaving}
                  >
                    {isSaving ? t('common.saving') : t('spotCheck.complete')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
