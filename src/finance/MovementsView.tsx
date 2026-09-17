import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IVA_RATES,
  occurrencePriceWithIva,
  parseIvaRate,
  persistIvaFields,
  priceFromGross,
  resolveIvaRate,
  type IvaRate,
} from '../../amplify/functions/shared/finance-services'
import { YallaSwitch } from '../bookings/YallaSwitch'
import { translateStatus } from '../i18n/display'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { fetchJson } from '../operations/api'
import { formatDateOnlyLabel, getTodayMadrid } from '../operations/dateHelpers'
import {
  filterMovementsPropertyOptions,
  getPropertyLabel,
} from '../operations/propertyHelpers'
import type { PropertyOption } from '../operations/types'
import { FinancePropertySelectOptions } from './FinancePropertySelectOptions'
import { FinanceChargeToSelect } from './FinanceChargeToSelect'
import { YlIcon } from '../design/icons'
import {
  parseCostDefaultAllocation,
  parseIncomeDefaultAllocation,
} from '../../amplify/functions/shared/property-report-allocations'
import type {
  FinanceCustomUnit,
  FinanceRecurrence,
} from '../../amplify/functions/shared/finance-services'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
  isSummaryInfoOpen: boolean
  onToggleSummaryInfo: () => void
  searchQuery: string
  onSearchQueryChange: (value: string) => void
}

type MovementKind = 'income' | 'outcome'

type MovementStatus = 'Pending Billing' | 'Billed' | 'Not Billable'

type MovementRow = {
  id: string
  propertyId: string
  propertyName: string
  description: string
  amount: number
  ivaRate: IvaRate
  totalAmount: number
  kind: MovementKind
  date: string
  status: MovementStatus
}

type MovementScheduleRow = {
  id: string
  propertyId: string
  propertyName: string
  description: string
  amount: number
  ivaRate: IvaRate
  totalAmount: number
  kind: MovementKind
  status: MovementStatus
  recurrence: FinanceRecurrence
  startDate: string
  customInterval: number
  customUnit: FinanceCustomUnit
  enabled: boolean
  endDate: string
  defaultAllocation: string
}

type ScheduleFormState = {
  propertyId: string
  description: string
  amount: string
  ivaRate: IvaRate
  totalAmount: string
  kind: MovementKind
  status: MovementStatus
  recurrence: FinanceRecurrence
  startDate: string
  customInterval: string
  customUnit: FinanceCustomUnit
  enabled: boolean
  hasEndDate: boolean
  endDate: string
  defaultAllocation: string
}

type FormState = {
  propertyId: string
  description: string
  amount: string
  ivaRate: IvaRate
  totalAmount: string
  kind: MovementKind
  date: string
  status: MovementStatus
}

type Filters = {
  propertyIds: string[]
  statuses: MovementStatus[]
  dateFrom: string
  dateTo: string
}

const MOVEMENT_STATUSES: MovementStatus[] = [
  'Pending Billing',
  'Billed',
  'Not Billable',
]

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

const emptyScheduleForm = (): ScheduleFormState => ({
  propertyId: '',
  description: '',
  amount: '',
  ivaRate: 0,
  totalAmount: '',
  kind: 'outcome',
  status: 'Pending Billing',
  recurrence: 'monthly',
  startDate: getTodayMadrid(),
  customInterval: '1',
  customUnit: 'months',
  enabled: true,
  hasEndDate: false,
  endDate: '',
  defaultAllocation: '',
})

const emptyForm = (): FormState => ({
  propertyId: '',
  description: '',
  amount: '',
  ivaRate: 0,
  totalAmount: '',
  kind: 'outcome',
  date: getTodayMadrid(),
  status: 'Pending Billing',
})

const syncFromNet = (amount: string, ivaRate: IvaRate) => {
  const parsed = Number(amount)
  if (!Number.isFinite(parsed) || amount.trim() === '') {
    return { amount, ivaRate, totalAmount: '' }
  }
  return {
    amount,
    ivaRate,
    totalAmount: String(occurrencePriceWithIva(parsed, ivaRate)),
  }
}

