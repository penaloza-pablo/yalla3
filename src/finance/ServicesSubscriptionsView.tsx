import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  occurrencePriceWithIva,
  priceFromGross,
  roundMoney,
  type FinanceCustomUnit,
  type FinancePriceMode,
  type FinanceRecurrence,
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
  customInterval: number
  customUnit: FinanceCustomUnit
  priceMode: FinancePriceMode
  price: number
  appliesIva: boolean
  priceWithIva: number
}

type BillingItem = {
  id: string
  scheduleId: string
  type: FinanceServiceType
  propertyId: string
  propertyName: string
  title: string
  recurrence: FinanceRecurrence
  billingDate: string
  price: number
  appliesIva: boolean
  priceWithIva: number
}

type ScheduleFormState = {
  type: FinanceServiceType
  propertyId: string
  title: string
  recurrence: FinanceRecurrence
  startDate: string
  customInterval: string
  customUnit: FinanceCustomUnit
  priceMode: FinancePriceMode
  price: string
  appliesIva: boolean
  priceWithIva: string
}

type ItemFormState = {
  id: string
  type: FinanceServiceType
  propertyId: string
  title: string
  billingDate: string
  price: string
  appliesIva: boolean
  priceWithIva: string
}

type Filters = {
  propertyIds: string[]
  types: FinanceServiceType[]
  dateFrom: string
  dateTo: string
}

const SCHEDULE_RECURRENCES: FinanceRecurrence[] = [
  'monthly',
  'bimonthly',
  'quarterly',
  'semiannual',
  'annual',
  'other',
]

const RECURRENCE_KEYS: Record<FinanceRecurrence, string> = {
  monthly: 'services.recurrenceMonthly',
  bimonthly: 'services.recurrenceBimonthly',
  quarterly: 'services.recurrenceQuarterly',
  semiannual: 'services.recurrenceSemiannual',
  annual: 'services.recurrenceAnnual',
  other: 'services.recurrenceOther',
  oneoff: 'services.recurrenceOneoff',
}

const SERVICE_TYPES: FinanceServiceType[] = ['apartment', 'ops']

const emptyScheduleForm = (): ScheduleFormState => ({
  type: 'apartment',
  propertyId: '',
  title: '',
  recurrence: 'monthly',
  startDate: getTodayMadrid(),
  customInterval: '1',
  customUnit: 'months',
  priceMode: 'fixed',
  price: '',
  appliesIva: false,
  priceWithIva: '',
})

