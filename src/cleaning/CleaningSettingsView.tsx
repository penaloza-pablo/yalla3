import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { fetchJson } from '../operations/api'
import { getPropertyLabel } from '../operations/propertyHelpers'
import type { PropertyOption } from '../operations/types'
import type {
  CleanerRecord,
  PropertyCleaningDetailsRecord,
  PropertyCleaningType,
} from './types'
import { StarRating } from './StarRating'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
}

type SettingsSection = 'cleaners' | 'propertyDetails'

type TypeDraft = {
  id: string
  name: string
  price: string
  durationHours: string
  isDefault: boolean
}

const emptyCleanerForm = () => ({
  id: '',
  name: '',
  active: true,
})

const emptyTypeDraft = (isDefault = false): TypeDraft => ({
  id: '',
  name: '',
  price: '',
  durationHours: '',
  isDefault,
})

const toNumber = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const mapCleaner = (item: Record<string, unknown>): CleanerRecord => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? item.id ?? ''),
  active: item.active !== false,
  cleaningsCount: toNumber(item.cleaningsCount),
  incidentsCount: toNumber(item.incidentsCount),
  uniqueIncidentVisitCount: toNumber(item.uniqueIncidentVisitCount),
  historicalRating: toNumber(item.historicalRating),
  trendRating: toNumber(item.trendRating),
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
  updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
})

const mapCleaningType = (item: Record<string, unknown>): PropertyCleaningType => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? ''),
  price: Number(item.price ?? 0),
  durationHours: Number(item.durationHours ?? 0),
  isDefault: Boolean(item.isDefault),
})

const mapDetails = (
  item: Record<string, unknown>,
): PropertyCleaningDetailsRecord => ({
  id: String(item.id ?? item.propertyId ?? ''),
  propertyId: String(item.propertyId ?? item.id ?? ''),
  nickname: String(item.nickname ?? item.propertyId ?? item.id ?? ''),
  cleaningTypes: Array.isArray(item.cleaningTypes)
    ? (item.cleaningTypes as Record<string, unknown>[]).map(mapCleaningType)
    : [],
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
  updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
})

const formatDuration = (hours: number) => {
  if (!Number.isFinite(hours) || hours <= 0) {
    return '—'
  }
  return `${hours}`.replace('.', ',')
}

const formatPrice = (price: number) => {
  if (!Number.isFinite(price)) {
    return '—'
  }
  return `${price}€`
}

const typesToDrafts = (types: PropertyCleaningType[]): TypeDraft[] => {
  if (types.length === 0) {
    return [emptyTypeDraft(true)]
  }
  return types.map((type) => ({
    id: type.id,
    name: type.name,
    price: Number.isFinite(type.price) ? String(type.price) : '',
    durationHours: Number.isFinite(type.durationHours)
      ? String(type.durationHours)
      : '',
    isDefault: type.isDefault,
  }))
}

