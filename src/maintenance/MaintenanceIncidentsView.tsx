import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { fetchJson, getVisitsByDate } from '../operations/api'
import { formatDateOnlyLabel, getTodayMadrid } from '../operations/dateHelpers'
import {
  filterPropertySelectOptions,
  getPropertyLabel,
} from '../operations/propertyHelpers'
import type { PropertyOption } from '../operations/types'
import { MAINTENANCE_VISIT_TYPE_ID } from '../operations/visitTypeIds'
import { PropertyGroupChips } from '../cleaning/PropertyGroupChips'
import { propertyGroupOf } from '../cleaning/propertyGroups'
import type { CleaningBillingPropertyGroup } from '../cleaning/types'
import {
  OTHER_PROVIDER_ID,
  type MaintenanceIncidentRecord,
  type ProviderRecord,
} from './types'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
  isSummaryInfoOpen: boolean
  onToggleSummaryInfo: () => void
  searchQuery: string
  onSearchQueryChange: (value: string) => void
}

type VisitOption = {
  visitId: string
  propertyId: string
  title: string
}

type Filters = {
  propertyIds: string[]
  providerIds: string[]
  dateFrom: string
  dateTo: string
}

const emptyFilters = (): Filters => ({
  propertyIds: [],
  providerIds: [],
  dateFrom: '',
  dateTo: '',
})

const mapProvider = (item: Record<string, unknown>): ProviderRecord => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? item.id ?? ''),
  active: item.active !== false,
})

const mapIncident = (
  item: Record<string, unknown>,
): MaintenanceIncidentRecord => ({
  id: String(item.id ?? ''),
  visitId: String(item.visitId ?? ''),
  visitTitle: String(item.visitTitle ?? ''),
  propertyId: String(item.propertyId ?? ''),
  property: String(item.property ?? item.propertyId ?? ''),
  date: String(item.date ?? '').slice(0, 10),
  providerId: String(item.providerId ?? ''),
  providerName: String(item.providerName ?? ''),
  isOtherProvider: Boolean(item.isOtherProvider),
  description: String(item.description ?? ''),
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
  updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
})

