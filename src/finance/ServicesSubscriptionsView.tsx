import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  occurrencePriceWithIva,
  parseOccurrences,
  roundMoney,
  type FinancePriceMode,
  type FinanceRecurrence,
  type FinanceServiceOccurrence,
  type FinanceServiceType,
} from '../../amplify/functions/shared/finance-services'
import { YallaSwitch } from '../bookings/YallaSwitch'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { fetchJson } from '../operations/api'
import { formatDateOnlyLabel, getTodayMadrid } from '../operations/dateHelpers'
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
  priceMode: FinancePriceMode
  price: number
  appliesIva: boolean
  priceWithIva: number
  items: FinanceServiceOccurrence[]
}

type BillingItem = FinanceServiceOccurrence & {
  serviceId: string
  type: FinanceServiceType
  propertyId: string
  propertyName: string
  title: string
  recurrence: FinanceRecurrence
}

type FormState = {
  type: FinanceServiceType
  propertyId: string
  title: string
  recurrence: FinanceRecurrence
  startDate: string
  priceMode: FinancePriceMode
  price: string
  appliesIva: boolean
}

type ItemFormState = {
  serviceId: string
  itemId: string
  billingDate: string
  price: string
  appliesIva: boolean
}

type Filters = {
  propertyIds: string[]
  types: FinanceServiceType[]
  dateFrom: string
  dateTo: string
}

const RECURRENCE_KEYS: Record<FinanceRecurrence, string> = {
  monthly: 'services.recurrenceMonthly',
  bimonthly: 'services.recurrenceBimonthly',
  quarterly: 'services.recurrenceQuarterly',
  semiannual: 'services.recurrenceSemiannual',
  annual: 'services.recurrenceAnnual',
  other: 'services.recurrenceOther',
}

const SERVICE_TYPES: FinanceServiceType[] = ['apartment', 'ops']

const emptyForm = (): FormState => ({
  type: 'apartment',
  propertyId: '',
  title: '',
  recurrence: 'monthly',
  startDate: getTodayMadrid(),
  priceMode: 'fixed',
  price: '',
  appliesIva: false,
})

const emptyFilters = (): Filters => ({
  propertyIds: [],
  types: [],
  dateFrom: '',
  dateTo: '',
})

const calendarMonthRange = (monthOffset: number) => {
  const today = getTodayMadrid()
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const total = year * 12 + (month - 1) + monthOffset
  const nextYear = Math.floor(total / 12)
  const nextMonth = (total % 12) + 1
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate()
  const mm = String(nextMonth).padStart(2, '0')
  return {
    dateFrom: `${nextYear}-${mm}-01`,
    dateTo: `${nextYear}-${mm}-${String(lastDay).padStart(2, '0')}`,
  }
}

