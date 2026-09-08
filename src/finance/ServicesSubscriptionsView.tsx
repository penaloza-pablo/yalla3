import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  addMonthsToDate,
  intervalMonths,
  IVA_MULTIPLIER,
  parseOccurrences,
  roundMoney,
  type FinanceRecurrence,
  type FinanceServiceOccurrence,
  type FinanceServiceType,
} from '../../amplify/functions/shared/finance-services'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { fetchJson } from '../operations/api'
import { getTodayMadrid } from '../operations/dateHelpers'
import {
  filterMovementsPropertyOptions,
  getPropertyLabel,
} from '../operations/propertyHelpers'
import type { PropertyOption } from '../operations/types'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
  isSummaryInfoOpen: boolean
  onToggleSummaryInfo: () => void
  searchQuery: string
  onSearchQueryChange: (value: string) => void
}

type ServiceRow = {
  id: string
  type: FinanceServiceType
  propertyId: string
  propertyName: string
  title: string
  recurrence: FinanceRecurrence
  startDate: string
  items: FinanceServiceOccurrence[]
}

type FormState = {
  type: FinanceServiceType
  propertyId: string
  title: string
  recurrence: FinanceRecurrence
  startDate: string
}

const RECURRENCE_KEYS: Record<FinanceRecurrence, string> = {
  monthly: 'services.recurrenceMonthly',
  bimonthly: 'services.recurrenceBimonthly',
  quarterly: 'services.recurrenceQuarterly',
  semiannual: 'services.recurrenceSemiannual',
  annual: 'services.recurrenceAnnual',
  other: 'services.recurrenceOther',
}

const emptyForm = (): FormState => ({
  type: 'apartment',
  propertyId: '',
  title: '',
  recurrence: 'monthly',
  startDate: getTodayMadrid(),
})

const mapService = (item: Record<string, unknown>): ServiceRow => {
  const id = String(item.id ?? '')
  const recurrence = (
    Object.keys(RECURRENCE_KEYS) as FinanceRecurrence[]
  ).includes(item.recurrence as FinanceRecurrence)
    ? (item.recurrence as FinanceRecurrence)
    : 'monthly'
  return {
    id,
    type: item.type === 'ops' ? 'ops' : 'apartment',
    propertyId: String(item.propertyId ?? ''),
    propertyName: String(item.propertyName ?? item.propertyId ?? ''),
    title: String(item.title ?? ''),
    recurrence,
    startDate: String(item.startDate ?? '').slice(0, 10),
    items: parseOccurrences(item.items, id),
  }
}