export function CleaningSettingsView({ getEndpoint, propertyOptions }: Props) {
  const { t } = useTranslation()
  const endpoints = useMemo(
    () => ({
      getCleaners: getEndpoint(
        'getCleanersUrl',
        import.meta.env.VITE_GET_CLEANERS_URL,
      ),
      upsertCleaner: getEndpoint(
        'upsertCleanerUrl',
        import.meta.env.VITE_UPSERT_CLEANER_URL,
      ),
      getDetails: getEndpoint(
        'getPropertyCleaningDetailsUrl',
        import.meta.env.VITE_GET_PROPERTY_CLEANING_DETAILS_URL,
      ),
      upsertDetails: getEndpoint(
        'upsertPropertyCleaningDetailsUrl',
        import.meta.env.VITE_UPSERT_PROPERTY_CLEANING_DETAILS_URL,
      ),
      properties: getEndpoint(
        'getPropertiesUrl',
        import.meta.env.VITE_GET_PROPERTIES_URL,
      ),
    }),
    [getEndpoint],
  )

  const [section, setSection] = useState<SettingsSection | null>(null)
  const [cleaners, setCleaners] = useState<CleanerRecord[]>([])
  const [details, setDetails] = useState<PropertyCleaningDetailsRecord[]>([])
  const [properties, setProperties] = useState<PropertyOption[]>(propertyOptions)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isCleanerFormOpen, setIsCleanerFormOpen] = useState(false)
  const [isAddPropertyOpen, setIsAddPropertyOpen] = useState(false)
  const [cleanerForm, setCleanerForm] = useState(emptyCleanerForm())
  const [selectedPropertyId, setSelectedPropertyId] = useState('')
  const [editingPropertyId, setEditingPropertyId] = useState('')
  const [typeDrafts, setTypeDrafts] = useState<TypeDraft[]>([emptyTypeDraft(true)])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const propertyById = useMemo(
    () =>
      new Map(
        properties.map((property) => [property.id, getPropertyLabel(property)]),
      ),
    [properties],
  )
  const configuredIds = useMemo(
    () => new Set(details.map((item) => item.propertyId)),
    [details],
  )
  const availableProperties = useMemo(
    () =>
      properties
        .filter((property) => property.id && !configuredIds.has(property.id))
        .sort((a, b) =>
          getPropertyLabel(a).localeCompare(getPropertyLabel(b), undefined, {
            sensitivity: 'base',
          }),
        ),
    [configuredIds, properties],
  )
  const editingDetails = details.find(
    (item) => item.propertyId === editingPropertyId,
  )
  const activeCleanersCount = cleaners.filter((cleaner) => cleaner.active).length

  const loadCleaners = useCallback(async () => {
    if (!endpoints.getCleaners) {
      setError(t('cleaningSettings.missingEndpoint'))
      return
    }
    if (endpoints.upsertCleaner) {
      try {
        await fetchJson(endpoints.upsertCleaner, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'reconcileStats' }),
        })
      } catch {
        // Keep loading cleaners even if the backfill has not been deployed yet.
      }
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      `${endpoints.getCleaners}?includeInactive=true`,
    )
    setCleaners((payload.items ?? []).map(mapCleaner))
  }, [endpoints.getCleaners, endpoints.upsertCleaner, t])

  const loadDetails = useCallback(async () => {
    if (!endpoints.getDetails) {
      return
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      endpoints.getDetails,
    )
    setDetails((payload.items ?? []).map(mapDetails))
  }, [endpoints.getDetails])

  const loadProperties = useCallback(async () => {
    if (!endpoints.properties) {
      return
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      endpoints.properties,
    )
    setProperties(
      (payload.items ?? []).map((item) => ({
        id: String(item.id ?? ''),
        nickname: String(
          item.nickname ?? item.Nickname ?? item.title ?? item.id ?? '',
        ),
        title: String(item.title ?? ''),
        listingNickname: String(
          item.ListingNickname ?? item.listingNickname ?? item.nickname ?? '',
        ),
      })),
    )
  }, [endpoints.properties])

  const refreshAll = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      await Promise.all([loadCleaners(), loadDetails(), loadProperties()])
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningSettings.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [loadCleaners, loadDetails, loadProperties, t])

  useEffect(() => {
    setProperties(propertyOptions)
  }, [propertyOptions])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  const openCreateCleaner = () => {
    setCleanerForm(emptyCleanerForm())
    setIsCleanerFormOpen(true)
    setMessage('')
    setError('')
  }

  const openEditCleaner = (cleaner: CleanerRecord) => {
    setCleanerForm({
      id: cleaner.id,
      name: cleaner.name,
      active: cleaner.active,
    })
    setIsCleanerFormOpen(true)
    setMessage('')
    setError('')
  }

  const saveCleaner = async () => {
    if (!endpoints.upsertCleaner) {
      setError(t('cleaningSettings.missingWrite'))
      return
    }
    if (!cleanerForm.name.trim()) {
      setError(t('cleaningSettings.nameRequired'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertCleaner, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: cleanerForm.id || undefined,
          name: cleanerForm.name.trim(),
          active: cleanerForm.active,
        }),
      })
      setIsCleanerFormOpen(false)
      setMessage(
        cleanerForm.id
          ? t('cleaningSettings.updated')
          : t('cleaningSettings.created'),
      )
      await loadCleaners()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningSettings.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const toggleActive = async (cleaner: CleanerRecord) => {
    if (!endpoints.upsertCleaner) {
      setError(t('cleaningSettings.missingWrite'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertCleaner, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: cleaner.id,
          name: cleaner.name,
          active: !cleaner.active,
        }),
      })
      setMessage(
        cleaner.active
          ? t('cleaningSettings.deactivated')
          : t('cleaningSettings.activated'),
      )
      await loadCleaners()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningSettings.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const saveDetails = async (
    propertyId: string,
    nickname: string,
    types: TypeDraft[],
  ) => {
    if (!endpoints.upsertDetails) {
      setError(t('cleaningSettings.missingDetailsWrite'))
      return false
    }
    const cleaningTypes = types
      .map((draft) => ({
        id: draft.id || undefined,
        name: draft.name.trim(),
        price: Number(draft.price),
        durationHours: Number(String(draft.durationHours).replace(',', '.')),
        isDefault: draft.isDefault,
      }))
      .filter((type) => type.name)
    if (cleaningTypes.some((type) => !(type.durationHours > 0))) {
      setError(t('cleaningSettings.durationRequired'))
      return false
    }
    if (cleaningTypes.some((type) => !Number.isFinite(type.price) || type.price < 0)) {
      setError(t('cleaningSettings.priceRequired'))
      return false
    }
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertDetails, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          nickname,
          cleaningTypes,
        }),
      })
      await loadDetails()
      return true
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningSettings.detailsSaveError'),
      )
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const addProperty = async () => {
    if (!selectedPropertyId) {
      setError(t('cleaningSettings.propertyRequired'))
      return
    }
    const nickname =
      propertyById.get(selectedPropertyId) || selectedPropertyId
    const ok = await saveDetails(selectedPropertyId, nickname, [
      emptyTypeDraft(true),
    ])
    if (ok) {
      setIsAddPropertyOpen(false)
      setSelectedPropertyId('')
      setEditingPropertyId(selectedPropertyId)
      setTypeDrafts([emptyTypeDraft(true)])
      setMessage(t('cleaningSettings.propertyAdded'))
    }
  }

  const openEditDetails = (item: PropertyCleaningDetailsRecord) => {
    setEditingPropertyId(item.propertyId)
    setTypeDrafts(typesToDrafts(item.cleaningTypes))
    setIsAddPropertyOpen(false)
    setMessage('')
    setError('')
  }

  const saveEditingTypes = async () => {
    if (!editingPropertyId) {
      return
    }
    const nickname =
      editingDetails?.nickname ||
      propertyById.get(editingPropertyId) ||
      editingPropertyId
    const named = typeDrafts.filter((draft) => draft.name.trim())
    if (named.length === 0) {
      setError(t('cleaningSettings.typeNameRequired'))
      return
    }
    const ok = await saveDetails(editingPropertyId, nickname, named)
    if (ok) {
      setEditingPropertyId('')
      setMessage(t('cleaningSettings.detailsUpdated'))
    }
  }

  const removeProperty = async (item: PropertyCleaningDetailsRecord) => {
    if (!endpoints.upsertDetails) {
      setError(t('cleaningSettings.missingDetailsWrite'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertDetails, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          propertyId: item.propertyId,
        }),
      })
      if (editingPropertyId === item.propertyId) {
        setEditingPropertyId('')
      }
      setMessage(t('cleaningSettings.propertyRemoved'))
      await loadDetails()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningSettings.detailsSaveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const updateTypeDraft = (index: number, patch: Partial<TypeDraft>) => {
    setTypeDrafts((current) =>
      current.map((draft, draftIndex) => {
        if (draftIndex !== index) {
          if (patch.isDefault) {
            return { ...draft, isDefault: false }
          }
          return draft
        }
        return { ...draft, ...patch }
      }),
    )
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('cleaningSettings.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Cleaning settings')}</h1>
          </div>
          <p className="subtitle">{t('cleaningSettings.subtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <div className="header-actions">
              <button
                className="btn-primary"
                type="button"
                onClick={() => void refreshAll()}
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

      {message ? <p className="notice success">{message}</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      <section className="summary-cards cleaning-settings-cards">
        <button
          type="button"
          className={`card card-compact summary-card-button ${
            section === 'cleaners' ? 'is-selected' : ''
          }`}
          onClick={() =>
            setSection((current) =>
              current === 'cleaners' ? null : 'cleaners',
            )
          }
        >
          <p className="card-label">{t('cleaningSettings.cleanersCard')}</p>
          <p className="card-value">{isLoading ? '—' : activeCleanersCount}</p>
          <p className="card-meta">{t('cleaningSettings.cleanersCardMeta')}</p>
        </button>
        <button
          type="button"
          className={`card card-compact summary-card-button ${
            section === 'propertyDetails' ? 'is-selected' : ''
          }`}
          onClick={() =>
            setSection((current) =>
              current === 'propertyDetails' ? null : 'propertyDetails',
            )
          }
        >
          <p className="card-label">{t('cleaningSettings.detailsCard')}</p>
          <p className="card-value">{isLoading ? '—' : details.length}</p>
          <p className="card-meta">{t('cleaningSettings.detailsCardMeta')}</p>
        </button>
      </section>

      {section === 'cleaners' ? (
        <>
          {isCleanerFormOpen ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">
                    {cleanerForm.id
                      ? t('cleaningSettings.editCleaner')
                      : t('cleaningSettings.addCleaner')}
                  </h2>
                </div>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setIsCleanerFormOpen(false)}
                >
                  {t('common.cancel')}
                </button>
              </div>
              <div className="filters-grid">
                <label>
                  {t('cleaningSettings.name')}
                  <input
                    type="text"
                    value={cleanerForm.name}
                    onChange={(event) =>
                      setCleanerForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={cleanerForm.active}
                    onChange={(event) =>
                      setCleanerForm((current) => ({
                        ...current,
                        active: event.target.checked,
                      }))
                    }
                  />
                  {t('cleaningSettings.active')}
                </label>
              </div>
              <div className="page-action-bar" style={{ marginTop: 16 }}>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveCleaner()}
                >
                  {isSaving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  {t('cleaningSettings.cleanersCard')}
                </h2>
                <p className="card-subtitle">
                  {t('cleaningSettings.cleanersSubtitle')}
                </p>
              </div>
              <button
                className="btn-secondary"
                type="button"
                onClick={openCreateCleaner}
              >
                {t('cleaningSettings.addCleaner')}
              </button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('cleaningSettings.name')}</th>
                    <th>{t('cleaningSettings.status')}</th>
                    <th>{t('cleaningSettings.cleanings')}</th>
                    <th>{t('cleaningSettings.incidents')}</th>
                    <th>{t('cleaningSettings.historicalRating')}</th>
                    <th>{t('cleaningSettings.trendRating')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7}>{t('common.loading')}</td>
                    </tr>
                  ) : cleaners.length === 0 ? (
                    <tr>
                      <td colSpan={7}>{t('cleaningSettings.empty')}</td>
                    </tr>
                  ) : (
                    cleaners.map((cleaner) => (
                      <tr key={cleaner.id}>
                        <td>{cleaner.name}</td>
                        <td>
                          <span className={`tag ${cleaner.active ? '' : 'muted'}`}>
                            {cleaner.active
                              ? t('cleaningSettings.active')
                              : t('cleaningSettings.inactive')}
                          </span>
                        </td>
                        <td>{cleaner.cleaningsCount ?? 0}</td>
                        <td>{cleaner.incidentsCount ?? 0}</td>
                        <td>
                          <StarRating
                            value={
                              (cleaner.cleaningsCount ?? 0) > 0
                                ? cleaner.historicalRating
                                : undefined
                            }
                          />
                        </td>
                        <td>
                          <StarRating
                            value={
                              (cleaner.cleaningsCount ?? 0) > 0
                                ? cleaner.trendRating
                                : undefined
                            }
                          />
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="btn-secondary"
                              type="button"
                              onClick={() => openEditCleaner(cleaner)}
                            >
                              {t('cleaningSettings.edit')}
                            </button>
                            <button
                              className="btn-secondary"
                              type="button"
                              disabled={isSaving}
                              onClick={() => void toggleActive(cleaner)}
                            >
                              {cleaner.active
                                ? t('cleaningSettings.deactivate')
                                : t('cleaningSettings.activate')}
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
        </>
      ) : null}

      {section === 'propertyDetails' ? (
        <>
          {isAddPropertyOpen ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">
                    {t('cleaningSettings.addProperty')}
                  </h2>
                </div>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setIsAddPropertyOpen(false)}
                >
                  {t('common.cancel')}
                </button>
              </div>
              <div className="filters-grid">
                <label>
                  {t('cleaningSettings.property')}
                  <select
                    value={selectedPropertyId}
                    onChange={(event) =>
                      setSelectedPropertyId(event.target.value)
                    }
                  >
                    <option value="">
                      {t('cleaningSettings.selectProperty')}
                    </option>
                    {availableProperties.map((property) => (
                      <option key={property.id} value={property.id}>
                        {getPropertyLabel(property)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="page-action-bar" style={{ marginTop: 16 }}>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={isSaving || !selectedPropertyId}
                  onClick={() => void addProperty()}
                >
                  {isSaving ? t('common.saving') : t('cleaningSettings.addProperty')}
                </button>
              </div>
            </section>
          ) : null}

          {editingPropertyId ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">
                    {t('cleaningSettings.editTypes', {
                      property:
                        editingDetails?.nickname ||
                        propertyById.get(editingPropertyId) ||
                        editingPropertyId,
                    })}
                  </h2>
                  <p className="card-subtitle">
                    {t('cleaningSettings.editTypesSubtitle')}
                  </p>
                </div>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setEditingPropertyId('')}
                >
                  {t('common.cancel')}
                </button>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t('cleaningSettings.typeName')}</th>
                      <th>{t('cleaningSettings.price')}</th>
                      <th>{t('cleaningSettings.duration')}</th>
                      <th>{t('cleaningSettings.defaultType')}</th>
                      <th>{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeDrafts.map((draft, index) => (
                      <tr key={draft.id || `new-${index}`}>
                        <td>
                          <input
                            type="text"
                            value={draft.name}
                            onChange={(event) =>
                              updateTypeDraft(index, {
                                name: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={draft.price}
                            onChange={(event) =>
                              updateTypeDraft(index, {
                                price: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0.25"
                            step="0.25"
                            value={draft.durationHours}
                            onChange={(event) =>
                              updateTypeDraft(index, {
                                durationHours: event.target.value,
                              })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={draft.isDefault}
                            onChange={(event) =>
                              updateTypeDraft(index, {
                                isDefault: event.target.checked,
                              })
                            }
                          />
                        </td>
                        <td>
                          <button
                            className="btn-secondary"
                            type="button"
                            disabled={typeDrafts.length === 1}
                            onClick={() =>
                              setTypeDrafts((current) => {
                                const next = current.filter(
                                  (_, draftIndex) => draftIndex !== index,
                                )
                                if (!next.some((entry) => entry.isDefault) && next[0]) {
                                  next[0] = { ...next[0], isDefault: true }
                                }
                                return next
                              })
                            }
                          >
                            {t('cleaningSettings.removeType')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="page-action-bar" style={{ marginTop: 16 }}>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() =>
                    setTypeDrafts((current) => [
                      ...current,
                      emptyTypeDraft(current.length === 0),
                    ])
                  }
                >
                  {t('cleaningSettings.addType')}
                </button>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveEditingTypes()}
                >
                  {isSaving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  {t('cleaningSettings.detailsCard')}
                </h2>
                <p className="card-subtitle">
                  {t('cleaningSettings.detailsSubtitle')}
                </p>
              </div>
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  setIsAddPropertyOpen(true)
                  setEditingPropertyId('')
                  setSelectedPropertyId('')
                  setMessage('')
                  setError('')
                }}
              >
                {t('cleaningSettings.addProperty')}
              </button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('cleaningSettings.property')}</th>
                    <th>{t('cleaningSettings.types')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={3}>{t('common.loading')}</td>
                    </tr>
                  ) : details.length === 0 ? (
                    <tr>
                      <td colSpan={3}>{t('cleaningSettings.emptyDetails')}</td>
                    </tr>
                  ) : (
                    details.map((item) => (
                      <tr key={item.propertyId}>
                        <td>
                          {propertyById.get(item.propertyId) || item.nickname}
                        </td>
                        <td>
                          {item.cleaningTypes.length === 0 ? (
                            <span className="card-meta">
                              {t('cleaningSettings.noTypes')}
                            </span>
                          ) : (
                            <ul className="cleaning-type-summary">
                              {item.cleaningTypes.map((type) => (
                                <li key={type.id}>
                                  {type.name}: {formatPrice(type.price)},{' '}
                                  {t('cleaningSettings.durationValue', {
                                    hours: formatDuration(type.durationHours),
                                  })}
                                  {type.isDefault
                                    ? ` · ${t('cleaningSettings.defaultYes')}`
                                    : ''}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="btn-secondary"
                              type="button"
                              onClick={() => openEditDetails(item)}
                            >
                              {t('cleaningSettings.editTypesAction')}
                            </button>
                            <button
                              className="btn-secondary"
                              type="button"
                              disabled={isSaving}
                              onClick={() => void removeProperty(item)}
                            >
                              {t('cleaningSettings.removeProperty')}
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
        </>
      ) : null}
    </>
  )
}