const syncFromGross = (totalAmount: string, ivaRate: IvaRate) => {
  const parsed = Number(totalAmount)
  if (!Number.isFinite(parsed) || totalAmount.trim() === '') {
    return { amount: '', ivaRate, totalAmount }
  }
  return {
    amount: String(priceFromGross(parsed, ivaRate)),
    ivaRate,
    totalAmount,
  }
}

const emptyFilters = (): Filters => ({
  propertyIds: [],
  statuses: [],
  dateFrom: '',
  dateTo: '',
})

const defaultFilters = (): Filters => ({
  ...emptyFilters(),
  statuses: ['Pending Billing'],
})

const asRecurrence = (value: unknown): FinanceRecurrence =>
  SCHEDULE_RECURRENCES.includes(value as FinanceRecurrence) || value === 'oneoff'
    ? (value as FinanceRecurrence)
    : 'monthly'

const asCustomUnit = (value: unknown): FinanceCustomUnit =>
  value === 'days' || value === 'weeks' || value === 'months' ? value : 'months'

const mapMovement = (item: Record<string, unknown>): MovementRow => {
  const amount = Number(item.amount ?? 0)
  const ivaRate = resolveIvaRate(item)
  const storedTotal = Number(item.totalAmount)
  return {
    id: String(item.id ?? ''),
    propertyId: String(item.propertyId ?? ''),
    propertyName: String(item.propertyName ?? item.propertyId ?? ''),
    description: String(item.description ?? ''),
    amount: Number.isFinite(amount) ? amount : 0,
    ivaRate,
    totalAmount: Number.isFinite(storedTotal)
      ? storedTotal
      : occurrencePriceWithIva(Number.isFinite(amount) ? amount : 0, ivaRate),
    kind: String(item.kind ?? 'outcome') === 'income' ? 'income' : 'outcome',
    date: String(item.date ?? '').slice(0, 10),
    status: normalizeStatus(item.status),
  }
}

const mapSchedule = (item: Record<string, unknown>): MovementScheduleRow => {
  const mapped = mapMovement(item)
  const kind = mapped.kind
  const allocationRaw = item.defaultAllocation ?? item.allocation
  return {
    id: mapped.id,
    propertyId: mapped.propertyId,
    propertyName: mapped.propertyName,
    description: mapped.description,
    amount: mapped.amount,
    ivaRate: mapped.ivaRate,
    totalAmount: mapped.totalAmount,
    kind,
    status: mapped.status,
    recurrence: asRecurrence(item.recurrence),
    startDate: String(item.startDate ?? '').slice(0, 10),
    customInterval: Math.max(1, Number(item.customInterval ?? 1) || 1),
    customUnit: asCustomUnit(item.customUnit),
    enabled: item.enabled !== false,
    endDate: String(item.endDate ?? '').slice(0, 10),
    defaultAllocation:
      kind === 'income'
        ? parseIncomeDefaultAllocation(allocationRaw)
        : parseCostDefaultAllocation(allocationRaw),
  }
}

const normalizeStatus = (value: unknown): MovementStatus => {
  const status = String(value ?? '').trim()
  return MOVEMENT_STATUSES.includes(status as MovementStatus)
    ? (status as MovementStatus)
    : 'Pending Billing'
}

const statusClassName = (status: MovementStatus) => {
  if (status === 'Pending Billing') {
    return 'status status-warning'
  }
  if (status === 'Billed') {
    return 'status status-success'
  }
  return 'status status-neutral'
}

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