export function ServicesSubscriptionsView({
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
      get: getEndpoint('getFinanceServicesUrl'),
      upsert: getEndpoint('upsertFinanceServiceUrl'),
    }),
    [getEndpoint],
  )
  const properties = useMemo(
    () => filterMovementsPropertyOptions(propertyOptions),
    [propertyOptions],
  )
  const propertyById = useMemo(
    () =>
      new Map(properties.map((property) => [property.id, getPropertyLabel(property)])),
    [properties],
  )

  const [rows, setRows] = useState<ServiceRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState<FormState>(emptyForm)
  const [expandedId, setExpandedId] = useState('')
  const [draftItems, setDraftItems] = useState<FinanceServiceOccurrence[]>([])

  const money = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language.startsWith('es') ? 'es-ES' : 'en-GB', {
        style: 'currency',
        currency: 'EUR',
      }),
    [i18n.language],
  )

  const loadRows = useCallback(async () => {
    if (!endpoints.get) {
      setError(t('services.missingEndpoint'))
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
        endpoints.get,
      )
      setRows((payload.items ?? []).map(mapService))
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : t('services.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [endpoints.get, t])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return rows
    }
    return rows.filter((row) =>
      [
        row.id,
        row.title,
        row.type,
        row.recurrence,
        row.propertyName,
        propertyById.get(row.propertyId) ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query),
    )
  }, [propertyById, rows, searchQuery])

  const openCreate = () => {
    setEditingId('')
    setForm(emptyForm())
    setIsFormOpen(true)
    setMessage(null)
    setError(null)
  }

  const openEdit = (row: ServiceRow) => {
    setEditingId(row.id)
    setForm({
      type: row.type,
      propertyId: row.propertyId,
      title: row.title,
      recurrence: row.recurrence,
      startDate: row.startDate || getTodayMadrid(),
    })
    setIsFormOpen(true)
    setMessage(null)
    setError(null)
  }

  const toggleExpand = (row: ServiceRow) => {
    if (expandedId === row.id) {
      setExpandedId('')
      setDraftItems([])
      return
    }
    setExpandedId(row.id)
    setDraftItems(row.items)
  }

  const saveForm = async () => {
    if (!endpoints.upsert) {
      setError(t('services.missingWrite'))
      return
    }
    if (!form.title.trim() || !form.startDate) {
      setError(t('services.validation'))
      return
    }
    if (form.type === 'apartment' && !form.propertyId) {
      setError(t('services.validationProperty'))
      return
    }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const payload = await fetchJson<{ item?: Record<string, unknown> }>(
        endpoints.upsert,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            ...(editingId ? { id: editingId } : {}),
            type: form.type,
            propertyId: form.type === 'apartment' ? form.propertyId : '',
            propertyName:
              form.type === 'apartment'
                ? propertyById.get(form.propertyId) || form.propertyId
                : '',
            title: form.title.trim(),
            recurrence: form.recurrence,
            startDate: form.startDate,
          }),
        },
      )
      setIsFormOpen(false)
      setMessage(t('services.saved'))
      await loadRows()
      const savedId = String(payload.item?.id ?? editingId)
      if (savedId) {
        const mapped = payload.item ? mapService(payload.item) : null
        setExpandedId(savedId)
        setDraftItems(mapped?.items ?? [])
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t('services.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const saveOccurrences = async (row: ServiceRow) => {
    if (!endpoints.upsert) {
      setError(t('services.missingWrite'))
      return
    }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      await fetchJson(endpoints.upsert, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: row.id,
          type: row.type,
          propertyId: row.propertyId,
          propertyName: row.propertyName,
          title: row.title,
          recurrence: row.recurrence,
          startDate: row.startDate,
          items: draftItems,
        }),
      })
      setMessage(t('services.occurrencesSaved'))
      await loadRows()
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t('services.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const deleteRow = async (row: ServiceRow) => {
    if (!endpoints.upsert) {
      setError(t('services.missingWrite'))
      return
    }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      await fetchJson(endpoints.upsert, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: row.id, action: 'delete' }),
      })
      if (expandedId === row.id) {
        setExpandedId('')
        setDraftItems([])
      }
      setMessage(t('services.deleted'))
      await loadRows()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t('services.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const updateDraft = (
    index: number,
    patch: Partial<FinanceServiceOccurrence>,
  ) => {
    setDraftItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item
        }
        const next = { ...item, ...patch }
        const price = Math.max(0, Number(next.price) || 0)
        return {
          ...next,
          price: roundMoney(price),
          priceWithIva: roundMoney(
            next.appliesIva ? price * IVA_MULTIPLIER : price,
          ),
        }
      }),
    )
  }

  const addOccurrence = (row: ServiceRow) => {
    const last = draftItems[draftItems.length - 1]
    const months = intervalMonths(row.recurrence) || 1
    const nextDate = last
      ? addMonthsToDate(last.billingDate, months)
      : row.startDate || getTodayMadrid()
    const period = nextDate.slice(0, 7)
    setDraftItems((current) =>
      [
        ...current,
        {
          id: `${row.id}-${period}-${current.length + 1}`,
          period,
          billingDate: nextDate,
          price: last?.price ?? 0,
          appliesIva: last?.appliesIva ?? false,
          priceWithIva: last?.priceWithIva ?? 0,
        },
      ].sort((left, right) => left.billingDate.localeCompare(right.billingDate)),
    )
  }

  const removeOccurrence = (index: number) => {
    setDraftItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('services.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Services & Subscriptions')}</h1>
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
          <p className="subtitle">{t('services.subtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <input
              className="search-input"
              placeholder={t('services.search')}
              type="search"
              aria-label={t('services.search')}
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
            />
            <div className="header-actions">
              <button
                className="btn-ghost"
                type="button"
                onClick={openCreate}
                aria-label={t('services.add')}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
                  <path d="M9 4h2v5h5v2h-5v5H9v-5H4V9h5V4z" fill="currentColor" />
                </svg>
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => void loadRows()}
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
          <p className="card-label">{t('services.totalCard')}</p>
          <p className="card-value">{isLoading ? '—' : filteredRows.length}</p>
        </div>
        <div className="card card-compact">
          <p className="card-label">{t('services.apartmentCard')}</p>
          <p className="card-value">
            {isLoading
              ? '—'
              : filteredRows.filter((row) => row.type === 'apartment').length}
          </p>
        </div>
        <div className="card card-compact">
          <p className="card-label">{t('services.opsCard')}</p>
          <p className="card-value">
            {isLoading
              ? '—'
              : filteredRows.filter((row) => row.type === 'ops').length}
          </p>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('services.cardTitle')}</h2>
            <p className="card-subtitle">{t('services.cardSubtitle')}</p>
          </div>
          <button className="btn-primary" type="button" onClick={openCreate}>
            {t('services.add')}
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('services.type')}</th>
                <th>{t('services.property')}</th>
                <th>{t('services.title')}</th>
                <th>{t('services.recurrence')}</th>
                <th>{t('services.occurrences')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6}>{t('common.loading')}</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    {rows.length === 0
                      ? t('services.empty')
                      : t('services.emptyFiltered')}
                  </td>
                </tr>
              ) : (
                filteredRows.flatMap((row) => {
                  const expanded = expandedId === row.id
                  const items = expanded ? draftItems : row.items
                  const propertyLabel =
                    propertyById.get(row.propertyId) || row.propertyName || '—'
                  const main = (
                    <tr key={row.id}>
                      <td>
                        {row.type === 'ops'
                          ? t('services.typeOps')
                          : t('services.typeApartment')}
                      </td>
                      <td>{row.type === 'apartment' ? propertyLabel : '—'}</td>
                      <td>{row.title}</td>
                      <td>{t(RECURRENCE_KEYS[row.recurrence])}</td>
                      <td>{row.items.length}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="btn-secondary"
                            type="button"
                            onClick={() => toggleExpand(row)}
                          >
                            {expanded
                              ? t('services.hideItems')
                              : t('services.showItems')}
                          </button>
                          <button
                            className="btn-secondary"
                            type="button"
                            onClick={() => openEdit(row)}
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            className="btn-secondary"
                            type="button"
                            disabled={isSaving}
                            onClick={() => void deleteRow(row)}
                          >
                            {t('common.delete')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                  if (!expanded) {
                    return [main]
                  }
                  return [
                    main,
                    <tr key={`${row.id}-items`} className="detail-row">
                      <td colSpan={6}>
                        <div className="nested-table-wrap">
                          <table className="nested-data-table">
                            <thead>
                              <tr>
                                <th>{t('services.billingDate')}</th>
                                <th>{t('services.price')}</th>
                                <th>{t('services.appliesIva')}</th>
                                <th>{t('services.priceWithIva')}</th>
                                <th>{t('common.actions')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.length === 0 ? (
                                <tr>
                                  <td colSpan={5}>
                                    {t('services.emptyOccurrences')}
                                  </td>
                                </tr>
                              ) : (
                                items.map((item, index) => (
                                  <tr key={item.id}>
                                    <td>
                                      <input
                                        type="date"
                                        value={item.billingDate}
                                        onChange={(event) =>
                                          updateDraft(index, {
                                            billingDate: event.target.value,
                                            period: event.target.value.slice(0, 7),
                                          })
                                        }
                                      />
                                    </td>
                                    <td>
                                      <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={item.price}
                                        onChange={(event) =>
                                          updateDraft(index, {
                                            price: Number(event.target.value),
                                          })
                                        }
                                      />
                                    </td>
                                    <td>
                                      <label className="filter-option">
                                        <input
                                          type="checkbox"
                                          checked={item.appliesIva}
                                          onChange={(event) =>
                                            updateDraft(index, {
                                              appliesIva: event.target.checked,
                                            })
                                          }
                                        />
                                        <span>{t('services.appliesIva')}</span>
                                      </label>
                                    </td>
                                    <td>{money.format(item.priceWithIva)}</td>
                                    <td>
                                      <button
                                        className="btn-secondary"
                                        type="button"
                                        onClick={() => removeOccurrence(index)}
                                      >
                                        {t('common.delete')}
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                          <div className="table-actions nested-table-actions">
                            <button
                              className="btn-secondary"
                              type="button"
                              onClick={() => addOccurrence(row)}
                            >
                              {t('services.addOccurrence')}
                            </button>
                            <button
                              className="btn-primary"
                              type="button"
                              disabled={isSaving}
                              onClick={() => void saveOccurrences(row)}
                            >
                              {t('services.saveOccurrences')}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>,
                  ]
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isFormOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {editingId ? t('services.editTitle') : t('services.formTitle')}
                </h3>
                <p className="modal-subtitle">{t('services.formSubtitle')}</p>
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
                  {t('services.type')}
                  <select
                    value={form.type}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        type: event.target.value as FinanceServiceType,
                        propertyId:
                          event.target.value === 'ops' ? '' : current.propertyId,
                      }))
                    }
                  >
                    <option value="apartment">{t('services.typeApartment')}</option>
                    <option value="ops">{t('services.typeOps')}</option>
                  </select>
                </label>
                {form.type === 'apartment' ? (
                  <label>
                    {t('services.property')}
                    <select
                      value={form.propertyId}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          propertyId: event.target.value,
                        }))
                      }
                    >
                      <option value="">{t('services.selectProperty')}</option>
                      {properties.map((property) => (
                        <option key={property.id} value={property.id}>
                          {getPropertyLabel(property)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label>
                  {t('services.title')}
                  <input
                    type="text"
                    value={form.title}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {t('services.recurrence')}
                  <select
                    value={form.recurrence}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        recurrence: event.target.value as FinanceRecurrence,
                      }))
                    }
                  >
                    <option value="monthly">{t('services.recurrenceMonthly')}</option>
                    <option value="bimonthly">
                      {t('services.recurrenceBimonthly')}
                    </option>
                    <option value="quarterly">
                      {t('services.recurrenceQuarterly')}
                    </option>
                    <option value="semiannual">
                      {t('services.recurrenceSemiannual')}
                    </option>
                    <option value="annual">{t('services.recurrenceAnnual')}</option>
                    <option value="other">{t('services.recurrenceOther')}</option>
                  </select>
                </label>
                <label>
                  {t('services.startDate')}
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        startDate: event.target.value,
                      }))
                    }
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
                onClick={() => void saveForm()}
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