export function MaintenanceIncidentsView({
  getEndpoint,
  propertyOptions,
  isSummaryInfoOpen,
  onToggleSummaryInfo,
  searchQuery,
  onSearchQueryChange,
}: Props) {
  const { t, i18n } = useTranslation()
  const endpoints = useMemo(
    () => ({
      getIncidents: getEndpoint(
        'getMaintenanceIncidentsUrl',
        import.meta.env.VITE_GET_MAINTENANCE_INCIDENTS_URL,
      ),
      upsertIncident: getEndpoint(
        'upsertMaintenanceIncidentUrl',
        import.meta.env.VITE_UPSERT_MAINTENANCE_INCIDENT_URL,
      ),
      getVisits: getEndpoint('getVisitsUrl', import.meta.env.VITE_GET_VISITS_URL),
      getProviders: getEndpoint(
        'getMaintenanceProvidersUrl',
        import.meta.env.VITE_GET_MAINTENANCE_PROVIDERS_URL,
      ),
    }),
    [getEndpoint],
  )

  const [incidents, setIncidents] = useState<MaintenanceIncidentRecord[]>([])
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [visitOptions, setVisitOptions] = useState<VisitOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [formDate, setFormDate] = useState(getTodayMadrid())
  const [formVisitId, setFormVisitId] = useState('')
  const [formProviderId, setFormProviderId] = useState('')
  const [formOtherName, setFormOtherName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [filterDraft, setFilterDraft] = useState<Filters>(emptyFilters)
  const [groupFilter, setGroupFilter] =
    useState<CleaningBillingPropertyGroup | ''>('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const propertyById = useMemo(
    () =>
      new Map(
        propertyOptions.map((property) => [property.id, getPropertyLabel(property)]),
      ),
    [propertyOptions],
  )
  const providerById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider.name])),
    [providers],
  )
  const selectedVisit = visitOptions.find((visit) => visit.visitId === formVisitId)
  const editingIncident = incidents.find((incident) => incident.id === editingId)
  const selectedPropertyLabel = selectedVisit
    ? propertyById.get(selectedVisit.propertyId) || selectedVisit.propertyId
    : editingIncident
      ? propertyById.get(editingIncident.propertyId) || editingIncident.property
      : ''
  const isOtherProvider = formProviderId === OTHER_PROVIDER_ID
  const formProviders = useMemo(() => {
    const active = providers.filter((provider) => provider.active)
    if (
      formProviderId &&
      formProviderId !== OTHER_PROVIDER_ID &&
      !active.some((provider) => provider.id === formProviderId)
    ) {
      const current = providers.find((provider) => provider.id === formProviderId)
      if (current) {
        return [...active, current]
      }
    }
    return active
  }, [formProviderId, providers])

  const loadIncidents = useCallback(async () => {
    if (!endpoints.getIncidents) {
      setError(t('maintenanceIncidents.missingEndpoint'))
      return
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      endpoints.getIncidents,
    )
    setIncidents((payload.items ?? []).map(mapIncident))
  }, [endpoints.getIncidents, t])

  const loadProviders = useCallback(async () => {
    if (!endpoints.getProviders) {
      return
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      `${endpoints.getProviders}?includeInactive=true`,
    )
    setProviders((payload.items ?? []).map(mapProvider))
  }, [endpoints.getProviders])

  const loadVisitsForDate = useCallback(
    async (date: string) => {
      if (!endpoints.getVisits || !date) {
        setVisitOptions([])
        return
      }
      const payload = await getVisitsByDate(endpoints.getVisits, date)
      setVisitOptions(
        (payload.items ?? [])
          .filter(
            (visit) =>
              visit.visitTypeId === MAINTENANCE_VISIT_TYPE_ID &&
              String(visit.status).toUpperCase() !== 'CANCELLED',
          )
          .map((visit) => ({
            visitId: visit.id,
            propertyId: visit.propertyId,
            title: visit.title || visit.id,
          })),
      )
    },
    [endpoints.getVisits],
  )

  const refreshAll = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      await Promise.all([loadIncidents(), loadProviders()])
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('maintenanceIncidents.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [loadIncidents, loadProviders, t])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  const filteredIncidents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return incidents.filter((incident) => {
      if (groupFilter) {
        const label = propertyById.get(incident.propertyId) || incident.property
        if (propertyGroupOf(label, incident.propertyId) !== groupFilter) {
          return false
        }
      }
      if (
        filters.propertyIds.length > 0 &&
        !filters.propertyIds.includes(incident.propertyId)
      ) {
        return false
      }
      if (filters.providerIds.length > 0) {
        const providerKey =
          incident.providerId === OTHER_PROVIDER_ID
            ? OTHER_PROVIDER_ID
            : incident.providerId
        if (!filters.providerIds.includes(providerKey)) {
          return false
        }
      }
      if (filters.dateFrom && incident.date < filters.dateFrom) {
        return false
      }
      if (filters.dateTo && incident.date > filters.dateTo) {
        return false
      }
      if (!query) {
        return true
      }
      return [
        incident.property,
        incident.providerName,
        incident.description,
        incident.date,
        incident.visitTitle,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [filters, groupFilter, incidents, propertyById, searchQuery])

  const propertyFilterOptions = useMemo(
    () =>
      filterPropertySelectOptions(propertyOptions).map((property) => ({
        id: property.id,
        label: getPropertyLabel(property),
      })),
    [propertyOptions],
  )

  const activeFilterCount =
    filters.propertyIds.length +
    filters.providerIds.length +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (groupFilter ? 1 : 0)
  const thisMonthCount = filteredIncidents.filter((item) =>
    item.date.startsWith(getTodayMadrid().slice(0, 7)),
  ).length
  const propertiesCount = new Set(
    filteredIncidents.map((item) => item.propertyId).filter(Boolean),
  ).size

  const openCreate = () => {
    const today = getTodayMadrid()
    setEditingId('')
    setFormDate(today)
    setFormVisitId('')
    setFormProviderId('')
    setFormOtherName('')
    setFormDescription('')
    setIsFormOpen(true)
    setMessage('')
    setError('')
    void loadVisitsForDate(today).catch(() => setVisitOptions([]))
  }

  const openEdit = (incident: MaintenanceIncidentRecord) => {
    setEditingId(incident.id)
    setFormDate(incident.date)
    setFormVisitId(incident.visitId)
    setFormProviderId(incident.providerId || OTHER_PROVIDER_ID)
    setFormOtherName(
      incident.providerId === OTHER_PROVIDER_ID ? incident.providerName : '',
    )
    setFormDescription(incident.description)
    setIsFormOpen(true)
    setMessage('')
    setError('')
    void loadVisitsForDate(incident.date).catch(() => setVisitOptions([]))
  }

  const saveIncident = async () => {
    if (!endpoints.upsertIncident) {
      setError(t('maintenanceIncidents.missingWrite'))
      return
    }
    if (!formVisitId) {
      setError(t('maintenanceIncidents.visitRequired'))
      return
    }
    if (!formProviderId) {
      setError(t('maintenanceIncidents.providerRequired'))
      return
    }
    if (isOtherProvider && !formOtherName.trim()) {
      setError(t('maintenanceIncidents.otherNameRequired'))
      return
    }
    if (!formDescription.trim()) {
      setError(t('maintenanceIncidents.descriptionRequired'))
      return
    }
    const selectedProvider = providers.find((item) => item.id === formProviderId)
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertIncident, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: editingId || undefined,
          visitId: formVisitId,
          description: formDescription.trim(),
          providerId: formProviderId,
          providerName: isOtherProvider
            ? formOtherName.trim()
            : selectedProvider?.name || formProviderId,
        }),
      })
      setIsFormOpen(false)
      setMessage(
        editingId
          ? t('maintenanceIncidents.updated')
          : t('maintenanceIncidents.created'),
      )
      await loadIncidents()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('maintenanceIncidents.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const deleteIncident = async (incident: MaintenanceIncidentRecord) => {
    if (!endpoints.upsertIncident) {
      setError(t('maintenanceIncidents.missingWrite'))
      return
    }
    if (!window.confirm(t('maintenanceIncidents.deleteConfirm'))) {
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertIncident, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: incident.id, action: 'delete' }),
      })
      setMessage(t('maintenanceIncidents.deleted'))
      await loadIncidents()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('maintenanceIncidents.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const toggleDraftValue = (
    key: 'propertyIds' | 'providerIds',
    value: string,
  ) => {
    setFilterDraft((current) => {
      const selected = current[key].includes(value)
        ? current[key].filter((entry) => entry !== value)
        : [...current[key], value]
      return { ...current, [key]: selected }
    })
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('maintenanceIncidents.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Maintenance Incidents')}</h1>
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
          <p className="subtitle">{t('maintenanceIncidents.subtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <input
              className="search-input"
              placeholder={t('maintenanceIncidents.search')}
              type="search"
              aria-label={t('maintenanceIncidents.search')}
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
            />
            <div className="header-actions">
              <button
                className={`btn-ghost btn-filter ${isFilterOpen ? 'is-active' : ''}`}
                type="button"
                aria-label={t('common.filters')}
                onClick={() => {
                  setFilterDraft(filters)
                  setIsFilterOpen(true)
                }}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
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
                className="btn-ghost"
                type="button"
                onClick={openCreate}
                aria-label={t('maintenanceIncidents.add')}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
                  <path d="M9 4h2v5h5v2h-5v5H9v-5H4V9h5V4z" fill="currentColor" />
                </svg>
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => void refreshAll()}
                aria-label={t('common.refresh')}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
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

      {message ? <p className="notice success">{message}</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      <section className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}>
        <div className="card card-compact">
          <p className="card-label">{t('maintenanceIncidents.totalCard')}</p>
          <p className="card-value">{isLoading ? '—' : filteredIncidents.length}</p>
          <p className="card-meta">{t('maintenanceIncidents.totalCardMeta')}</p>
        </div>
        <div className="card card-compact">
          <p className="card-label">{t('maintenanceIncidents.propertiesCard')}</p>
          <p className="card-value">{isLoading ? '—' : propertiesCount}</p>
          <p className="card-meta">{t('maintenanceIncidents.propertiesCardMeta')}</p>
        </div>
        <div className="card card-compact">
          <p className="card-label">{t('maintenanceIncidents.monthCard')}</p>
          <p className="card-value">{isLoading ? '—' : thisMonthCount}</p>
          <p className="card-meta">{t('maintenanceIncidents.monthCardMeta')}</p>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('maintenanceIncidents.cardTitle')}</h2>
            <p className="card-subtitle">{t('maintenanceIncidents.cardSubtitle')}</p>
          </div>
        </div>
        <PropertyGroupChips value={groupFilter} onChange={setGroupFilter} />
        <div className="table-wrapper">
          <table className="data-table data-table-cleaning-incidents">
            <thead>
              <tr>
                <th>{t('maintenanceIncidents.property')}</th>
                <th>{t('maintenanceIncidents.date')}</th>
                <th>{t('maintenanceIncidents.provider')}</th>
                <th>{t('maintenanceIncidents.description')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5}>{t('common.loading')}</td>
                </tr>
              ) : filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    {incidents.length === 0
                      ? t('maintenanceIncidents.empty')
                      : t('maintenanceIncidents.emptyFiltered')}
                  </td>
                </tr>
              ) : (
                filteredIncidents.map((incident) => (
                  <tr key={incident.id}>
                    <td>
                      {propertyById.get(incident.propertyId) || incident.property}
                    </td>
                    <td>{formatDateOnlyLabel(incident.date, i18n.language)}</td>
                    <td>
                      {incident.providerId === OTHER_PROVIDER_ID
                        ? incident.providerName
                        : providerById.get(incident.providerId) ||
                          incident.providerName}
                    </td>
                    <td className="incident-description-cell">
                      {incident.description}
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() => openEdit(incident)}
                        >
                          {t('maintenanceSettings.edit')}
                        </button>
                        <button
                          className="btn-secondary"
                          type="button"
                          disabled={isSaving}
                          onClick={() => void deleteIncident(incident)}
                        >
                          {t('common.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isFilterOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-scrollable">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('common.filters')}</h3>
                <p className="modal-subtitle">
                  {t('maintenanceIncidents.filterSubtitle')}
                </p>
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
              <PropertyGroupChips value={groupFilter} onChange={setGroupFilter} />
              <div className="filter-grid">
                <div className="filter-group">
                  <p className="filter-title">{t('maintenanceIncidents.property')}</p>
                  <div className="filter-options filter-options-scroll">
                    {propertyFilterOptions.map((option) => (
                      <label className="filter-option" key={option.id}>
                        <input
                          type="checkbox"
                          checked={filterDraft.propertyIds.includes(option.id)}
                          onChange={() =>
                            toggleDraftValue('propertyIds', option.id)
                          }
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="filter-group">
                  <p className="filter-title">{t('maintenanceIncidents.provider')}</p>
                  <div className="filter-options filter-options-scroll">
                    {providers.map((provider) => (
                      <label className="filter-option" key={provider.id}>
                        <input
                          type="checkbox"
                          checked={filterDraft.providerIds.includes(provider.id)}
                          onChange={() =>
                            toggleDraftValue('providerIds', provider.id)
                          }
                        />
                        <span>{provider.name}</span>
                      </label>
                    ))}
                    <label className="filter-option">
                      <input
                        type="checkbox"
                        checked={filterDraft.providerIds.includes(OTHER_PROVIDER_ID)}
                        onChange={() =>
                          toggleDraftValue('providerIds', OTHER_PROVIDER_ID)
                        }
                      />
                      <span>{t('maintenanceIncidents.otherProvider')}</span>
                    </label>
                  </div>
                </div>
                <div className="filter-group">
                  <p className="filter-title">{t('maintenanceIncidents.date')}</p>
                  <label>
                    {t('common.from')}
                    <input
                      type="date"
                      value={filterDraft.dateFrom}
                      onChange={(event) =>
                        setFilterDraft((current) => ({
                          ...current,
                          dateFrom: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    {t('common.to')}
                    <input
                      type="date"
                      value={filterDraft.dateTo}
                      onChange={(event) =>
                        setFilterDraft((current) => ({
                          ...current,
                          dateTo: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  setFilterDraft(emptyFilters())
                  setFilters(emptyFilters())
                  setIsFilterOpen(false)
                }}
              >
                {t('common.clear')}
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  setFilters(filterDraft)
                  setIsFilterOpen(false)
                }}
              >
                {t('common.applyFilters')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isFormOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {editingId
                    ? t('maintenanceIncidents.editTitle')
                    : t('maintenanceIncidents.formTitle')}
                </h3>
                <p className="modal-subtitle">
                  {t('maintenanceIncidents.formSubtitle')}
                </p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsFormOpen(false)}
                aria-label={t('common.closeForm')}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="filters-grid">
                <label>
                  {t('maintenanceIncidents.date')}
                  <input
                    type="date"
                    value={formDate}
                    disabled={Boolean(editingId)}
                    onChange={(event) => {
                      const nextDate = event.target.value
                      setFormDate(nextDate)
                      setFormVisitId('')
                      void loadVisitsForDate(nextDate).catch(() =>
                        setVisitOptions([]),
                      )
                    }}
                  />
                </label>
                <label>
                  {t('maintenanceIncidents.visit')}
                  <select
                    value={formVisitId}
                    disabled={Boolean(editingId)}
                    onChange={(event) => setFormVisitId(event.target.value)}
                  >
                    <option value="">{t('maintenanceIncidents.selectVisit')}</option>
                    {visitOptions.map((visit) => (
                      <option key={visit.visitId} value={visit.visitId}>
                        {(propertyById.get(visit.propertyId) || visit.propertyId) +
                          ' — ' +
                          visit.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('maintenanceIncidents.property')}
                  <input type="text" value={selectedPropertyLabel} readOnly />
                </label>
                <label>
                  {t('maintenanceIncidents.provider')}
                  <select
                    value={formProviderId}
                    onChange={(event) => setFormProviderId(event.target.value)}
                  >
                    <option value="">{t('maintenanceIncidents.selectProvider')}</option>
                    {formProviders.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                    <option value={OTHER_PROVIDER_ID}>
                      {t('maintenanceIncidents.otherProvider')}
                    </option>
                  </select>
                </label>
                {isOtherProvider ? (
                  <label>
                    {t('maintenanceIncidents.otherName')}
                    <input
                      type="text"
                      value={formOtherName}
                      onChange={(event) => setFormOtherName(event.target.value)}
                    />
                  </label>
                ) : null}
                <label className="form-field-wide">
                  {t('maintenanceIncidents.description')}
                  <textarea
                    rows={4}
                    value={formDescription}
                    onChange={(event) => setFormDescription(event.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setIsFormOpen(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={isSaving}
                onClick={() => void saveIncident()}
              >
                {isSaving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