const mapService = (item: Record<string, unknown>): ServiceRow => {
  const id = String(item.id ?? '')
  const recurrence = (
    Object.keys(RECURRENCE_KEYS) as FinanceRecurrence[]
  ).includes(item.recurrence as FinanceRecurrence)
    ? (item.recurrence as FinanceRecurrence)
    : 'monthly'
  const price = Number(item.price ?? 0)
  const appliesIva = Boolean(item.appliesIva)
  const storedWithIva = Number(item.priceWithIva)
  return {
    id,
    type: item.type === 'ops' ? 'ops' : 'apartment',
    propertyId: String(item.propertyId ?? ''),
    propertyName: String(item.propertyName ?? item.propertyId ?? ''),
    title: String(item.title ?? ''),
    recurrence,
    startDate: String(item.startDate ?? '').slice(0, 10),
    priceMode:
      item.priceMode === 'fixed' || item.priceMode === 'variable'
        ? item.priceMode
        : Number(item.price) > 0
          ? 'fixed'
          : 'variable',
    price: Number.isFinite(price) ? price : 0,
    appliesIva,
    priceWithIva: Number.isFinite(storedWithIva)
      ? storedWithIva
      : occurrencePriceWithIva(price, appliesIva),
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
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState<FormState>(emptyForm)
  const [itemForm, setItemForm] = useState<ItemFormState | null>(null)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [filterDraft, setFilterDraft] = useState<Filters>(emptyFilters)

  const money = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language.startsWith('es') ? 'es-ES' : 'en-GB', {
        style: 'currency',
        currency: 'EUR',
      }),
    [i18n.language],
  )

  const formPrice = Number(form.price)
  const formPriceWithIva = Number.isFinite(formPrice)
    ? occurrencePriceWithIva(formPrice, form.appliesIva)
    : 0
  const itemPrice = Number(itemForm?.price)
  const itemPriceWithIva = Number.isFinite(itemPrice)
    ? occurrencePriceWithIva(itemPrice, Boolean(itemForm?.appliesIva))
    : 0

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

  const allItems = useMemo<BillingItem[]>(
    () =>
      rows
        .flatMap((row) =>
          row.items.map((item) => ({
            ...item,
            serviceId: row.id,
            type: row.type,
            propertyId: row.propertyId,
            propertyName:
              propertyById.get(row.propertyId) || row.propertyName || '',
            title: row.title,
            recurrence: row.recurrence,
          })),
        )
        .sort((left, right) => {
          if (left.billingDate !== right.billingDate) {
            return left.billingDate.localeCompare(right.billingDate)
          }
          if (left.propertyName !== right.propertyName) {
            return left.propertyName.localeCompare(right.propertyName)
          }
          return left.title.localeCompare(right.title)
        }),
    [propertyById, rows],
  )

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return allItems.filter((item) => {
      if (
        filters.propertyIds.length > 0 &&
        !filters.propertyIds.includes(item.propertyId)
      ) {
        return false
      }
      if (filters.types.length > 0 && !filters.types.includes(item.type)) {
        return false
      }
      if (filters.dateFrom && item.billingDate < filters.dateFrom) {
        return false
      }
      if (filters.dateTo && item.billingDate > filters.dateTo) {
        return false
      }
      if (!query) {
        return true
      }
      return [
        item.title,
        item.propertyName,
        item.type,
        item.recurrence,
        item.billingDate,
        item.serviceId,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [allItems, filters, searchQuery])

  const totals = useMemo(() => {
    const apartment = filteredItems.filter((item) => item.type === 'apartment')
    const ops = filteredItems.filter((item) => item.type === 'ops')
    return {
      count: filteredItems.length,
      apartment: apartment.length,
      ops: ops.length,
      cost: filteredItems.reduce((sum, item) => sum + item.price, 0),
      costWithIva: filteredItems.reduce((sum, item) => sum + item.priceWithIva, 0),
    }
  }, [filteredItems])

  const activeFilterCount =
    filters.propertyIds.length +
    filters.types.length +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0)

  const currentMonthRange = calendarMonthRange(0)
  const previousMonthRange = calendarMonthRange(-1)
  const isCurrentMonthQuickFilterActive =
    filters.dateFrom === currentMonthRange.dateFrom &&
    filters.dateTo === currentMonthRange.dateTo
  const isPreviousMonthQuickFilterActive =
    filters.dateFrom === previousMonthRange.dateFrom &&
    filters.dateTo === previousMonthRange.dateTo

  const applyMonthRange = (range: { dateFrom: string; dateTo: string } | null) => {
    setFilters((current) => ({
      ...current,
      dateFrom: range?.dateFrom ?? '',
      dateTo: range?.dateTo ?? '',
    }))
    setFilterDraft((current) => ({
      ...current,
      dateFrom: range?.dateFrom ?? '',
      dateTo: range?.dateTo ?? '',
    }))
  }

  const toggleDraftValue = (key: 'propertyIds' | 'types', value: string) => {
    setFilterDraft((current) => {
      const selected = current[key] as string[]
      const next = selected.includes(value)
        ? selected.filter((entry) => entry !== value)
        : [...selected, value]
      return { ...current, [key]: next }
    })
  }

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
      priceMode: row.priceMode,
      price: row.priceMode === 'fixed' ? String(row.price) : '',
      appliesIva: row.appliesIva,
    })
    setIsFormOpen(true)
    setMessage(null)
    setError(null)
  }

  const openItemEdit = (item: BillingItem) => {
    setItemForm({
      serviceId: item.serviceId,
      itemId: item.id,
      billingDate: item.billingDate,
      price: String(item.price),
      appliesIva: item.appliesIva,
    })
    setMessage(null)
    setError(null)
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
    const price = Number(form.price)
    if (
      form.priceMode === 'fixed' &&
      (!Number.isFinite(price) || price < 0)
    ) {
      setError(t('services.validationPrice'))
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
          priceMode: form.priceMode,
          price: form.priceMode === 'fixed' ? price : 0,
          appliesIva: form.priceMode === 'fixed' ? form.appliesIva : false,
          priceEffectiveFrom: getTodayMadrid(),
        }),
      })
      setIsFormOpen(false)
      setMessage(t('services.saved'))
      await loadRows()
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t('services.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const saveItem = async () => {
    if (!endpoints.upsert || !itemForm) {
      setError(t('services.missingWrite'))
      return
    }
    const service = rows.find((row) => row.id === itemForm.serviceId)
    if (!service) {
      setError(t('services.saveError'))
      return
    }
    const price = Number(itemForm.price)
    if (!itemForm.billingDate || !Number.isFinite(price) || price < 0) {
      setError(t('services.validationItem'))
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
          id: service.id,
          type: service.type,
          propertyId: service.propertyId,
          propertyName: service.propertyName,
          title: service.title,
          recurrence: service.recurrence,
          startDate: service.startDate,
          priceMode: service.priceMode,
          price: service.price,
          appliesIva: service.appliesIva,
          items: service.items.map((item) =>
            item.id === itemForm.itemId
              ? {
                  ...item,
                  billingDate: itemForm.billingDate,
                  period: itemForm.billingDate.slice(0, 7),
                  price: roundMoney(price),
                  appliesIva: itemForm.appliesIva,
                  priceWithIva: occurrencePriceWithIva(price, itemForm.appliesIva),
                }
              : item,
          ),
        }),
      })
      setItemForm(null)
      setMessage(t('services.itemSaved'))
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
                className={`btn-ghost btn-filter ${isFilterOpen ? 'is-active' : ''}`}
                type="button"
                aria-label={t('common.filters')}
                onClick={() => {
                  setFilterDraft({
                    propertyIds: [...filters.propertyIds],
                    types: [...filters.types],
                    dateFrom: filters.dateFrom,
                    dateTo: filters.dateTo,
                  })
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
                className={`btn-ghost btn-filter ${
                  isCurrentMonthQuickFilterActive ? 'is-active' : ''
                }`}
                type="button"
                aria-pressed={isCurrentMonthQuickFilterActive}
                aria-label={t('common.quickFilterCurrentMonth')}
                onClick={() =>
                  applyMonthRange(
                    isCurrentMonthQuickFilterActive ? null : currentMonthRange,
                  )
                }
              >
                {t('common.quickFilterCurrentMonth')}
              </button>
              <button
                className={`btn-ghost btn-filter ${
                  isPreviousMonthQuickFilterActive ? 'is-active' : ''
                }`}
                type="button"
                aria-pressed={isPreviousMonthQuickFilterActive}
                aria-label={t('common.quickFilterPreviousMonth')}
                onClick={() =>
                  applyMonthRange(
                    isPreviousMonthQuickFilterActive ? null : previousMonthRange,
                  )
                }
              >
                {t('common.quickFilterPreviousMonth')}
              </button>
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
          <p className="card-label">{t('services.itemsCard')}</p>
          <p className="card-value">{isLoading ? '—' : totals.count}</p>
        </div>
        <div className="card card-compact">
          <p className="card-label">{t('services.apartmentCard')}</p>
          <p className="card-value">{isLoading ? '—' : totals.apartment}</p>
        </div>
        <div className="card card-compact">
          <p className="card-label">{t('services.opsCard')}</p>
          <p className="card-value">{isLoading ? '—' : totals.ops}</p>
        </div>
        <div className="card card-compact">
          <p className="card-label">{t('services.costCard')}</p>
          <p className="card-value">
            {isLoading ? '—' : money.format(totals.costWithIva)}
          </p>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('services.itemsTitle')}</h2>
            <p className="card-subtitle">{t('services.itemsSubtitle')}</p>
          </div>
          <button className="btn-primary" type="button" onClick={openCreate}>
            {t('services.add')}
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('services.billingDate')}</th>
                <th>{t('services.type')}</th>
                <th>{t('services.property')}</th>
                <th>{t('services.title')}</th>
                <th>{t('services.recurrence')}</th>
                <th>{t('services.price')}</th>
                <th>{t('services.appliesIva')}</th>
                <th>{t('services.priceWithIva')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9}>{t('common.loading')}</td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    {allItems.length === 0
                      ? t('services.emptyItems')
                      : t('services.emptyFiltered')}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={`${item.serviceId}-${item.id}`}>
                    <td>{formatDateOnlyLabel(item.billingDate, i18n.language)}</td>
                    <td>
                      {item.type === 'ops'
                        ? t('services.typeOps')
                        : t('services.typeApartment')}
                    </td>
                    <td>
                      {item.type === 'apartment'
                        ? item.propertyName || '—'
                        : '—'}
                    </td>
                    <td>{item.title}</td>
                    <td>{t(RECURRENCE_KEYS[item.recurrence])}</td>
                    <td>{money.format(item.price)}</td>
                    <td>{item.appliesIva ? t('common.yes') : t('common.no')}</td>
                    <td>{money.format(item.priceWithIva)}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() => openItemEdit(item)}
                        >
                          {t('common.edit')}
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

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('services.templatesTitle')}</h2>
            <p className="card-subtitle">{t('services.templatesSubtitle')}</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('services.type')}</th>
                <th>{t('services.property')}</th>
                <th>{t('services.title')}</th>
                <th>{t('services.recurrence')}</th>
                <th>{t('services.priceMode')}</th>
                <th>{t('services.price')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={7}>{t('services.empty')}</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      {row.type === 'ops'
                        ? t('services.typeOps')
                        : t('services.typeApartment')}
                    </td>
                    <td>
                      {row.type === 'apartment'
                        ? propertyById.get(row.propertyId) || row.propertyName || '—'
                        : '—'}
                    </td>
                    <td>{row.title}</td>
                    <td>{t(RECURRENCE_KEYS[row.recurrence])}</td>
                    <td>
                      {row.priceMode === 'fixed'
                        ? t('services.priceFixed')
                        : t('services.priceVariable')}
                    </td>
                    <td>
                      {row.priceMode === 'fixed' ? money.format(row.price) : '—'}
                    </td>
                    <td>
                      <div className="table-actions">
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
                <p className="modal-subtitle">{t('services.filterSubtitle')}</p>
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
                  <p className="filter-title">{t('services.property')}</p>
                  <div className="filter-options filter-options-scroll">
                    {properties.map((property) => (
                      <label className="filter-option" key={property.id}>
                        <input
                          type="checkbox"
                          checked={filterDraft.propertyIds.includes(property.id)}
                          onChange={() =>
                            toggleDraftValue('propertyIds', property.id)
                          }
                        />
                        <span>{getPropertyLabel(property)}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="filter-group">
                  <p className="filter-title">{t('services.type')}</p>
                  <div className="filter-options">
                    {SERVICE_TYPES.map((type) => (
                      <label className="filter-option" key={type}>
                        <input
                          type="checkbox"
                          checked={filterDraft.types.includes(type)}
                          onChange={() => toggleDraftValue('types', type)}
                        />
                        <span>
                          {type === 'ops'
                            ? t('services.typeOps')
                            : t('services.typeApartment')}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="filter-group">
                  <p className="filter-title">{t('common.dateRange')}</p>
                  <div className="form-grid">
                    <label className="form-field">
                      <span>{t('common.from')}</span>
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
                    <label className="form-field">
                      <span>{t('common.to')}</span>
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
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setFilterDraft(emptyFilters())}
              >
                {t('common.clear')}
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  setFilters({
                    propertyIds: [...filterDraft.propertyIds],
                    types: [...filterDraft.types],
                    dateFrom: filterDraft.dateFrom,
                    dateTo: filterDraft.dateTo,
                  })
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
                <div className="planner-switch">
                  <span>{t('services.priceVariable')}</span>
                  <YallaSwitch
                    on={form.priceMode === 'fixed'}
                    label={
                      form.priceMode === 'fixed'
                        ? t('services.priceFixed')
                        : t('services.priceVariable')
                    }
                    onToggle={() =>
                      setForm((current) => ({
                        ...current,
                        priceMode:
                          current.priceMode === 'fixed' ? 'variable' : 'fixed',
                      }))
                    }
                  />
                  <span>{t('services.priceFixed')}</span>
                </div>
                {form.priceMode === 'fixed' ? (
                  <>
                    <label>
                      {t('services.price')}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.price}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            price: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="filter-option">
                      <input
                        type="checkbox"
                        checked={form.appliesIva}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            appliesIva: event.target.checked,
                          }))
                        }
                      />
                      <span>{t('services.appliesIva')}</span>
                    </label>
                    <label>
                      {t('services.priceWithIva')}
                      <input
                        type="text"
                        readOnly
                        value={money.format(formPriceWithIva || 0)}
                      />
                    </label>
                  </>
                ) : (
                  <p className="modal-subtitle">{t('services.variableHelp')}</p>
                )}
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

      {itemForm ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('services.editItemTitle')}</h3>
                <p className="modal-subtitle">{t('services.editItemSubtitle')}</p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setItemForm(null)}
                aria-label={t('common.closeForm')}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="filters-grid">
                <label>
                  {t('services.billingDate')}
                  <input
                    type="date"
                    value={itemForm.billingDate}
                    onChange={(event) =>
                      setItemForm((current) =>
                        current
                          ? { ...current, billingDate: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                <label>
                  {t('services.price')}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemForm.price}
                    onChange={(event) =>
                      setItemForm((current) =>
                        current
                          ? { ...current, price: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                <label className="filter-option">
                  <input
                    type="checkbox"
                    checked={itemForm.appliesIva}
                    onChange={(event) =>
                      setItemForm((current) =>
                        current
                          ? { ...current, appliesIva: event.target.checked }
                          : current,
                      )
                    }
                  />
                  <span>{t('services.appliesIva')}</span>
                </label>
                <label>
                  {t('services.priceWithIva')}
                  <input
                    type="text"
                    readOnly
                    value={money.format(itemPriceWithIva || 0)}
                  />
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setItemForm(null)}
              >
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={isSaving}
                onClick={() => void saveItem()}
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
