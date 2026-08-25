import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { fetchJson } from '../operations/api'
import { formatDateOnlyLabel, getTodayMadrid } from '../operations/dateHelpers'
import { getPropertyLabel } from '../operations/propertyHelpers'
import type { PropertyOption } from '../operations/types'
import { PropertyGroupChips } from './PropertyGroupChips'
import { propertyGroupOf } from './propertyGroups'
import type {
  CleanerRecord,
  CleaningBillingPropertyGroup,
  CleaningIncidentRecord,
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
  cleanerId: string
}

type Filters = {
  propertyIds: string[]
  cleanerIds: string[]
  dateFrom: string
  dateTo: string
}

const emptyFilters = (): Filters => ({
  propertyIds: [],
  cleanerIds: [],
  dateFrom: '',
  dateTo: '',
})

const mapCleaner = (item: Record<string, unknown>): CleanerRecord => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? item.id ?? ''),
  active: item.active !== false,
})

const mapIncident = (item: Record<string, unknown>): CleaningIncidentRecord => ({
  id: String(item.id ?? ''),
  visitId: String(item.visitId ?? ''),
  visitTitle: String(item.visitTitle ?? ''),
  propertyId: String(item.propertyId ?? ''),
  property: String(item.property ?? item.propertyId ?? ''),
  date: String(item.date ?? '').slice(0, 10),
  cleanerId: String(item.cleanerId ?? ''),
  cleanerName: String(item.cleanerName ?? ''),
  description: String(item.description ?? ''),
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
  updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
})

const mapVisitOption = (item: Record<string, unknown>): VisitOption => ({
  visitId: String(item.visitId ?? ''),
  propertyId: String(item.propertyId ?? ''),
  title: String(item.title ?? item.visitId ?? ''),
  cleanerId: String(item.cleanerId ?? ''),
})