const emptyItemForm = (): ItemFormState => ({
  id: '',
  type: 'apartment',
  propertyId: '',
  title: '',
  billingDate: getTodayMadrid(),
  price: '',
  appliesIva: false,
  priceWithIva: '',
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

const asRecurrence = (value: unknown): FinanceRecurrence =>
  SCHEDULE_RECURRENCES.includes(value as FinanceRecurrence) || value === 'oneoff'
    ? (value as FinanceRecurrence)
    : 'monthly'

const asCustomUnit = (value: unknown): FinanceCustomUnit =>
  value === 'days' || value === 'weeks' || value === 'months' ? value : 'months'

const mapSchedule = (item: Record<string, unknown>): ServiceRow => {
  const price = Number(item.price ?? 0)
  const appliesIva = Boolean(item.appliesIva)
  const storedWithIva = Number(item.priceWithIva)
  return {
    id: String(item.id ?? ''),
    type: item.type === 'ops' ? 'ops' : 'apartment',
    propertyId: String(item.propertyId ?? ''),
    propertyName: String(item.propertyName ?? item.propertyId ?? ''),
    title: String(item.title ?? ''),
    recurrence: asRecurrence(item.recurrence),
    startDate: String(item.startDate ?? '').slice(0, 10),
    customInterval: Math.max(1, Number(item.customInterval ?? 1) || 1),
    customUnit: asCustomUnit(item.customUnit),
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
  }
}

const mapBillingItem = (item: Record<string, unknown>): BillingItem => {
  const price = Number(item.price ?? 0)
  const appliesIva = Boolean(item.appliesIva)
  const storedWithIva = Number(item.priceWithIva)
  return {
    id: String(item.id ?? ''),
    scheduleId: String(item.scheduleId ?? ''),
    type: item.type === 'ops' ? 'ops' : 'apartment',
    propertyId: String(item.propertyId ?? ''),
    propertyName: String(item.propertyName ?? item.propertyId ?? ''),
    title: String(item.title ?? ''),
    recurrence: asRecurrence(item.recurrence),
    billingDate: String(item.billingDate ?? '').slice(0, 10),
    price: Number.isFinite(price) ? price : 0,
    appliesIva,
    priceWithIva: Number.isFinite(storedWithIva)
      ? storedWithIva
      : occurrencePriceWithIva(price, appliesIva),
  }
}

const syncFromNet = (price: string, appliesIva: boolean) => {
  const parsed = Number(price)
  if (!Number.isFinite(parsed) || price.trim() === '') {
    return { price, appliesIva, priceWithIva: '' }
  }
  return {
    price,
    appliesIva,
    priceWithIva: String(occurrencePriceWithIva(parsed, appliesIva)),
  }
}

const syncFromGross = (priceWithIva: string) => {
  const parsed = Number(priceWithIva)
  if (!Number.isFinite(parsed) || priceWithIva.trim() === '') {
    return { price: '', appliesIva: true, priceWithIva }
  }
  return {
    price: String(priceFromGross(parsed)),
    appliesIva: true,
    priceWithIva,
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

  const [schedules, setSchedules] = useState<ServiceRow[]>([])
  const [billingItems, setBillingItems] = useState<BillingItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isSchedulesOpen, setIsSchedulesOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState | null>(null)
  const [editingScheduleId, setEditingScheduleId] = useState('')
  const [itemForm, setItemForm] = useState<ItemFormState | null>(null)
  const [itemToDelete, setItemToDelete] = useState<BillingItem | null>(null)
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

  const recurrenceLabel = (item: {
    recurrence: FinanceRecurrence
    customInterval?: number
    customUnit?: FinanceCustomUnit
  }) => {
    if (item.recurrence === 'other') {
      const unitKey =
        item.customUnit === 'days'
          ? 'services.unitDays'
          : item.customUnit === 'weeks'
            ? 'services.unitWeeks'
            : 'services.unitMonths'
      return t('services.recurrenceCustom', {
        count: item.customInterval || 1,
        unit: t(unitKey),
      })
    }
    return t(RECURRENCE_KEYS[item.recurrence])
  }

  const loadRows = useCallback(async () => {
    if (!endpoints.get) {
      setError(t('services.missingEndpoint'))
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const payload = await fetchJson<{
        schedules?: Record<string, unknown>[]
        billingItems?: Record<string, unknown>[]
        items?: Record<string, unknown>[]
      }>(endpoints.get)
      setSchedules((payload.schedules ?? payload.items ?? []).map(mapSchedule))
      setBillingItems((payload.billingItems ?? []).map(mapBillingItem))
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

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return billingItems.filter((item) => {
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
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [billingItems, filters, searchQuery])

  const totals = useMemo(
    () => ({
      count: filteredItems.length,
      schedules: schedules.length,
      cost: filteredItems.reduce((sum, item) => sum + item.price, 0),
      costWithIva: filteredItems.reduce((sum, item) => sum + item.priceWithIva, 0),
    }),
    [filteredItems, schedules.length],
  )

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

  const openCreateSchedule = () => {
    setEditingScheduleId('')
    setScheduleForm(emptyScheduleForm())
    setMessage(null)
    setError(null)
    setIsSchedulesOpen(true)
  }

  const openEditSchedule = (row: ServiceRow) => {
    setEditingScheduleId(row.id)
    setScheduleForm({
      type: row.type,
      propertyId: row.propertyId,
      title: row.title,
      recurrence: row.recurrence === 'oneoff' ? 'monthly' : row.recurrence,
      startDate: row.startDate || getTodayMadrid(),
      customInterval: String(row.customInterval || 1),
      customUnit: row.customUnit,
      priceMode: row.priceMode,
      price: row.priceMode === 'fixed' ? String(row.price) : '',
      appliesIva: row.appliesIva,
      priceWithIva:
        row.priceMode === 'fixed' ? String(row.priceWithIva) : '',
    })
    setIsSchedulesOpen(true)
    setMessage(null)
    setError(null)
  }

  const openCreateItem = () => {
    setItemForm(emptyItemForm())
    setMessage(null)
    setError(null)
  }

  const openEditItem = (item: BillingItem) => {
    setItemForm({
      id: item.id,
      type: item.type,
      propertyId: item.propertyId,
      title: item.title,
      billingDate: item.billingDate,
      price: String(item.price),
      appliesIva: item.appliesIva,
      priceWithIva: String(item.priceWithIva),
    })
    setMessage(null)
    setError(null)
  }

  const saveSchedule = async () => {
    if (!endpoints.upsert || !scheduleForm) {
      setError(t('services.missingWrite'))
      return
    }
    if (!scheduleForm.title.trim() || !scheduleForm.startDate) {
      setError(t('services.validation'))
      return
    }
    if (scheduleForm.type === 'apartment' && !scheduleForm.propertyId) {
      setError(t('services.validationProperty'))
      return
    }
    if (
      scheduleForm.recurrence === 'other' &&
      (!Number.isFinite(Number(scheduleForm.customInterval)) ||
        Number(scheduleForm.customInterval) < 1)
    ) {
      setError(t('services.validationCustom'))
      return
    }
    const price = Number(scheduleForm.price)
    if (
      scheduleForm.priceMode === 'fixed' &&
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
          recordType: 'schedule',
          ...(editingScheduleId ? { id: editingScheduleId } : {}),
          type: scheduleForm.type,
          propertyId:
            scheduleForm.type === 'apartment' ? scheduleForm.propertyId : '',
          propertyName:
            scheduleForm.type === 'apartment'
              ? propertyById.get(scheduleForm.propertyId) || scheduleForm.propertyId
              : '',
          title: scheduleForm.title.trim(),
          recurrence: scheduleForm.recurrence,
          startDate: scheduleForm.startDate,
          customInterval:
            scheduleForm.recurrence === 'other'
              ? Number(scheduleForm.customInterval)
              : undefined,
          customUnit:
            scheduleForm.recurrence === 'other'
              ? scheduleForm.customUnit
              : undefined,
          priceMode: scheduleForm.priceMode,
          price: scheduleForm.priceMode === 'fixed' ? price : 0,
          appliesIva:
            scheduleForm.priceMode === 'fixed' ? scheduleForm.appliesIva : false,
          priceWithIva:
            scheduleForm.priceMode === 'fixed'
              ? Number(scheduleForm.priceWithIva) ||
                occurrencePriceWithIva(price, scheduleForm.appliesIva)
              : 0,
        }),
      })
      setScheduleForm(null)
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
    const price = Number(itemForm.price)
    if (!itemForm.title.trim() || !itemForm.billingDate) {
      setError(t('services.validationItem'))
      return
    }
    if (itemForm.type === 'apartment' && !itemForm.propertyId) {
      setError(t('services.validationProperty'))
      return
    }
    if (!Number.isFinite(price) || price < 0) {
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
          recordType: 'item',
          ...(itemForm.id ? { id: itemForm.id } : {}),
          type: itemForm.type,
          propertyId: itemForm.type === 'apartment' ? itemForm.propertyId : '',
          propertyName:
            itemForm.type === 'apartment'
              ? propertyById.get(itemForm.propertyId) || itemForm.propertyId
              : '',
          title: itemForm.title.trim(),
          recurrence: itemForm.id ? undefined : 'oneoff',
          billingDate: itemForm.billingDate,
          price: roundMoney(price),
          appliesIva: itemForm.appliesIva,
          priceWithIva:
            Number(itemForm.priceWithIva) ||
            occurrencePriceWithIva(price, itemForm.appliesIva),
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

  const deleteSchedule = async (row: ServiceRow) => {
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

  const deleteItem = async (item: BillingItem) => {
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
        body: JSON.stringify({ id: item.id, action: 'delete' }),
      })
      setItemToDelete(null)
      setMessage(t('services.itemDeleted'))
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

  const plusIcon = (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
      <path d="M9 4h2v5h5v2h-5v5H9v-5H4V9h5V4z" fill="currentColor" />
    </svg>
  )

  const ivaRow = (
    price: string,
    appliesIva: boolean,
    priceWithIva: string,
    onChange: (next: {
      price: string
      appliesIva: boolean
      priceWithIva: string
    }) => void,
  ) => (
    <div className="services-iva-row">
      <label className="form-field">
        <span>{t('services.price')}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(event) =>
            onChange(syncFromNet(event.target.value, appliesIva))
          }
        />
      </label>
      <label className="services-iva-check">
        <input
          type="checkbox"
          checked={appliesIva}
          onChange={(event) =>
            onChange(syncFromNet(price, event.target.checked))
          }
        />
        <span>{t('services.appliesIva')}</span>
      </label>
      <label className="form-field">
        <span>{t('services.priceWithIva')}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={priceWithIva}
          onChange={(event) => onChange(syncFromGross(event.target.value))}
        />
      </label>
    </div>
  )

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
        <button
          type="button"
          className={`card card-compact summary-card-button ${
            isSchedulesOpen ? 'is-selected' : ''
          }`}
          onClick={() => setIsSchedulesOpen((current) => !current)}
        >
          <p className="card-label">{t('services.templatesTitle')}</p>
          <p className="card-value">{isLoading ? '—' : totals.schedules}</p>
        </button>
        <div className="card card-compact">
          <p className="card-label">{t('services.costCard')}</p>
          <p className="card-value">
            {isLoading ? '—' : money.format(totals.costWithIva)}
          </p>
        </div>
      </section>

      {isSchedulesOpen ? (
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{t('services.templatesTitle')}</h2>
              <p className="card-subtitle">{t('services.templatesSubtitle')}</p>
            </div>
            <button
              className="btn-ghost"
              type="button"
              onClick={openCreateSchedule}
              aria-label={t('services.addSchedule')}
            >
              {plusIcon}
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
                  <th>{t('services.priceMode')}</th>
                  <th>{t('services.price')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {schedules.length === 0 && !isLoading ? (
                  <tr>
                    <td colSpan={7}>{t('services.empty')}</td>
                  </tr>
                ) : (
                  schedules.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <span
                          className={`status ${
                            row.type === 'ops' ? 'status-info' : 'status-neutral'
                          }`}
                        >
                          {t(
                            row.type === 'ops'
                              ? 'services.typeOps'
                              : 'services.typeApartment',
                          )}
                        </span>
                      </td>
                      <td>
                        {row.type === 'apartment'
                          ? propertyById.get(row.propertyId) ||
                            row.propertyName ||
                            '—'
                          : '—'}
                      </td>
                      <td>{row.title}</td>
                      <td>{recurrenceLabel(row)}</td>
                      <td>
                        {row.priceMode === 'fixed'
                          ? t('services.priceFixed')
                          : t('services.priceVariable')}
                      </td>
                      <td>
                        {row.priceMode === 'fixed'
                          ? money.format(row.price)
                          : '—'}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="btn-secondary"
                            type="button"
                            onClick={() => openEditSchedule(row)}
                          >
                            {t('common.edit')}
                          </button>
                          <button
                            className="btn-secondary"
                            type="button"
                            disabled={isSaving}
                            onClick={() => void deleteSchedule(row)}
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
      ) : null}

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('services.itemsTitle')}</h2>
            <p className="card-subtitle">{t('services.itemsSubtitle')}</p>
          </div>
          <button
            className="btn-ghost"
            type="button"
            onClick={openCreateItem}
            aria-label={t('services.addItem')}
          >
            {plusIcon}
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
                    {billingItems.length === 0
                      ? t('services.emptyItems')
                      : t('services.emptyFiltered')}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id}>
                    <td>{formatDateOnlyLabel(item.billingDate, i18n.language)}</td>
                    <td>
                      <span
                        className={`status ${
                          item.type === 'ops' ? 'status-info' : 'status-neutral'
                        }`}
                      >
                        {t(
                          item.type === 'ops'
                            ? 'services.typeOps'
                            : 'services.typeApartment',
                        )}
                      </span>
                    </td>
                    <td>
                      {item.type === 'apartment'
                        ? item.propertyName || '—'
                        : '—'}
                    </td>
                    <td>{item.title}</td>
                    <td>{recurrenceLabel(item)}</td>
                    <td>{money.format(item.price)}</td>
                    <td>{item.appliesIva ? t('common.yes') : t('common.no')}</td>
                    <td>{money.format(item.priceWithIva)}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() => openEditItem(item)}
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          className="btn-secondary"
                          type="button"
                          disabled={isSaving}
                          onClick={() => setItemToDelete(item)}
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
                            setFilterDraft((current) => {
                              const selected = current.propertyIds
                              const next = selected.includes(property.id)
                                ? selected.filter((entry) => entry !== property.id)
                                : [...selected, property.id]
                              return { ...current, propertyIds: next }
                            })
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
                          onChange={() =>
                            setFilterDraft((current) => {
                              const next = current.types.includes(type)
                                ? current.types.filter((entry) => entry !== type)
                                : [...current.types, type]
                              return { ...current, types: next }
                            })
                          }
                        />
                        <span>
                          {t(
                            type === 'ops'
                              ? 'services.typeOps'
                              : 'services.typeApartment',
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="filter-group">
                  <p className="filter-title">{t('services.billingDate')}</p>
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

      {scheduleForm ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {editingScheduleId
                    ? t('services.editTitle')
                    : t('services.formTitle')}
                </h3>
                <p className="modal-subtitle">{t('services.formSubtitle')}</p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setScheduleForm(null)}
                aria-label={t('common.closeForm')}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <label>
                  {t('services.type')}
                  <select
                    value={scheduleForm.type}
                    onChange={(event) =>
                      setScheduleForm((current) =>
                        current
                          ? {
                              ...current,
                              type: event.target.value as FinanceServiceType,
                              propertyId:
                                event.target.value === 'ops'
                                  ? ''
                                  : current.propertyId,
                            }
                          : current,
                      )
                    }
                  >
                    <option value="apartment">{t('services.typeApartment')}</option>
                    <option value="ops">{t('services.typeOps')}</option>
                  </select>
                </label>
                {scheduleForm.type === 'apartment' ? (
                  <label>
                    {t('services.property')}
                    <select
                      value={scheduleForm.propertyId}
                      onChange={(event) =>
                        setScheduleForm((current) =>
                          current
                            ? { ...current, propertyId: event.target.value }
                            : current,
                        )
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
                <label className="form-field-span">
                  {t('services.title')}
                  <input
                    type="text"
                    value={scheduleForm.title}
                    onChange={(event) =>
                      setScheduleForm((current) =>
                        current ? { ...current, title: event.target.value } : current,
                      )
                    }
                  />
                </label>
                <label>
                  {t('services.recurrence')}
                  <select
                    value={scheduleForm.recurrence}
                    onChange={(event) =>
                      setScheduleForm((current) =>
                        current
                          ? {
                              ...current,
                              recurrence: event.target.value as FinanceRecurrence,
                            }
                          : current,
                      )
                    }
                  >
                    {SCHEDULE_RECURRENCES.map((value) => (
                      <option key={value} value={value}>
                        {t(RECURRENCE_KEYS[value])}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('services.startDate')}
                  <input
                    type="date"
                    value={scheduleForm.startDate}
                    onChange={(event) =>
                      setScheduleForm((current) =>
                        current
                          ? { ...current, startDate: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
                {scheduleForm.recurrence === 'other' ? (
                  <>
                    <label>
                      {t('services.every')}
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={scheduleForm.customInterval}
                        onChange={(event) =>
                          setScheduleForm((current) =>
                            current
                              ? { ...current, customInterval: event.target.value }
                              : current,
                          )
                        }
                      />
                    </label>
                    <label>
                      {t('services.customUnit')}
                      <select
                        value={scheduleForm.customUnit}
                        onChange={(event) =>
                          setScheduleForm((current) =>
                            current
                              ? {
                                  ...current,
                                  customUnit: event.target.value as FinanceCustomUnit,
                                }
                              : current,
                          )
                        }
                      >
                        <option value="days">{t('services.unitDays')}</option>
                        <option value="weeks">{t('services.unitWeeks')}</option>
                        <option value="months">{t('services.unitMonths')}</option>
                      </select>
                    </label>
                  </>
                ) : null}
                <div className="planner-switch form-field-span">
                  <span>{t('services.priceVariable')}</span>
                  <YallaSwitch
                    on={scheduleForm.priceMode === 'fixed'}
                    label={
                      scheduleForm.priceMode === 'fixed'
                        ? t('services.priceFixed')
                        : t('services.priceVariable')
                    }
                    onToggle={() =>
                      setScheduleForm((current) =>
                        current
                          ? {
                              ...current,
                              priceMode:
                                current.priceMode === 'fixed'
                                  ? 'variable'
                                  : 'fixed',
                            }
                          : current,
                      )
                    }
                  />
                  <span>{t('services.priceFixed')}</span>
                </div>
                {scheduleForm.priceMode === 'fixed' ? (
                  ivaRow(
                    scheduleForm.price,
                    scheduleForm.appliesIva,
                    scheduleForm.priceWithIva,
                    (next) =>
                      setScheduleForm((current) =>
                        current ? { ...current, ...next } : current,
                      ),
                  )
                ) : (
                  <p className="modal-subtitle form-field-span">
                    {t('services.variableHelp')}
                  </p>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setScheduleForm(null)}
              >
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={isSaving}
                onClick={() => void saveSchedule()}
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
                <h3 className="modal-title">
                  {itemForm.id
                    ? t('services.editItemTitle')
                    : t('services.addItemTitle')}
                </h3>
                <p className="modal-subtitle">
                  {itemForm.id
                    ? t('services.editItemSubtitle')
                    : t('services.addItemSubtitle')}
                </p>
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
              <div className="form-grid">
                <label>
                  {t('services.type')}
                  <select
                    value={itemForm.type}
                    onChange={(event) =>
                      setItemForm((current) =>
                        current
                          ? {
                              ...current,
                              type: event.target.value as FinanceServiceType,
                              propertyId:
                                event.target.value === 'ops'
                                  ? ''
                                  : current.propertyId,
                            }
                          : current,
                      )
                    }
                  >
                    <option value="apartment">{t('services.typeApartment')}</option>
                    <option value="ops">{t('services.typeOps')}</option>
                  </select>
                </label>
                {itemForm.type === 'apartment' ? (
                  <label>
                    {t('services.property')}
                    <select
                      value={itemForm.propertyId}
                      onChange={(event) =>
                        setItemForm((current) =>
                          current
                            ? { ...current, propertyId: event.target.value }
                            : current,
                        )
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
                    value={itemForm.title}
                    onChange={(event) =>
                      setItemForm((current) =>
                        current ? { ...current, title: event.target.value } : current,
                      )
                    }
                  />
                </label>
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
                {ivaRow(
                  itemForm.price,
                  itemForm.appliesIva,
                  itemForm.priceWithIva,
                  (next) =>
                    setItemForm((current) =>
                      current ? { ...current, ...next } : current,
                    ),
                )}
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

      {itemToDelete ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('services.deleteItemTitle')}</h3>
                <p className="modal-subtitle">{t('services.deleteItemBody')}</p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setItemToDelete(null)}
                aria-label={t('common.closeForm')}
              >
                ✕
              </button>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setItemToDelete(null)}
              >
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={isSaving}
                onClick={() => void deleteItem(itemToDelete)}
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