export function MovementsView({
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
      get: getEndpoint('getFinanceMovementsUrl'),
      upsert: getEndpoint('upsertFinanceMovementUrl'),
    }),
    [getEndpoint],
  )

  const properties = useMemo(
    () => filterMovementsPropertyOptions(propertyOptions),
    [propertyOptions],
  )
  const propertyById = useMemo(
    () => new Map(properties.map((property) => [property.id, getPropertyLabel(property)])),
    [properties],
  )

  const [rows, setRows] = useState<MovementRow[]>([])
  const [schedules, setSchedules] = useState<MovementScheduleRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSchedulesOpen, setIsSchedulesOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState<FormState>(emptyForm)
  const [scheduleForm, setScheduleForm] = useState<ScheduleFormState | null>(null)
  const [editingScheduleId, setEditingScheduleId] = useState('')
  const [filters, setFilters] = useState<Filters>(defaultFilters)
  const [filterDraft, setFilterDraft] = useState<Filters>(defaultFilters)

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
      setError(t('movements.missingEndpoint'))
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const payload = await fetchJson<{
        items?: Record<string, unknown>[]
        schedules?: Record<string, unknown>[]
      }>(endpoints.get)
      setRows((payload.items ?? []).map(mapMovement))
      setSchedules((payload.schedules ?? []).map(mapSchedule))
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : t('movements.loadError'),
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
    return rows.filter((row) => {
      if (
        filters.propertyIds.length > 0 &&
        !filters.propertyIds.includes(row.propertyId)
      ) {
        return false
      }
      if (
        filters.statuses.length > 0 &&
        !filters.statuses.includes(row.status)
      ) {
        return false
      }
      if (filters.dateFrom && row.date < filters.dateFrom) {
        return false
      }
      if (filters.dateTo && row.date > filters.dateTo) {
        return false
      }
      if (!query) {
        return true
      }
      return [
        row.id,
        row.propertyName,
        propertyById.get(row.propertyId) ?? '',
        row.description,
        row.kind,
        row.status,
        row.date,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    })
  }, [filters, propertyById, rows, searchQuery])

  const totals = useMemo(() => {
    const income = filteredRows
      .filter((row) => row.kind === 'income')
      .reduce((sum, row) => sum + row.totalAmount, 0)
    const outcome = filteredRows
      .filter((row) => row.kind === 'outcome')
      .reduce((sum, row) => sum + row.totalAmount, 0)
    return { income, outcome, net: income - outcome }
  }, [filteredRows])

  const activeFilterCount =
    filters.propertyIds.length +
    filters.statuses.length +
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
  const isPendingBillingQuickFilterActive =
    filters.statuses.length === 1 && filters.statuses[0] === 'Pending Billing'

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

  const toggleCurrentMonthQuickFilter = () => {
    applyMonthRange(isCurrentMonthQuickFilterActive ? null : currentMonthRange)
  }

  const togglePreviousMonthQuickFilter = () => {
    applyMonthRange(isPreviousMonthQuickFilterActive ? null : previousMonthRange)
  }

  const togglePendingBillingQuickFilter = () => {
    const nextStatuses: MovementStatus[] = isPendingBillingQuickFilterActive
      ? []
      : ['Pending Billing']
    setFilters((current) => ({ ...current, statuses: nextStatuses }))
    setFilterDraft((current) => ({ ...current, statuses: nextStatuses }))
  }

  const toggleDraftValue = (
    key: 'propertyIds' | 'statuses',
    value: string,
  ) => {
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

  const chargeToLabel = (row: MovementScheduleRow) => {
    if (!row.defaultAllocation) {
      return t('services.chargeToUnset')
    }
    if (row.kind === 'income') {
      if (row.defaultAllocation === 'directToOwner') {
        return t('propertyReports.allocationDirectToOwner')
      }
      if (row.defaultAllocation === 'applyMarkup') {
        return t('propertyReports.allocationApplyMarkup')
      }
      if (row.defaultAllocation === 'doNotSend') {
        return t('propertyReports.allocationDirectToUs')
      }
    }
    if (row.defaultAllocation === 'bear') {
      return t('propertyReports.allocationBear')
    }
    if (row.defaultAllocation === 'ownerPlus12') {
      return t('propertyReports.allocationOwnerPlus12', { percent: 12 })
    }
    if (row.defaultAllocation === 'owner') {
      return t('propertyReports.allocationOwner')
    }
    return t('services.chargeToUnset')
  }

  const openCreateSchedule = () => {
    setEditingScheduleId('')
    setScheduleForm(emptyScheduleForm())
    setIsSchedulesOpen(true)
    setMessage(null)
    setError(null)
  }

  const openEditSchedule = (row: MovementScheduleRow) => {
    setEditingScheduleId(row.id)
    setScheduleForm({
      propertyId: row.propertyId,
      description: row.description,
      amount: String(row.amount),
      ivaRate: row.ivaRate,
      totalAmount: String(row.totalAmount),
      kind: row.kind,
      status: row.status,
      recurrence: row.recurrence === 'oneoff' ? 'monthly' : row.recurrence,
      startDate: row.startDate || getTodayMadrid(),
      customInterval: String(row.customInterval || 1),
      customUnit: row.customUnit,
      enabled: row.enabled,
      hasEndDate: Boolean(row.endDate),
      endDate: row.endDate,
      defaultAllocation: row.defaultAllocation,
    })
    setIsSchedulesOpen(true)
    setMessage(null)
    setError(null)
  }

  const saveSchedule = async () => {
    if (!endpoints.upsert || !scheduleForm) {
      setError(t('movements.missingWrite'))
      return
    }
    const amount = Number(scheduleForm.amount)
    if (
      !scheduleForm.propertyId ||
      !scheduleForm.description.trim() ||
      !scheduleForm.startDate
    ) {
      setError(t('movements.validationSchedule'))
      return
    }
    if (
      scheduleForm.hasEndDate &&
      (!scheduleForm.endDate || scheduleForm.endDate < scheduleForm.startDate)
    ) {
      setError(t('services.validationEndDate'))
      return
    }
    if (
      scheduleForm.recurrence === 'other' &&
      (!Number.isFinite(Number(scheduleForm.customInterval)) ||
        Number(scheduleForm.customInterval) < 1)
    ) {
      setError(t('movements.validationCustom'))
      return
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setError(t('movements.validationAmount'))
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
          propertyId: scheduleForm.propertyId,
          propertyName:
            propertyById.get(scheduleForm.propertyId) || scheduleForm.propertyId,
          description: scheduleForm.description.trim(),
          amount,
          ivaRate: scheduleForm.ivaRate,
          appliesIva: persistIvaFields(scheduleForm.ivaRate).appliesIva,
          totalAmount: Number.isFinite(Number(scheduleForm.totalAmount))
            ? Number(scheduleForm.totalAmount)
            : undefined,
          kind: scheduleForm.kind,
          status: scheduleForm.status,
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
          enabled: scheduleForm.enabled,
          endDate: scheduleForm.hasEndDate ? scheduleForm.endDate : '',
          defaultAllocation: scheduleForm.defaultAllocation,
        }),
      })
      setScheduleForm(null)
      setMessage(t('movements.scheduleSaved'))
      await loadRows()
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t('movements.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const toggleScheduleEnabled = async (row: MovementScheduleRow) => {
    if (!endpoints.upsert) {
      setError(t('movements.missingWrite'))
      return
    }
    if (row.endDate && getTodayMadrid() > row.endDate) {
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await fetchJson(endpoints.upsert, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          recordType: 'schedule',
          id: row.id,
          propertyId: row.propertyId,
          propertyName: row.propertyName,
          description: row.description,
          amount: row.amount,
          ivaRate: row.ivaRate,
          appliesIva: persistIvaFields(row.ivaRate).appliesIva,
          totalAmount: row.totalAmount,
          kind: row.kind,
          status: row.status,
          recurrence: row.recurrence,
          startDate: row.startDate,
          customInterval: row.customInterval,
          customUnit: row.customUnit,
          enabled: !row.enabled,
          endDate: row.endDate,
          defaultAllocation: row.defaultAllocation,
        }),
      })
      await loadRows()
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t('movements.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const deleteSchedule = async (row: MovementScheduleRow) => {
    if (!endpoints.upsert) {
      setError(t('movements.missingWrite'))
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
      setMessage(t('movements.scheduleDeleted'))
      await loadRows()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t('movements.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const openEdit = (row: MovementRow) => {
    setEditingId(row.id)
    setForm({
      propertyId: row.propertyId,
      description: row.description,
      amount: String(row.amount),
      ivaRate: row.ivaRate,
      totalAmount: String(row.totalAmount),
      kind: row.kind,
      date: row.date || getTodayMadrid(),
      status: row.status,
    })
    setIsFormOpen(true)
    setMessage(null)
    setError(null)
  }

  const saveForm = async () => {
    if (!endpoints.upsert) {
      setError(t('movements.missingWrite'))
      return
    }
    const amount = Number(form.amount)
    if (!form.propertyId || !form.description.trim() || !form.date) {
      setError(t('movements.validation'))
      return
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setError(t('movements.validationAmount'))
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
          propertyId: form.propertyId,
          propertyName: propertyById.get(form.propertyId) || form.propertyId,
          description: form.description.trim(),
          amount,
          ivaRate: form.ivaRate,
          appliesIva: persistIvaFields(form.ivaRate).appliesIva,
          totalAmount: Number.isFinite(Number(form.totalAmount))
            ? Number(form.totalAmount)
            : undefined,
          kind: form.kind,
          date: form.date,
          status: form.status,
        }),
      })
      setIsFormOpen(false)
      setMessage(t('movements.saved'))
      await loadRows()
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t('movements.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const deleteRow = async (row: MovementRow) => {
    if (!endpoints.upsert) {
      setError(t('movements.missingWrite'))
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
      setMessage(t('movements.deleted'))
      await loadRows()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t('movements.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('movements.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Movements')}</h1>
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
          <p className="subtitle">{t('movements.subtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <input
              className="search-input"
              placeholder={t('movements.search')}
              type="search"
              aria-label={t('movements.search')}
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
                    statuses: [...filters.statuses],
                    dateFrom: filters.dateFrom,
                    dateTo: filters.dateTo,
                  })
                  setIsFilterOpen(true)
                }}
              >
                <YlIcon name="line.3.horizontal.decrease" size={16} />
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
                onClick={toggleCurrentMonthQuickFilter}
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
                onClick={togglePreviousMonthQuickFilter}
              >
                {t('common.quickFilterPreviousMonth')}
              </button>
              <button
                className="btn-ghost"
                type="button"
                onClick={openCreate}
                aria-label={t('movements.add')}
              >
                <YlIcon name="plus" size={16} />
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => void loadRows()}
                aria-label={t('common.refresh')}
              >
                <YlIcon name="arrow.clockwise" size={16} />
              </button>
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {message ? <p className="notice success">{message}</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      <section className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}>
        <div className="card card-compact">
          <p className="card-label">{t('movements.incomeCard')}</p>
          <p className="card-value">{isLoading ? '—' : money.format(totals.income)}</p>
        </div>
        <div className="card card-compact">
          <p className="card-label">{t('movements.outcomeCard')}</p>
          <p className="card-value">
            {isLoading ? '—' : money.format(totals.outcome)}
          </p>
        </div>
        <div className="card card-compact">
          <p className="card-label">{t('movements.netCard')}</p>
          <p className="card-value">{isLoading ? '—' : money.format(totals.net)}</p>
        </div>
        <button
          type="button"
          className={`card card-compact summary-card-button ${
            isSchedulesOpen ? 'is-selected' : ''
          }`}
          onClick={() => setIsSchedulesOpen((current) => !current)}
        >
          <p className="card-label">{t('movements.templatesTitle')}</p>
          <p className="card-value">{isLoading ? '—' : schedules.length}</p>
        </button>
      </section>

      {isSchedulesOpen ? (
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{t('movements.templatesTitle')}</h2>
              <p className="card-subtitle">{t('movements.templatesSubtitle')}</p>
            </div>
            <button
              className="btn-ghost"
              type="button"
              onClick={openCreateSchedule}
              aria-label={t('movements.addSchedule')}
            >
              <YlIcon name="plus" size={16} />
            </button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('movements.property')}</th>
                  <th>{t('movements.description')}</th>
                  <th>{t('services.recurrence')}</th>
                  <th>{t('movements.kind')}</th>
                  <th>{t('services.enabled')}</th>
                  <th>{t('services.endDate')}</th>
                  <th>{t('services.chargeTo')}</th>
                  <th>{t('movements.amount')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {schedules.length === 0 && !isLoading ? (
                  <tr>
                    <td colSpan={9}>{t('movements.emptySchedules')}</td>
                  </tr>
                ) : (
                  schedules.map((row) => {
                    const ended =
                      Boolean(row.endDate) && getTodayMadrid() > row.endDate
                    const statusKey = ended
                      ? 'services.ended'
                      : row.enabled
                        ? 'services.enabled'
                        : 'services.disabled'
                    return (
                      <tr key={row.id}>
                        <td>
                          {propertyById.get(row.propertyId) || row.propertyName}
                        </td>
                        <td>{row.description}</td>
                        <td>{recurrenceLabel(row)}</td>
                        <td>
                          {row.kind === 'income'
                            ? t('movements.income')
                            : t('movements.outcome')}
                        </td>
                        <td>
                          <div className="planner-switch compact">
                            <YallaSwitch
                              on={row.enabled && !ended}
                              disabled={isSaving || ended}
                              label={t(statusKey)}
                              onToggle={() => void toggleScheduleEnabled(row)}
                            />
                            <span
                              className={`status ${
                                ended
                                  ? 'status-neutral'
                                  : row.enabled
                                    ? 'status-success'
                                    : 'status-warning'
                              }`}
                            >
                              {t(statusKey)}
                            </span>
                          </div>
                        </td>
                        <td>
                          {row.endDate
                            ? formatDateOnlyLabel(row.endDate, i18n.language)
                            : '—'}
                        </td>
                        <td>{chargeToLabel(row)}</td>
                        <td>{money.format(row.amount)}</td>
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
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('movements.cardTitle')}</h2>
            <p className="card-subtitle">{t('movements.cardSubtitle')}</p>
          </div>
          <button className="btn-primary" type="button" onClick={openCreate}>
            {t('movements.add')}
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('movements.date')}</th>
                <th>{t('movements.property')}</th>
                <th>{t('movements.description')}</th>
                <th>{t('common.status')}</th>
                <th>{t('movements.kind')}</th>
                <th>{t('movements.amount')}</th>
                <th>{t('movements.appliesIva')}</th>
                <th>{t('movements.totalAmount')}</th>
                <th>{t('common.actions')}</th>
                <th scope="col" className="mobile-quick-filter-col">
                  <button
                    className={`btn-quick-filter ${
                      isCurrentMonthQuickFilterActive ? 'is-active' : ''
                    }`}
                    type="button"
                    aria-pressed={isCurrentMonthQuickFilterActive}
                    onClick={toggleCurrentMonthQuickFilter}
                  >
                    {t('common.quickFilterCurrentMonth')}
                    <span className="quick-filter-indicator" aria-hidden="true" />
                  </button>
                </th>
                <th scope="col" className="mobile-quick-filter-col">
                  <button
                    className={`btn-quick-filter ${
                      isPreviousMonthQuickFilterActive ? 'is-active' : ''
                    }`}
                    type="button"
                    aria-pressed={isPreviousMonthQuickFilterActive}
                    onClick={togglePreviousMonthQuickFilter}
                  >
                    {t('common.quickFilterPreviousMonth')}
                    <span className="quick-filter-indicator" aria-hidden="true" />
                  </button>
                </th>
                <th scope="col" className="mobile-quick-filter-col">
                  <button
                    className={`btn-quick-filter ${
                      isPendingBillingQuickFilterActive ? 'is-active' : ''
                    }`}
                    type="button"
                    aria-pressed={isPendingBillingQuickFilterActive}
                    onClick={togglePendingBillingQuickFilter}
                  >
                    {t('common.quickFilterBilling')}
                    <span className="quick-filter-indicator" aria-hidden="true" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9}>{t('common.loading')}</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    {rows.length === 0
                      ? t('movements.empty')
                      : t('movements.emptyFiltered')}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td data-label={t('movements.date')}>{formatDateOnlyLabel(row.date, i18n.language)}</td>
                    <td data-label={t('movements.property')}>{propertyById.get(row.propertyId) || row.propertyName}</td>
                    <td data-label={t('movements.description')}>{row.description}</td>
                    <td data-label={t('common.status')}>
                      <span className={statusClassName(row.status)}>
                        {translateStatus(t, row.status)}
                      </span>
                    </td>
                    <td data-label={t('movements.kind')}>
                      {row.kind === 'income'
                        ? t('movements.income')
                        : t('movements.outcome')}
                    </td>
                    <td data-label={t('movements.amount')}>{money.format(row.amount)}</td>
                    <td data-label={t('movements.appliesIva')}>
                      {row.ivaRate === 10
                        ? t('common.iva10')
                        : row.ivaRate === 21
                          ? t('common.iva21')
                          : t('common.ivaNone')}
                    </td>
                    <td data-label={t('movements.totalAmount')}>{money.format(row.totalAmount)}</td>
                    <td data-label={t('common.actions')}>
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
                <p className="modal-subtitle">{t('movements.filterSubtitle')}</p>
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
              <div className="filter-grid">
                <div className="filter-group">
                  <p className="filter-title">{t('movements.property')}</p>
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
                  <p className="filter-title">{t('common.status')}</p>
                  <div className="filter-options">
                    {MOVEMENT_STATUSES.map((status) => (
                      <label className="filter-option" key={status}>
                        <input
                          type="checkbox"
                          checked={filterDraft.statuses.includes(status)}
                          onChange={() => toggleDraftValue('statuses', status)}
                        />
                        <span>{translateStatus(t, status)}</span>
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
                    statuses: [...filterDraft.statuses],
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
                  {editingId ? t('movements.editTitle') : t('movements.formTitle')}
                </h3>
                <p className="modal-subtitle">{t('movements.formSubtitle')}</p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsFormOpen(false)}
                aria-label={t('common.closeForm')}
              >
                <YlIcon name="xmark" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <label>
                  {t('movements.property')}
                  <select
                    value={form.propertyId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        propertyId: event.target.value,
                      }))
                    }
                  >
                    <option value="">{t('movements.selectProperty')}</option>
                    <FinancePropertySelectOptions properties={properties} />
                  </select>
                </label>
                <label>
                  {t('movements.date')}
                  <input
                    type="date"
                    value={form.date}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        date: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {t('movements.description')}
                  <input
                    type="text"
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {t('common.status')}
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as MovementStatus,
                      }))
                    }
                  >
                    {MOVEMENT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {translateStatus(t, status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field-span">
                  {t('movements.kind')}
                  <select
                    value={form.kind}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        kind: event.target.value as MovementKind,
                      }))
                    }
                  >
                    <option value="income">{t('movements.income')}</option>
                    <option value="outcome">{t('movements.outcome')}</option>
                  </select>
                </label>
                <div className="services-iva-row">
                  <label className="form-field">
                    <span>{t('movements.price')}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.amount}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          ...syncFromNet(event.target.value, current.ivaRate),
                        }))
                      }
                    />
                  </label>
                  <label className="form-field">
                    <span>{t('movements.appliesIva')}</span>
                    <select
                      value={String(form.ivaRate)}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          ...syncFromNet(
                            current.amount,
                            parseIvaRate(event.target.value) ?? 0,
                          ),
                        }))
                      }
                    >
                      {IVA_RATES.map((rate) => (
                        <option key={rate} value={rate}>
                          {rate === 10
                            ? t('common.iva10')
                            : rate === 21
                              ? t('common.iva21')
                              : t('common.ivaNone')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>{t('movements.priceWithIva')}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.totalAmount}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          ...syncFromGross(event.target.value, current.ivaRate),
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

      {scheduleForm ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-scrollable">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {editingScheduleId
                    ? t('movements.editScheduleTitle')
                    : t('movements.formScheduleTitle')}
                </h3>
                <p className="modal-subtitle">
                  {t('movements.formScheduleSubtitle')}
                </p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setScheduleForm(null)}
                aria-label={t('common.closeForm')}
              >
                <YlIcon name="xmark" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <label>
                  {t('movements.property')}
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
                    <option value="">{t('movements.selectProperty')}</option>
                    <FinancePropertySelectOptions properties={properties} />
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
                <label className="form-field-span">
                  {t('movements.description')}
                  <input
                    type="text"
                    value={scheduleForm.description}
                    onChange={(event) =>
                      setScheduleForm((current) =>
                        current
                          ? { ...current, description: event.target.value }
                          : current,
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
                <label>
                  {t('common.status')}
                  <select
                    value={scheduleForm.status}
                    onChange={(event) =>
                      setScheduleForm((current) =>
                        current
                          ? {
                              ...current,
                              status: event.target.value as MovementStatus,
                            }
                          : current,
                      )
                    }
                  >
                    {MOVEMENT_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {translateStatus(t, status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('movements.kind')}
                  <select
                    value={scheduleForm.kind}
                    onChange={(event) =>
                      setScheduleForm((current) => {
                        if (!current) {
                          return current
                        }
                        const kind = event.target.value as MovementKind
                        return {
                          ...current,
                          kind,
                          defaultAllocation: '',
                        }
                      })
                    }
                  >
                    <option value="income">{t('movements.income')}</option>
                    <option value="outcome">{t('movements.outcome')}</option>
                  </select>
                </label>
                <div className="planner-switch form-field-span">
                  <span>{t('services.disabled')}</span>
                  <YallaSwitch
                    on={scheduleForm.enabled}
                    label={
                      scheduleForm.enabled
                        ? t('services.enabled')
                        : t('services.disabled')
                    }
                    onToggle={() =>
                      setScheduleForm((current) =>
                        current
                          ? { ...current, enabled: !current.enabled }
                          : current,
                      )
                    }
                  />
                  <span>{t('services.enabled')}</span>
                </div>
                <div className="planner-switch form-field-span">
                  <span>{t('services.setEndDate')}</span>
                  <YallaSwitch
                    on={scheduleForm.hasEndDate}
                    label={t('services.setEndDate')}
                    onToggle={() =>
                      setScheduleForm((current) =>
                        current
                          ? {
                              ...current,
                              hasEndDate: !current.hasEndDate,
                              endDate: !current.hasEndDate
                                ? current.endDate || current.startDate
                                : current.endDate,
                            }
                          : current,
                      )
                    }
                  />
                </div>
                {scheduleForm.hasEndDate ? (
                  <label>
                    {t('services.endDate')}
                    <input
                      type="date"
                      min={scheduleForm.startDate}
                      value={scheduleForm.endDate}
                      onChange={(event) =>
                        setScheduleForm((current) =>
                          current
                            ? { ...current, endDate: event.target.value }
                            : current,
                        )
                      }
                    />
                  </label>
                ) : null}
                <div className="services-iva-row">
                  <label className="form-field">
                    <span>{t('movements.price')}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={scheduleForm.amount}
                      onChange={(event) =>
                        setScheduleForm((current) =>
                          current
                            ? {
                                ...current,
                                ...syncFromNet(event.target.value, current.ivaRate),
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                  <label className="form-field">
                    <span>{t('movements.appliesIva')}</span>
                    <select
                      value={String(scheduleForm.ivaRate)}
                      onChange={(event) =>
                        setScheduleForm((current) =>
                          current
                            ? {
                                ...current,
                                ...syncFromNet(
                                  current.amount,
                                  parseIvaRate(event.target.value) ?? 0,
                                ),
                              }
                            : current,
                        )
                      }
                    >
                      {IVA_RATES.map((rate) => (
                        <option key={rate} value={rate}>
                          {rate === 10
                            ? t('common.iva10')
                            : rate === 21
                              ? t('common.iva21')
                              : t('common.ivaNone')}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-field">
                    <span>{t('movements.priceWithIva')}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={scheduleForm.totalAmount}
                      onChange={(event) =>
                        setScheduleForm((current) =>
                          current
                            ? {
                                ...current,
                                ...syncFromGross(
                                  event.target.value,
                                  current.ivaRate,
                                ),
                              }
                            : current,
                        )
                      }
                    />
                  </label>
                </div>
                <div className="form-field-span">
                  <FinanceChargeToSelect
                    kind={scheduleForm.kind === 'income' ? 'income' : 'cost'}
                    value={scheduleForm.defaultAllocation}
                    onChange={(value) =>
                      setScheduleForm((current) =>
                        current
                          ? { ...current, defaultAllocation: value }
                          : current,
                      )
                    }
                  />
                </div>
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
    </>
  )
}