export function CleaningIncidentsView({
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
        'getCleaningIncidentsUrl',
        import.meta.env.VITE_GET_CLEANING_INCIDENTS_URL,
      ),
      upsertIncident: getEndpoint(
        'upsertCleaningIncidentUrl',
        import.meta.env.VITE_UPSERT_CLEANING_INCIDENT_URL,
      ),
      getPlan: getEndpoint(
        'getCleaningPlanUrl',
        import.meta.env.VITE_GET_CLEANING_PLAN_URL,
      ),
      getCleaners: getEndpoint(
        'getCleanersUrl',
        import.meta.env.VITE_GET_CLEANERS_URL,
      ),
    }),
    [getEndpoint],
  )

  const [incidents, setIncidents] = useState<CleaningIncidentRecord[]>([])
  const [cleaners, setCleaners] = useState<CleanerRecord[]>([])
  const [visitOptions, setVisitOptions] = useState<VisitOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [formDate, setFormDate] = useState(getTodayMadrid())
  const [formVisitId, setFormVisitId] = useState('')
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
  const cleanerById = useMemo(
    () => new Map(cleaners.map((cleaner) => [cleaner.id, cleaner.name])),
    [cleaners],
  )
  const selectedVisit = visitOptions.find((visit) => visit.visitId === formVisitId)
  const editingIncident = incidents.find((incident) => incident.id === editingId)
  const selectedPropertyLabel = selectedVisit
    ? propertyById.get(selectedVisit.propertyId) || selectedVisit.propertyId
    : editingIncident
      ? propertyById.get(editingIncident.propertyId) || editingIncident.property
      : ''
  const selectedCleanerLabel = selectedVisit
    ? cleanerById.get(selectedVisit.cleanerId) || selectedVisit.cleanerId
    : editingIncident
      ? cleanerById.get(editingIncident.cleanerId) || editingIncident.cleanerName
      : ''

  const loadIncidents = useCallback(async () => {
    if (!endpoints.getIncidents) {
      setError(t('cleaningIncidents.missingEndpoint'))
      return
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      endpoints.getIncidents,
    )
    setIncidents((payload.items ?? []).map(mapIncident))
  }, [endpoints.getIncidents, t])

  const loadCleaners = useCallback(async () => {
    if (!endpoints.getCleaners) {
      return
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      `${endpoints.getCleaners}?includeInactive=true`,
    )
    setCleaners((payload.items ?? []).map(mapCleaner))
  }, [endpoints.getCleaners])

  const loadVisitsForDate = useCallback(
    async (date: string) => {
      if (!endpoints.getPlan || !date) {
        setVisitOptions([])
        return
      }
      const payload = await fetchJson<{ rows?: Record<string, unknown>[] }>(
        `${endpoints.getPlan}?date=${encodeURIComponent(date)}`,
      )
      setVisitOptions(
        (payload.rows ?? [])
          .map(mapVisitOption)
          .filter((visit) => visit.visitId),
      )
    },
    [endpoints.getPlan],
  )

  const refreshAll = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      await Promise.all([loadIncidents(), loadCleaners()])
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningIncidents.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [loadCleaners, loadIncidents, t])

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
      if (
        filters.cleanerIds.length > 0 &&
        !filters.cleanerIds.includes(incident.cleanerId)
      ) {
        return false
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
        incident.cleanerName,
        incident.description,
        incident.date,
        incident.visitTitle,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [filters, groupFilter, incidents, propertyById, searchQuery])

  const propertyFilterOptions = useMemo(() => {
    const ids = new Set(incidents.map((item) => item.propertyId).filter(Boolean))
    propertyOptions.forEach((property) => ids.add(property.id))
    return [...ids]
      .map((id) => ({
        id,
        label:
          propertyById.get(id) ||
          incidents.find((item) => item.propertyId === id)?.property ||
          id,
      }))
      .sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
      )
  }, [incidents, propertyById, propertyOptions])

  const activeFilterCount =
    filters.propertyIds.length +
    filters.cleanerIds.length +
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
    setFormDescription('')
    setIsFormOpen(true)
    setMessage('')
    setError('')
    void loadVisitsForDate(today).catch(() => setVisitOptions([]))
  }

  const openEdit = (incident: CleaningIncidentRecord) => {
    setEditingId(incident.id)
    setFormDate(incident.date)
    setFormVisitId(incident.visitId)
    setFormDescription(incident.description)
    setIsFormOpen(true)
    setMessage('')
    setError('')
    void loadVisitsForDate(incident.date).catch(() => setVisitOptions([]))
  }

  const saveIncident = async () => {
    if (!endpoints.upsertIncident) {
      setError(t('cleaningIncidents.missingWrite'))
      return
    }
    if (!formVisitId) {
      setError(t('cleaningIncidents.visitRequired'))
      return
    }
    if (!formDescription.trim()) {
      setError(t('cleaningIncidents.descriptionRequired'))
      return
    }
    const visit = visitOptions.find((option) => option.visitId === formVisitId)
    if (!editingId && visit && !visit.cleanerId) {
      setError(t('cleaningIncidents.cleanerRequired'))
      return
    }
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
        }),
      })
      setIsFormOpen(false)
      setMessage(
        editingId
          ? t('cleaningIncidents.updated')
          : t('cleaningIncidents.created'),
      )
      await loadIncidents()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningIncidents.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const deleteIncident = async (incident: CleaningIncidentRecord) => {
    if (!endpoints.upsertIncident) {
      setError(t('cleaningIncidents.missingWrite'))
      return
    }
    if (!window.confirm(t('cleaningIncidents.deleteConfirm'))) {
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
      setMessage(t('cleaningIncidents.deleted'))
      await loadIncidents()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningIncidents.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const toggleDraftValue = (
    key: 'propertyIds' | 'cleanerIds',
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
          <p className="eyebrow">{t('cleaningIncidents.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Cleaning Incidents')}</h1>
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
          <p className="subtitle">{t('cleaningIncidents.subtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <input
              className="search-input"
              placeholder={t('cleaningIncidents.search')}
              type="search"
              aria-label={t('cleaningIncidents.search')}
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
                aria-label={t('cleaningIncidents.add')}
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
          <p className="card-label">{t('cleaningIncidents.totalCard')}</p>
          <p className="card-value">{isLoading ? '—' : filteredIncidents.length}</p>
          <p className="card-meta">{t('cleaningIncidents.totalCardMeta')}</p>
        </div>
        <div className="card card-compact">
          <p className="card-label">{t('cleaningIncidents.propertiesCard')}</p>
          <p className="card-value">{isLoading ? '—' : propertiesCount}</p>
          <p className="card-meta">{t('cleaningIncidents.propertiesCardMeta')}</p>
        </div>
        <div className="card card-compact">
          <p className="card-label">{t('cleaningIncidents.monthCard')}</p>
          <p className="card-value">{isLoading ? '—' : thisMonthCount}</p>
          <p className="card-meta">{t('cleaningIncidents.monthCardMeta')}</p>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('cleaningIncidents.cardTitle')}</h2>
            <p className="card-subtitle">{t('cleaningIncidents.cardSubtitle')}</p>
          </div>
        </div>
        <PropertyGroupChips value={groupFilter} onChange={setGroupFilter} />
        <div className="table-wrapper">
          <table className="data-table data-table-cleaning-incidents">
            <thead>
              <tr>
                <th>{t('cleaningIncidents.property')}</th>
                <th>{t('cleaningIncidents.date')}</th>
                <th>{t('cleaningIncidents.cleaner')}</th>
                <th>{t('cleaningIncidents.description')}</th>
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
                      ? t('cleaningIncidents.empty')
                      : t('cleaningIncidents.emptyFiltered')}
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
                      {cleanerById.get(incident.cleanerId) || incident.cleanerName}
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
                          {t('cleaningSettings.edit')}
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
                  {t('cleaningIncidents.filterSubtitle')}
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
                  <p className="filter-title">{t('cleaningIncidents.property')}</p>
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
                  <p className="filter-title">{t('cleaningIncidents.cleaner')}</p>
                  <div className="filter-options filter-options-scroll">
                    {cleaners.map((cleaner) => (
                      <label className="filter-option" key={cleaner.id}>
                        <input
                          type="checkbox"
                          checked={filterDraft.cleanerIds.includes(cleaner.id)}
                          onChange={() =>
                            toggleDraftValue('cleanerIds', cleaner.id)
                          }
                        />
                        <span>{cleaner.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="filter-group">
                  <p className="filter-title">{t('cleaningIncidents.date')}</p>
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
                    ? t('cleaningIncidents.editTitle')
                    : t('cleaningIncidents.formTitle')}
                </h3>
                <p className="modal-subtitle">
                  {t('cleaningIncidents.formSubtitle')}
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
                  {t('cleaningIncidents.date')}
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
                  {t('cleaningIncidents.visit')}
                  <select
                    value={formVisitId}
                    disabled={Boolean(editingId)}
                    onChange={(event) => setFormVisitId(event.target.value)}
                  >
                    <option value="">{t('cleaningIncidents.selectVisit')}</option>
                    {visitOptions.map((visit) => (
                      <option key={visit.visitId} value={visit.visitId}>
                        {(propertyById.get(visit.propertyId) || visit.propertyId) +
                          ' — ' +
                          visit.title}
                        {visit.cleanerId
                          ? ''
                          : ` (${t('cleaningIncidents.unassigned')})`}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('cleaningIncidents.property')}
                  <input type="text" value={selectedPropertyLabel} readOnly />
                </label>
                <label>
                  {t('cleaningIncidents.cleaner')}
                  <input type="text" value={selectedCleanerLabel} readOnly />
                </label>
                <label className="form-field-wide">
                  {t('cleaningIncidents.description')}
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
