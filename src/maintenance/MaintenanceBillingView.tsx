import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { ExportScopeModal } from '../ExportScopeModal'
import { downloadFromResponse } from '../lib/download'
import { authFetch } from '../lib/auth-fetch'
import { fetchJson } from '../operations/api'
import { formatDateOnlyLabel } from '../operations/dateHelpers'
import {
  filterPropertySelectOptions,
  getPropertyLabel,
  sortPropertyOptions,
} from '../operations/propertyHelpers'
import { VisitDetailModal } from '../operations/VisitDetailModal'
import type { PropertyOption } from '../operations/types'
import { PropertyGroupChips } from '../cleaning/PropertyGroupChips'
import {
  BILLING_PROPERTY_GROUP_CHIPS,
  billingPropertyGroupOf,
} from '../cleaning/propertyGroups'
import type { CleaningBillingPropertyGroup } from '../cleaning/types'
import {
  isApprovedOrAbove,
  MAINTENANCE_BILLING_LINE_STATUSES,
  nextBillingLineStatus,
  type MaintenanceBillingLine,
  type MaintenanceBillingLineStatus,
  type MaintenanceBillingMember,
  type MaintenanceBillingMonth,
  type MaintenanceSettings,
  type ProviderRecord,
} from './types'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
  isSummaryInfoOpen: boolean
  onToggleSummaryInfo: () => void
}

type LineDraft = {
  lineId: string
  visitId: string
  isManual: boolean
  isGroup: boolean
  title: string
  date: string
  propertyId: string
  providerId: string
  providerName: string
  hours: string
  price: string
  hoursDisabled: boolean
  billingStatus: MaintenanceBillingLineStatus
}

const emptyDraft = (monthId: string): LineDraft => ({
  lineId: '',
  visitId: '',
  isManual: true,
  isGroup: false,
  title: '',
  date: `${monthId}-01`,
  propertyId: '',
  providerId: '',
  providerName: '',
  hours: '0',
  price: '',
  hoursDisabled: true,
  billingStatus: 'WAITING_APPROVAL',
})

const roundMoney = (value: number) => Math.round(value * 100) / 100

const asLineStatus = (value: unknown): MaintenanceBillingLineStatus =>
  MAINTENANCE_BILLING_LINE_STATUSES.includes(
    String(value) as MaintenanceBillingLineStatus,
  )
    ? (String(value) as MaintenanceBillingLineStatus)
    : 'TO_ESTIMATE'

const mapMonth = (item: Record<string, unknown>): MaintenanceBillingMonth => ({
  id: String(item.id ?? ''),
  status: String(item.status ?? 'CURRENT') as MaintenanceBillingMonth['status'],
  lineCount: Number(item.lineCount ?? 0),
  completedCount: Number(item.completedCount ?? 0),
  warningCount: Number(item.warningCount ?? 0),
  total: Number(item.total ?? 0),
  validatedHours: Number(item.validatedHours ?? 0),
  canClose: Boolean(item.canClose),
  canReopen: Boolean(item.canReopen),
  canEdit: item.canEdit !== false,
  closedAt: typeof item.closedAt === 'string' ? item.closedAt : undefined,
})

const mapSource = (
  value: unknown,
): MaintenanceBillingLine['source'] => {
  if (value === 'manual') {
    return 'manual'
  }
  if (value === 'group') {
    return 'group'
  }
  return 'visit'
}

const mapMember = (item: Record<string, unknown>): MaintenanceBillingMember => ({
  id: String(item.id ?? ''),
  source: item.source === 'manual' ? 'manual' : 'visit',
  visitId: String(item.visitId ?? ''),
  title: String(item.title ?? ''),
  date: String(item.date ?? '').slice(0, 10),
  status: String(item.status ?? ''),
  propertyId: String(item.propertyId ?? ''),
  visitTypeName: String(item.visitTypeName ?? ''),
})

const mapLine = (item: Record<string, unknown>): MaintenanceBillingLine => {
  const source = mapSource(item.source)
  return {
    id: String(item.id ?? ''),
    source,
    visitId: String(item.visitId ?? ''),
    title: String(item.title ?? item.property ?? item.propertyId ?? ''),
    visitTypeId: String(item.visitTypeId ?? ''),
    visitTypeName: String(item.visitTypeName ?? ''),
    propertyId: String(item.propertyId ?? ''),
    property: String(item.property ?? item.propertyId ?? ''),
    date: String(item.date ?? '').slice(0, 10),
    status: String(item.status ?? ''),
    providerId: String(item.providerId ?? ''),
    providerName: String(item.providerName ?? ''),
    hours:
      item.hours === null || item.hours === undefined ? null : Number(item.hours),
    hoursDisabled: Boolean(item.hoursDisabled),
    price:
      item.price === null || item.price === undefined ? null : Number(item.price),
    billingStatus: asLineStatus(item.billingStatus),
    isManual: source === 'manual',
    members: Array.isArray(item.members)
      ? item.members.map((entry) =>
          mapMember((entry ?? {}) as Record<string, unknown>),
        )
      : undefined,
  }
}

const mapSettings = (item: Record<string, unknown>): MaintenanceSettings => ({
  id: String(item.id ?? 'GLOBAL'),
  monthlyHoursPool: Number(item.monthlyHoursPool ?? 100),
  hourlyCost: Number(item.hourlyCost ?? 24),
  defaultProviderId: String(item.defaultProviderId ?? ''),
  defaultProviderName: String(item.defaultProviderName ?? ''),
  visitTypeHours: Array.isArray(item.visitTypeHours)
    ? (item.visitTypeHours as MaintenanceSettings['visitTypeHours'])
    : [],
})

const mapProvider = (item: Record<string, unknown>): ProviderRecord => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? item.id ?? ''),
  active: item.active !== false,
})

const monthBounds = (monthId: string) => {
  const [year, month] = monthId.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    min: `${monthId}-01`,
    max: `${monthId}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function MaintenanceBillingView({
  getEndpoint,
  propertyOptions,
  isSummaryInfoOpen,
  onToggleSummaryInfo,
}: Props) {
  const { t, i18n } = useTranslation()
  const endpoints = useMemo(
    () => ({
      getBilling: getEndpoint(
        'getMaintenanceBillingUrl',
        import.meta.env.VITE_GET_MAINTENANCE_BILLING_URL,
      ),
      upsertBilling: getEndpoint(
        'upsertMaintenanceBillingUrl',
        import.meta.env.VITE_UPSERT_MAINTENANCE_BILLING_URL,
      ),
      exportBilling: getEndpoint(
        'exportMaintenanceBillingUrl',
        import.meta.env.VITE_EXPORT_MAINTENANCE_BILLING_URL,
      ),
      getProviders: getEndpoint(
        'getMaintenanceProvidersUrl',
        import.meta.env.VITE_GET_MAINTENANCE_PROVIDERS_URL,
      ),
    }),
    [getEndpoint],
  )

  const [months, setMonths] = useState<MaintenanceBillingMonth[]>([])
  const [remainingHours, setRemainingHours] = useState<number | null>(null)
  const [selectedMonthId, setSelectedMonthId] = useState('')
  const [month, setMonth] = useState<MaintenanceBillingMonth | null>(null)
  const [lines, setLines] = useState<MaintenanceBillingLine[]>([])
  const [settings, setSettings] = useState<MaintenanceSettings | null>(null)
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isExportOpen, setIsExportOpen] = useState(false)
  const [propertyIds, setPropertyIds] = useState<string[]>([])
  const [propertyDraft, setPropertyDraft] = useState<string[]>([])
  const [groupFilter, setGroupFilter] =
    useState<CleaningBillingPropertyGroup | ''>('')
  const [draft, setDraft] = useState<LineDraft>(emptyDraft(''))
  const [openVisitId, setOpenVisitId] = useState('')
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set())
  const [isSelecting, setIsSelecting] = useState(false)
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([])
  const [isMergeOpen, setIsMergeOpen] = useState(false)
  const [inlineById, setInlineById] = useState<
    Record<string, { hours: string; price: string; hoursDisabled: boolean }>
  >({})
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const money = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language.startsWith('es') ? 'es-ES' : 'en-GB', {
        style: 'currency',
        currency: 'EUR',
      }),
    [i18n.language],
  )

  const propertyById = useMemo(
    () =>
      new Map(
        propertyOptions.map((property) => [property.id, getPropertyLabel(property)]),
      ),
    [propertyOptions],
  )
  const filterPropertyOptions = useMemo(
    () => filterPropertySelectOptions(propertyOptions),
    [propertyOptions],
  )
  const formPropertyOptions = useMemo(
    () => sortPropertyOptions(propertyOptions),
    [propertyOptions],
  )
  const hourlyCost = settings?.hourlyCost ?? 24

  useEffect(() => {
    setInlineById(
      Object.fromEntries(
        lines.map((line) => [
          line.id,
          {
            hours: line.hours === null ? '' : String(line.hours),
            price: line.price === null ? '' : String(line.price),
            hoursDisabled: line.isManual || line.hoursDisabled,
          },
        ]),
      ),
    )
  }, [lines])

  const loadMonths = useCallback(async () => {
    if (!endpoints.getBilling) {
      setError(t('maintenanceBilling.missingEndpoint'))
      return
    }
    const payload = await fetchJson<{
      months?: Record<string, unknown>[]
      remainingHours?: number
    }>(endpoints.getBilling)
    setMonths((payload.months ?? []).map(mapMonth))
    setRemainingHours(
      typeof payload.remainingHours === 'number' ? payload.remainingHours : null,
    )
  }, [endpoints.getBilling, t])

  const loadMonth = useCallback(
    async (monthId: string) => {
      if (!endpoints.getBilling || !monthId) {
        return
      }
      const payload = await fetchJson<{
        month?: Record<string, unknown>
        lines?: Record<string, unknown>[]
        settings?: Record<string, unknown>
      }>(`${endpoints.getBilling}?month=${encodeURIComponent(monthId)}`)
      setMonth(payload.month ? mapMonth(payload.month) : null)
      setLines((payload.lines ?? []).map(mapLine))
      if (payload.settings) {
        setSettings(mapSettings(payload.settings))
      }
    },
    [endpoints.getBilling],
  )

  const loadProviders = useCallback(async () => {
    if (!endpoints.getProviders) {
      return
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      `${endpoints.getProviders}?includeInactive=true`,
    )
    setProviders((payload.items ?? []).map(mapProvider))
  }, [endpoints.getProviders])

  const refreshList = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      await loadMonths()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('maintenanceBilling.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [loadMonths, t])

  const refreshMonth = useCallback(async () => {
    if (!selectedMonthId) {
      return
    }
    setIsLoading(true)
    setError('')
    try {
      await Promise.all([loadMonth(selectedMonthId), loadProviders()])
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('maintenanceBilling.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [loadMonth, loadProviders, selectedMonthId, t])

  useEffect(() => {
    if (selectedMonthId) {
      void refreshMonth()
      return
    }
    void refreshList()
  }, [refreshList, refreshMonth, selectedMonthId])

  useEffect(() => {
    setIsSelecting(false)
    setSelectedLineIds([])
    setIsMergeOpen(false)
  }, [selectedMonthId])

  const save = async (body: Record<string, unknown>) => {
    if (!endpoints.upsertBilling) {
      setError(t('maintenanceBilling.missingWrite'))
      return false
    }
    setIsSaving(true)
    setError('')
    try {
      const payload = await fetchJson<{
        month?: Record<string, unknown>
        lines?: Record<string, unknown>[]
        settings?: Record<string, unknown>
      }>(endpoints.upsertBilling, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      setMonth(payload.month ? mapMonth(payload.month) : null)
      setLines((payload.lines ?? []).map(mapLine))
      if (payload.settings) {
        setSettings(mapSettings(payload.settings))
      }
      setMessage(t('maintenanceBilling.saved'))
      return true
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('maintenanceBilling.saveError'),
      )
      return false
    } finally {
      setIsSaving(false)
    }
  }

  const filteredLines = useMemo(() => {
    return lines.filter((line) => {
      const label = propertyById.get(line.propertyId) || line.property
      const group = billingPropertyGroupOf(label, line.propertyId)
      if (groupFilter && group !== groupFilter) {
        return false
      }
      if (propertyIds.length > 0 && !propertyIds.includes(line.propertyId)) {
        return false
      }
      return true
    })
  }, [groupFilter, lines, propertyById, propertyIds])

  const filteredTotal = filteredLines
    .filter((line) => isApprovedOrAbove(line.billingStatus))
    .reduce((sum, line) => sum + (line.price ?? 0), 0)

  const formatMonthLabel = (monthId: string) => {
    const [year, month] = monthId.split('-').map(Number)
    return new Intl.DateTimeFormat(
      i18n.language.startsWith('es') ? 'es-ES' : 'en-GB',
      { month: 'long', year: 'numeric', timeZone: 'UTC' },
    ).format(new Date(Date.UTC(year, month - 1, 1)))
  }

  const lineStatusLabel = (status: MaintenanceBillingLineStatus) =>
    t(`maintenanceBilling.lineStatus.${status}`)

  const exportClosedMonth = async (scope: 'filtered' | 'all') => {
    if (!selectedMonthId || month?.status !== 'CLOSED') {
      return false
    }
    if (!endpoints.exportBilling) {
      setError(t('maintenanceBilling.missingExport'))
      return false
    }
    setIsExporting(true)
    setError('')
    try {
      const sourceLines = scope === 'filtered' ? filteredLines : lines
      const headers = [
        t('maintenanceBilling.visitTitle'),
        t('maintenanceBilling.property'),
        t('maintenanceBilling.date'),
        t('maintenanceBilling.visitStatus'),
        t('maintenanceBilling.provider'),
        t('maintenanceBilling.hours'),
        t('maintenanceBilling.price'),
        t('maintenanceBilling.billingStatus'),
        t('maintenanceBilling.source'),
      ]
      const rows = sourceLines.map((line) => ({
        [t('maintenanceBilling.visitTitle')]:
          line.title || propertyById.get(line.propertyId) || line.property,
        [t('maintenanceBilling.property')]:
          propertyById.get(line.propertyId) || line.property,
        [t('maintenanceBilling.date')]: line.date,
        [t('maintenanceBilling.visitStatus')]:
          line.source === 'group'
            ? t('maintenanceBilling.groupStatus')
            : line.isManual
              ? t('maintenanceBilling.manualStatus')
              : line.status,
        [t('maintenanceBilling.provider')]: line.providerName,
        [t('maintenanceBilling.hours')]: line.hours ?? 0,
        [t('maintenanceBilling.price')]: line.price ?? '',
        [t('maintenanceBilling.billingStatus')]: lineStatusLabel(line.billingStatus),
        [t('maintenanceBilling.source')]:
          line.source === 'group'
            ? t('maintenanceBilling.sourceGroup')
            : line.isManual
              ? t('maintenanceBilling.sourceManual')
              : t('maintenanceBilling.sourceVisit'),
      }))
      const response = await authFetch(endpoints.exportBilling, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonthId,
          filtered: scope === 'filtered',
          headers,
          rows,
        }),
      })
      if (!response.ok) {
        const errorText = await response.text()
        let exportMessage = errorText || t('maintenanceBilling.exportError')
        try {
          const parsed = JSON.parse(errorText) as { message?: string }
          if (parsed.message) {
            exportMessage = parsed.message
          }
        } catch {
          // Keep the raw response text when it is not JSON.
        }
        throw new Error(exportMessage)
      }
      await downloadFromResponse(
        response,
        `maintenance-billing-${selectedMonthId}.xlsx`,
      )
      return true
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : t('maintenanceBilling.exportError'),
      )
      return false
    } finally {
      setIsExporting(false)
    }
  }

  const openCreate = () => {
    if (!selectedMonthId) {
      return
    }
    const bounds = monthBounds(selectedMonthId)
    setDraft({
      ...emptyDraft(selectedMonthId),
      date: bounds.min,
      providerId: settings?.defaultProviderId ?? '',
      providerName: settings?.defaultProviderName ?? '',
    })
    setIsFormOpen(true)
  }

  const openEdit = (line: MaintenanceBillingLine) => {
    setDraft({
      lineId: line.id,
      visitId: line.visitId,
      isManual: line.isManual,
      isGroup: line.source === 'group',
      title: line.title,
      date: line.date,
      propertyId: line.propertyId,
      providerId: line.providerId,
      providerName: line.providerName,
      hours: line.hours === null ? '' : String(line.hours),
      price: line.price === null ? '' : String(line.price),
      hoursDisabled: line.isManual || line.hoursDisabled,
      billingStatus: line.billingStatus,
    })
    setIsFormOpen(true)
  }

  const submitDraft = async () => {
    if (!selectedMonthId) {
      return
    }
    const selectedProvider = providers.find((item) => item.id === draft.providerId)
    const providerName = selectedProvider?.name || draft.providerName.trim()
    const price = Number(String(draft.price).replace(',', '.'))
    if (!draft.providerId || !Number.isFinite(price)) {
      setError(t('maintenanceBilling.lineRequired'))
      return
    }
    if (draft.isManual && !draft.propertyId) {
      setError(t('maintenanceBilling.propertyRequired'))
      return
    }
    if (draft.isGroup && !draft.title.trim()) {
      setError(t('maintenanceBilling.titleRequired'))
      return
    }
    const hoursDisabled = draft.isManual || draft.hoursDisabled
    const hours = hoursDisabled
      ? 0
      : Number(String(draft.hours).replace(',', '.'))
    if (!hoursDisabled && !Number.isFinite(hours)) {
      setError(t('maintenanceBilling.hoursRequired'))
      return
    }
    await save({
      month: selectedMonthId,
      action: draft.isManual
        ? draft.lineId
          ? 'update-manual'
          : 'add-manual'
        : draft.isGroup
          ? 'override-group'
          : 'override',
      visitId: draft.visitId || undefined,
      lineId: draft.lineId || undefined,
      title: draft.title,
      date: draft.date,
      propertyId: draft.propertyId,
      property: propertyById.get(draft.propertyId) || draft.propertyId,
      providerId: draft.providerId,
      providerName,
      hours,
      hoursDisabled,
      price,
      billingStatus: draft.billingStatus,
    })
    setIsFormOpen(false)
  }

  const canCheck = (line: MaintenanceBillingLine) => {
    if (!nextBillingLineStatus(line.billingStatus)) {
      return false
    }
    if (line.isManual) {
      return true
    }
    return line.price !== null
  }

  const isGroupLine = (line: MaintenanceBillingLine) => line.source === 'group'

  const canSelectLine = (line: MaintenanceBillingLine) =>
    Boolean(month?.canEdit) && line.billingStatus === 'TO_ESTIMATE'

  const selectedLines = useMemo(
    () =>
      filteredLines.filter((line) => selectedLineIds.includes(line.id)),
    [filteredLines, selectedLineIds],
  )

  const selectionPropertyId = selectedLines[0]?.propertyId ?? ''
  const selectionHasMixedProperty = selectedLines.some(
    (line) => line.propertyId !== selectionPropertyId,
  )
  const canConfirmSelection =
    selectedLines.length >= 2 && !selectionHasMixedProperty

  const toggleSelectedLine = (line: MaintenanceBillingLine) => {
    if (!canSelectLine(line)) {
      return
    }
    setSelectedLineIds((current) => {
      if (current.includes(line.id)) {
        return current.filter((id) => id !== line.id)
      }
      const first = filteredLines.find((entry) => current.includes(entry.id))
      if (first && first.propertyId !== line.propertyId) {
        setError(t('maintenanceBilling.mergeSameProperty'))
        return current
      }
      setError('')
      return [...current, line.id]
    })
  }

  const exitSelection = () => {
    setIsSelecting(false)
    setSelectedLineIds([])
    setIsMergeOpen(false)
  }

  const openMergeForm = () => {
    if (!selectedMonthId || !canConfirmSelection) {
      if (selectionHasMixedProperty) {
        setError(t('maintenanceBilling.mergeSameProperty'))
      } else {
        setError(t('maintenanceBilling.mergeMinLines'))
      }
      return
    }
    const first = selectedLines[0]
    setError('')
    setDraft({
      lineId: '',
      visitId: '',
      isManual: false,
      isGroup: true,
      title: first.title,
      date: first.date,
      propertyId: first.propertyId,
      providerId: first.providerId || settings?.defaultProviderId || '',
      providerName: first.providerName || settings?.defaultProviderName || '',
      hours: '',
      price: '',
      hoursDisabled: false,
      billingStatus: 'TO_ESTIMATE',
    })
    setIsMergeOpen(true)
  }

  const submitMerge = async () => {
    if (!selectedMonthId || !canConfirmSelection) {
      return
    }
    const selectedProvider = providers.find((item) => item.id === draft.providerId)
    const providerName = selectedProvider?.name || draft.providerName.trim()
    const hoursDisabled = draft.hoursDisabled
    const hours = hoursDisabled
      ? 0
      : Number(String(draft.hours).replace(',', '.'))
    const price = Number(String(draft.price).replace(',', '.'))
    if (!draft.title.trim()) {
      setError(t('maintenanceBilling.titleRequired'))
      return
    }
    if (!hoursDisabled && draft.hours.trim() && !Number.isFinite(hours)) {
      setError(t('maintenanceBilling.hoursRequired'))
      return
    }
    if (hoursDisabled && !Number.isFinite(price)) {
      setError(t('maintenanceBilling.lineRequired'))
      return
    }
    const first = selectedLines[0]
    const ok = await save({
      month: selectedMonthId,
      action: 'merge',
      lineIds: selectedLines.map((line) => line.id),
      title: draft.title.trim(),
      date: draft.date,
      propertyId: first.propertyId,
      property: propertyById.get(first.propertyId) || first.property,
      visitTypeId: first.visitTypeId,
      visitTypeName: first.visitTypeName,
      providerId: draft.providerId || first.providerId,
      providerName: providerName || first.providerName,
      hours: hoursDisabled ? 0 : draft.hours.trim() ? hours : null,
      hoursDisabled,
      price: Number.isFinite(price) ? price : null,
    })
    if (ok) {
      exitSelection()
    }
  }

  const statusLabel = (status: MaintenanceBillingMonth['status']) => {
    if (status === 'CURRENT') return t('maintenanceBilling.statusCurrent')
    if (status === 'PENDING_TO_CLOSE') return t('maintenanceBilling.statusPending')
    return t('maintenanceBilling.statusClosed')
  }

  const formatHours = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) {
      return '—'
    }
    return String(value).replace('.', ',')
  }

  const toggleRow = (lineId: string) => {
    setExpandedRowIds((current) => {
      const next = new Set(current)
      if (next.has(lineId)) {
        next.delete(lineId)
      } else {
        next.add(lineId)
      }
      return next
    })
  }

  const updateInline = (
    lineId: string,
    patch: Partial<{ hours: string; price: string; hoursDisabled: boolean }>,
  ) => {
    setInlineById((current) => ({
      ...current,
      [lineId]: {
        hours: current[lineId]?.hours ?? '',
        price: current[lineId]?.price ?? '',
        hoursDisabled: current[lineId]?.hoursDisabled ?? false,
        ...patch,
      },
    }))
  }

  const persistInline = async (
    line: MaintenanceBillingLine,
    values?: { hours: string; price: string; hoursDisabled: boolean },
  ) => {
    if (!month?.canEdit) {
      return
    }
    const draftValues = values ?? inlineById[line.id]
    if (!draftValues) {
      return
    }
    const hoursDisabled = line.isManual || draftValues.hoursDisabled
    const hours = hoursDisabled
      ? 0
      : Number(String(draftValues.hours).replace(',', '.'))
    const price = Number(String(draftValues.price).replace(',', '.'))
    if (line.isManual && !Number.isFinite(price)) {
      setError(t('maintenanceBilling.lineRequired'))
      return
    }
    const originalHours = line.hours ?? 0
    const originalPrice = line.price
    const nextHours = hoursDisabled ? 0 : hours
    const nextPrice = Number.isFinite(price) ? price : null
    if (
      (hoursDisabled || Number.isFinite(hours)) &&
      nextHours === originalHours &&
      nextPrice === originalPrice &&
      hoursDisabled === (line.isManual || line.hoursDisabled)
    ) {
      return
    }
    if (!hoursDisabled && !Number.isFinite(hours)) {
      updateInline(line.id, {
        hours: line.hours === null ? '' : String(line.hours),
        price: line.price === null ? '' : String(line.price),
        hoursDisabled: line.hoursDisabled,
      })
      return
    }
    await save({
      month: selectedMonthId,
      action: line.isManual
        ? 'update-manual'
        : line.source === 'group'
          ? 'override-group'
          : 'override',
      visitId: line.visitId || undefined,
      lineId: line.isManual || line.source === 'group' ? line.id : undefined,
      title: line.title,
      date: line.date,
      propertyId: line.propertyId,
      property: line.property,
      providerId: line.providerId,
      providerName: line.providerName,
      hours: hoursDisabled ? 0 : hours,
      hoursDisabled,
      price: Number.isFinite(price) ? price : null,
      billingStatus: line.billingStatus,
    })
  }

  const lineWarnings = (line: MaintenanceBillingLine) => {
    const warnings: string[] = []
    if (line.price === null) {
      warnings.push(t('maintenanceBilling.warning.price'))
    }
    if (!line.providerId) {
      warnings.push(t('maintenanceBilling.warning.provider'))
    }
    return warnings
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('maintenanceBilling.eyebrow')}</p>
          <div className="page-title-row">
            {selectedMonthId ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setSelectedMonthId('')
                  setMonth(null)
                  setLines([])
                  setGroupFilter('')
                  setPropertyIds([])
                  void refreshList()
                }}
              >
                {t('common.back')}
              </button>
            ) : null}
            <h1 className="page-title">
              {selectedMonthId
                ? formatMonthLabel(selectedMonthId)
                : t('pages.Maintenance Billing')}
            </h1>
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
          <p className="subtitle">
            {selectedMonthId
              ? t('maintenanceBilling.monthSubtitle')
              : t('maintenanceBilling.subtitle')}
          </p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <div className="header-actions">
              {selectedMonthId ? (
                <>
                  <button
                    className={`btn-ghost btn-filter ${isFilterOpen ? 'is-active' : ''}`}
                    type="button"
                    aria-label={t('common.filters')}
                    onClick={() => {
                      setPropertyDraft(propertyIds)
                      setIsFilterOpen(true)
                    }}
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
                      <path
                        d="M3 4h14l-5.5 6.2V16l-3-1.5v-4.3L3 4z"
                        fill="currentColor"
                      />
                    </svg>
                    {propertyIds.length + (groupFilter ? 1 : 0) > 0 ? (
                      <span className="filter-badge">
                        {propertyIds.length + (groupFilter ? 1 : 0)}
                      </span>
                    ) : null}
                  </button>
                  <button
                    className="btn-ghost"
                    type="button"
                    onClick={() => {
                      if (month?.status !== 'CLOSED') {
                        setMessage('')
                        setError(t('maintenanceBilling.exportClosedOnly'))
                        return
                      }
                      setError('')
                      setIsExportOpen(true)
                    }}
                    disabled={isExporting}
                    aria-label={t('common.export')}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      width="16"
                      height="16"
                    >
                      <path
                        d="M10 3v8.2l2.4-2.4 1.4 1.4-4.8 4.8-4.8-4.8 1.4-1.4L8 11.2V3h2zm-6 12h12v2H4v-2z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                  {month?.canEdit && !isSelecting ? (
                    <button
                      className="btn-ghost"
                      type="button"
                      onClick={openCreate}
                      aria-label={t('maintenanceBilling.addManual')}
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
                        <path d="M9 4h2v5h5v2h-5v5H9v-5H4V9h5V4z" fill="currentColor" />
                      </svg>
                    </button>
                  ) : null}
                  {month?.canEdit && !isSelecting ? (
                    <button
                      className="btn-ghost"
                      type="button"
                      onClick={() => {
                        setError('')
                        setMessage('')
                        setSelectedLineIds([])
                        setIsSelecting(true)
                      }}
                      aria-label={t('maintenanceBilling.groupLines')}
                      title={t('maintenanceBilling.groupLines')}
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
                        <path
                          d="M3 4h8v5H3V4zm0 7h8v5H3v-5zm10-7h4v12h-4V4z"
                          fill="currentColor"
                        />
                      </svg>
                    </button>
                  ) : null}
                  {isSelecting ? (
                    <>
                      <button
                        className="btn-ghost"
                        type="button"
                        onClick={exitSelection}
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        className="btn-primary"
                        type="button"
                        disabled={!canConfirmSelection}
                        onClick={openMergeForm}
                      >
                        {t('maintenanceBilling.continueGroup')}
                        {selectedLineIds.length > 0 ? (
                          <span className="filter-badge">{selectedLineIds.length}</span>
                        ) : null}
                      </button>
                    </>
                  ) : null}
                </>
              ) : null}
              <button
                className="btn-primary"
                type="button"
                onClick={() =>
                  selectedMonthId ? void refreshMonth() : void refreshList()
                }
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

      {selectedMonthId && month ? (
        <section className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}>
          <div className="card card-compact">
            <p className="card-label">{t('maintenanceBilling.status')}</p>
            <p className="card-value">{statusLabel(month.status)}</p>
            <p className="card-meta">{t('maintenanceBilling.statusMeta')}</p>
          </div>
          <div className="card card-compact">
            <p className="card-label">{t('maintenanceBilling.totalCard')}</p>
            <p className="card-value">{money.format(filteredTotal)}</p>
            <p className="card-meta">{t('maintenanceBilling.totalCardMeta')}</p>
          </div>
          <div className="card card-compact">
            <p className="card-label">{t('maintenanceBilling.warningsCard')}</p>
            <p className="card-value">{month.warningCount}</p>
            <p className="card-meta">{t('maintenanceBilling.warningsCardMeta')}</p>
          </div>
        </section>
      ) : (
        <section className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}>
          <div className="card card-compact">
            <p className="card-label">{t('maintenanceBilling.monthsCard')}</p>
            <p className="card-value">{isLoading ? '—' : months.length}</p>
            <p className="card-meta">{t('maintenanceBilling.monthsCardMeta')}</p>
          </div>
          <div className="card card-compact">
            <p className="card-label">{t('maintenanceBilling.pendingCard')}</p>
            <p className="card-value">
              {isLoading
                ? '—'
                : months.filter((item) => item.status === 'PENDING_TO_CLOSE').length}
            </p>
            <p className="card-meta">{t('maintenanceBilling.pendingCardMeta')}</p>
          </div>
          <div className="card card-compact">
            <p className="card-label">{t('maintenanceBilling.remainingCard')}</p>
            <p className="card-value">
              {isLoading || remainingHours === null
                ? '—'
                : `${formatHours(remainingHours)} h`}
            </p>
            <p className="card-meta">{t('maintenanceBilling.remainingCardMeta')}</p>
          </div>
        </section>
      )}

      {selectedMonthId ? (
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{t('maintenanceBilling.linesTitle')}</h2>
              <p className="card-subtitle">
                {isSelecting
                  ? t('maintenanceBilling.groupSelectHint')
                  : t('maintenanceBilling.linesSubtitle')}
              </p>
            </div>
            <div className="table-actions">
              {month?.canClose ? (
                <button
                  className="btn-primary"
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    if (window.confirm(t('maintenanceBilling.closeConfirm'))) {
                      void save({ month: selectedMonthId, action: 'close' })
                    }
                  }}
                >
                  {t('maintenanceBilling.close')}
                </button>
              ) : null}
              {month?.canReopen ? (
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={isSaving}
                  onClick={() =>
                    void save({ month: selectedMonthId, action: 'reopen' })
                  }
                >
                  {t('maintenanceBilling.reopen')}
                </button>
              ) : null}
            </div>
          </div>
          <PropertyGroupChips
            value={groupFilter === 'other' ? 'apartments' : groupFilter}
            onChange={setGroupFilter}
            groups={BILLING_PROPERTY_GROUP_CHIPS}
          />
          <div className="table-wrapper">
            <table className="data-table data-table-maintenance-billing">
              <thead>
                <tr>
                  <th>{t('maintenanceBilling.visitTitle')}</th>
                  <th>{t('maintenanceBilling.date')}</th>
                  <th>{t('maintenanceBilling.visitStatus')}</th>
                  <th>{t('maintenanceBilling.hours')}</th>
                  <th>{t('maintenanceBilling.price')}</th>
                  <th>{t('maintenanceBilling.billingStatus')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7}>{t('common.loading')}</td>
                  </tr>
                ) : filteredLines.length === 0 ? (
                  <tr>
                    <td colSpan={7}>{t('maintenanceBilling.emptyLines')}</td>
                  </tr>
                ) : (
                  filteredLines.map((line) => {
                    const isExpanded = expandedRowIds.has(line.id)
                    const inline = inlineById[line.id] ?? {
                      hours: line.hours === null ? '' : String(line.hours),
                      price: line.price === null ? '' : String(line.price),
                      hoursDisabled: line.isManual || line.hoursDisabled,
                    }
                    const warnings = lineWarnings(line)
                    const propertyLabel =
                      propertyById.get(line.propertyId) || line.property || '—'
                    const titleLabel =
                      line.title || propertyLabel
                    return (
                      <Fragment key={line.id}>
                        <tr
                          className={`${line.price === null ? 'billing-warning-row' : ''} ${
                            selectedLineIds.includes(line.id) ? 'billing-row-selected' : ''
                          }`}
                        >
                          <td>
                            <div className="billing-title-cell">
                              {isSelecting ? (
                                <input
                                  type="checkbox"
                                  className="billing-row-checkbox"
                                  checked={selectedLineIds.includes(line.id)}
                                  disabled={!canSelectLine(line)}
                                  aria-label={t('maintenanceBilling.selectLine')}
                                  onChange={() => toggleSelectedLine(line)}
                                />
                              ) : null}
                              <div>
                                {isGroupLine(line) ? (
                                  <p className="billing-group-title">
                                    <span className="tag">{t('maintenanceBilling.groupTag')}</span>
                                    {titleLabel}
                                  </p>
                                ) : line.visitId ? (
                                  <button
                                    type="button"
                                    className="cleaning-visit-title-btn"
                                    aria-label={t('cleaningPlan.openVisit')}
                                    onClick={() => setOpenVisitId(line.visitId)}
                                  >
                                    {titleLabel}
                                  </button>
                                ) : (
                                  titleLabel
                                )}
                                <p className="card-meta billing-line-property">
                                  {propertyLabel}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td>{formatDateOnlyLabel(line.date, i18n.language)}</td>
                          <td>
                            {isGroupLine(line)
                              ? t('maintenanceBilling.groupStatus')
                              : line.isManual
                                ? t('maintenanceBilling.manualStatus')
                                : line.status}
                          </td>
                          <td>
                            {month?.canEdit ? (
                              <input
                                className="billing-inline-input"
                                type="number"
                                min="0"
                                step="0.25"
                                value={inline.hours}
                                disabled={isSaving || line.isManual || isSelecting}
                                aria-label={t('maintenanceBilling.hours')}
                                onChange={(event) => {
                                  const hoursValue = event.target.value
                                  const numeric = Number(
                                    String(hoursValue).replace(',', '.'),
                                  )
                                  updateInline(line.id, {
                                    hours: hoursValue,
                                    hoursDisabled: false,
                                    price:
                                      Number.isFinite(numeric) && numeric > 0
                                        ? String(roundMoney(numeric * hourlyCost))
                                        : inline.price,
                                  })
                                }}
                                onBlur={(event) => {
                                  if (line.isManual) {
                                    return
                                  }
                                  const hoursValue = event.currentTarget.value
                                  const numeric = Number(
                                    String(hoursValue).replace(',', '.'),
                                  )
                                  const next = {
                                    hours: hoursValue,
                                    hoursDisabled: false,
                                    price:
                                      Number.isFinite(numeric) && numeric > 0
                                        ? String(roundMoney(numeric * hourlyCost))
                                        : inline.price,
                                  }
                                  void persistInline(line, next)
                                }}
                              />
                            ) : (
                              formatHours(line.hours)
                            )}
                          </td>
                          <td>
                            {month?.canEdit ? (
                              <input
                                className="billing-inline-input"
                                type="number"
                                min="0"
                                step="0.01"
                                value={inline.price}
                                disabled={isSaving || isSelecting}
                                aria-label={t('maintenanceBilling.price')}
                                onChange={(event) => {
                                  updateInline(line.id, {
                                    price: event.target.value,
                                    hoursDisabled: true,
                                    hours: '0',
                                  })
                                }}
                                onBlur={(event) => {
                                  const priceValue = event.currentTarget.value
                                  const original =
                                    line.price === null ? '' : String(line.price)
                                  if (priceValue === original) {
                                    updateInline(line.id, {
                                      hours:
                                        line.hours === null ? '' : String(line.hours),
                                      price: original,
                                      hoursDisabled: line.isManual || line.hoursDisabled,
                                    })
                                    return
                                  }
                                  void persistInline(line, {
                                    hours: '0',
                                    price: priceValue,
                                    hoursDisabled: true,
                                  })
                                }}
                              />
                            ) : line.price === null ? (
                              '—'
                            ) : (
                              money.format(line.price)
                            )}
                          </td>
                          <td>
                            <span className="tag">
                              {lineStatusLabel(line.billingStatus)}
                            </span>
                          </td>
                          <td>
                            {month?.canEdit && !isSelecting ? (
                              <div className="action-buttons">
                                <button
                                  className="btn-icon btn-icon-ghost"
                                  type="button"
                                  disabled={isSaving || !canCheck(line)}
                                  aria-label={t('maintenanceBilling.check')}
                                  title={t('maintenanceBilling.check')}
                                  onClick={() =>
                                    void save({
                                      month: selectedMonthId,
                                      action: line.isManual
                                        ? 'advance-manual'
                                        : isGroupLine(line)
                                          ? 'advance-group'
                                          : 'advance',
                                      visitId: line.visitId || undefined,
                                      lineId:
                                        line.isManual || isGroupLine(line)
                                          ? line.id
                                          : undefined,
                                    })
                                  }
                                >
                                  <svg
                                    aria-hidden="true"
                                    viewBox="0 0 20 20"
                                    width="16"
                                    height="16"
                                  >
                                    <path
                                      d="M7.8 13.4 4.6 10.2l1.4-1.4 1.8 1.8 6-6 1.4 1.4-7.4 7.4z"
                                      fill="currentColor"
                                    />
                                  </svg>
                                </button>
                                <button
                                  className="btn-icon btn-icon-ghost"
                                  type="button"
                                  aria-label={t('maintenanceSettings.edit')}
                                  title={t('maintenanceSettings.edit')}
                                  onClick={() => openEdit(line)}
                                >
                                  ✎
                                </button>
                                {isGroupLine(line) ? (
                                  <button
                                    className="btn-icon btn-icon-ghost"
                                    type="button"
                                    disabled={isSaving}
                                    aria-label={t('maintenanceBilling.ungroup')}
                                    title={t('maintenanceBilling.ungroup')}
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          t('maintenanceBilling.ungroupConfirm'),
                                        )
                                      ) {
                                        void save({
                                          month: selectedMonthId,
                                          action: 'unmerge',
                                          lineId: line.id,
                                        })
                                      }
                                    }}
                                  >
                                    <svg
                                      aria-hidden="true"
                                      viewBox="0 0 20 20"
                                      width="16"
                                      height="16"
                                    >
                                      <path
                                        d="M4 5h5v2H4V5zm7 0h5v2h-5V5zM4 9h12v2H4V9zm0 4h5v2H4v-2zm7 0h5v2h-5v-2z"
                                        fill="currentColor"
                                      />
                                    </svg>
                                  </button>
                                ) : null}
                                {line.isManual ? (
                                  <button
                                    className="btn-icon btn-icon-ghost"
                                    type="button"
                                    disabled={isSaving}
                                    aria-label={t('common.delete')}
                                    title={t('common.delete')}
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          t('maintenanceBilling.deleteConfirm'),
                                        )
                                      ) {
                                        void save({
                                          month: selectedMonthId,
                                          action: 'delete-manual',
                                          lineId: line.id,
                                        })
                                      }
                                    }}
                                  >
                                    <svg
                                      aria-hidden="true"
                                      viewBox="0 0 20 20"
                                      width="16"
                                      height="16"
                                    >
                                      <path
                                        d="M6 2a2 2 0 0 0-2 2v1h12V4a2 2 0 0 0-2-2H6zm11 4H3v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6zM8 8v6m4-6v6"
                                        fill="currentColor"
                                      />
                                    </svg>
                                  </button>
                                ) : null}
                                <button
                                  className="btn-icon btn-icon-ghost"
                                  type="button"
                                  onClick={() => toggleRow(line.id)}
                                  aria-expanded={isExpanded}
                                  aria-label={t('common.toggleDetails')}
                                >
                                  {isExpanded ? '▾' : '▸'}
                                </button>
                              </div>
                            ) : (
                              <div className="action-buttons">
                                <button
                                  className="btn-icon btn-icon-ghost"
                                  type="button"
                                  onClick={() => toggleRow(line.id)}
                                  aria-expanded={isExpanded}
                                  aria-label={t('common.toggleDetails')}
                                >
                                  {isExpanded ? '▾' : '▸'}
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="detail-row">
                            <td colSpan={7}>
                              <div className="detail-grid">
                                <div>
                                  <p className="detail-label">
                                    {t('maintenanceBilling.provider')}
                                  </p>
                                  <p className="detail-value">
                                    {line.providerName || '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="detail-label">
                                    {t('maintenanceBilling.visitType')}
                                  </p>
                                  <p className="detail-value">
                                    {line.visitTypeName || '—'}
                                  </p>
                                </div>
                                <div>
                                  <p className="detail-label">
                                    {t('maintenanceBilling.source')}
                                  </p>
                                  <p className="detail-value">
                                    {isGroupLine(line)
                                      ? t('maintenanceBilling.sourceGroup')
                                      : line.isManual
                                        ? t('maintenanceBilling.sourceManual')
                                        : t('maintenanceBilling.sourceVisit')}
                                  </p>
                                </div>
                                <div className="detail-span">
                                  <p className="detail-label">
                                    {t('maintenanceBilling.warnings')}
                                  </p>
                                  {warnings.length > 0 ? (
                                    <p className="detail-value billing-warning-text">
                                      {warnings.join(' · ')}
                                    </p>
                                  ) : (
                                    <p className="detail-value detail-muted">—</p>
                                  )}
                                </div>
                                {isGroupLine(line) ? (
                                  <div className="detail-span">
                                    <p className="detail-label">
                                      {t('maintenanceBilling.groupMembers')}
                                    </p>
                                    <ul className="billing-group-members">
                                      {(line.members ?? []).map((member) => (
                                        <li key={member.id}>
                                          {member.visitId ? (
                                            <button
                                              type="button"
                                              className="cleaning-visit-title-btn"
                                              onClick={() =>
                                                setOpenVisitId(member.visitId)
                                              }
                                            >
                                              {member.title || member.id}
                                            </button>
                                          ) : (
                                            <span>{member.title || member.id}</span>
                                          )}
                                          <span className="card-meta">
                                            {formatDateOnlyLabel(
                                              member.date,
                                              i18n.language,
                                            )}
                                            {' · '}
                                            {member.source === 'manual'
                                              ? t('maintenanceBilling.manualStatus')
                                              : member.status || '—'}
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{t('maintenanceBilling.cardTitle')}</h2>
              <p className="card-subtitle">{t('maintenanceBilling.cardSubtitle')}</p>
            </div>
          </div>
          <div className="table-wrapper">
            <table className="data-table data-table-cleaning-billing-months">
              <thead>
                <tr>
                  <th>{t('maintenanceBilling.month')}</th>
                  <th>{t('maintenanceBilling.status')}</th>
                  <th>{t('maintenanceBilling.lines')}</th>
                  <th>{t('maintenanceBilling.warnings')}</th>
                  <th>{t('maintenanceBilling.total')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6}>{t('common.loading')}</td>
                  </tr>
                ) : months.length === 0 ? (
                  <tr>
                    <td colSpan={6}>{t('maintenanceBilling.empty')}</td>
                  </tr>
                ) : (
                  months.map((item) => (
                    <tr key={item.id}>
                      <td>{formatMonthLabel(item.id)}</td>
                      <td>
                        <span className={`tag ${item.status === 'CLOSED' ? 'muted' : ''}`}>
                          {statusLabel(item.status)}
                        </span>
                      </td>
                      <td>{item.lineCount}</td>
                      <td>{item.warningCount}</td>
                      <td>{money.format(item.total)}</td>
                      <td>
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() => setSelectedMonthId(item.id)}
                        >
                          {t('maintenanceBilling.open')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ExportScopeModal
        isOpen={isExportOpen}
        isExporting={isExporting}
        onClose={() => setIsExportOpen(false)}
        onSelect={(scope) => {
          void exportClosedMonth(scope).then((ok) => {
            if (ok) {
              setIsExportOpen(false)
            }
          })
        }}
      />

      {isFilterOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-scrollable">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('common.filters')}</h3>
                <p className="modal-subtitle">{t('maintenanceBilling.filterSubtitle')}</p>
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
              <div className="filter-group">
                <p className="filter-title">{t('maintenanceBilling.property')}</p>
                <div className="filter-options filter-options-scroll">
                  {filterPropertyOptions.map((property) => (
                    <label className="filter-option" key={property.id}>
                      <input
                        type="checkbox"
                        checked={propertyDraft.includes(property.id)}
                        onChange={() =>
                          setPropertyDraft((current) =>
                            current.includes(property.id)
                              ? current.filter((id) => id !== property.id)
                              : [...current, property.id],
                          )
                        }
                      />
                      <span>{getPropertyLabel(property)}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  setPropertyDraft([])
                  setPropertyIds([])
                  setIsFilterOpen(false)
                }}
              >
                {t('common.clear')}
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  setPropertyIds(propertyDraft)
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
                  {draft.isGroup
                    ? t('maintenanceBilling.editGroup')
                    : draft.lineId
                      ? t('maintenanceBilling.editLine')
                      : t('maintenanceBilling.addManual')}
                </h3>
                <p className="modal-subtitle">{t('maintenanceBilling.formSubtitle')}</p>
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
                {draft.isGroup ? (
                  <>
                    <label>
                      {t('maintenanceBilling.visitTitle')}
                      <input
                        type="text"
                        value={draft.title}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      {t('maintenanceBilling.date')}
                      <input
                        type="date"
                        min={monthBounds(selectedMonthId).min}
                        max={monthBounds(selectedMonthId).max}
                        value={draft.date}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            date: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      {t('maintenanceBilling.property')}
                      <input
                        type="text"
                        value={
                          propertyById.get(draft.propertyId) || draft.propertyId
                        }
                        disabled
                      />
                    </label>
                  </>
                ) : null}
                {draft.isManual ? (
                  <>
                    <label>
                      {t('maintenanceBilling.date')}
                      <input
                        type="date"
                        min={monthBounds(selectedMonthId).min}
                        max={monthBounds(selectedMonthId).max}
                        value={draft.date}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            date: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      {t('maintenanceBilling.property')}
                      <select
                        value={draft.propertyId}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            propertyId: event.target.value,
                          }))
                        }
                      >
                        <option value="">{t('maintenanceBilling.selectProperty')}</option>
                        {formPropertyOptions.map((property) => (
                          <option key={property.id} value={property.id}>
                            {getPropertyLabel(property)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
                <label>
                  {t('maintenanceBilling.provider')}
                  <select
                    value={draft.providerId}
                    onChange={(event) => {
                      const value = event.target.value
                      const selected = providers.find((item) => item.id === value)
                      setDraft((current) => ({
                        ...current,
                        providerId: value,
                        providerName: selected?.name ?? '',
                      }))
                    }}
                  >
                    <option value="">{t('maintenanceBilling.selectProvider')}</option>
                    {providers
                      .filter(
                        (provider) =>
                          provider.active || provider.id === draft.providerId,
                      )
                      .map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {t('maintenanceBilling.hours')}
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={draft.hours}
                    disabled={draft.hoursDisabled}
                    onChange={(event) => {
                      const hoursValue = event.target.value
                      const numeric = Number(String(hoursValue).replace(',', '.'))
                      setDraft((current) => ({
                        ...current,
                        hours: hoursValue,
                        hoursDisabled: false,
                        price:
                          Number.isFinite(numeric) && numeric > 0
                            ? String(roundMoney(numeric * hourlyCost))
                            : current.price,
                      }))
                    }}
                  />
                </label>
                <label>
                  {t('maintenanceBilling.price')}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.price}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        price: event.target.value,
                        hoursDisabled: true,
                        hours: '0',
                      }))
                    }
                  />
                </label>
                {draft.lineId ? (
                  <label>
                    {t('maintenanceBilling.billingStatus')}
                    <select
                      value={draft.billingStatus}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          billingStatus: asLineStatus(event.target.value),
                        }))
                      }
                    >
                      {MAINTENANCE_BILLING_LINE_STATUSES.filter(
                        (status) =>
                          draft.isManual ? status !== 'TO_ESTIMATE' : true,
                      ).map((status) => (
                        <option key={status} value={status}>
                          {lineStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
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
                onClick={() => void submitDraft()}
              >
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isMergeOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('maintenanceBilling.mergeTitle')}</h3>
                <p className="modal-subtitle">
                  {t('maintenanceBilling.mergeSubtitle', {
                    count: selectedLines.length,
                  })}
                </p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsMergeOpen(false)}
                aria-label={t('common.closeForm')}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="filters-grid">
                <label>
                  {t('maintenanceBilling.visitTitle')}
                  <input
                    type="text"
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {t('maintenanceBilling.date')}
                  <input
                    type="date"
                    min={monthBounds(selectedMonthId).min}
                    max={monthBounds(selectedMonthId).max}
                    value={draft.date}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        date: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {t('maintenanceBilling.property')}
                  <input
                    type="text"
                    value={
                      propertyById.get(draft.propertyId) || draft.propertyId
                    }
                    disabled
                  />
                </label>
                <label>
                  {t('maintenanceBilling.provider')}
                  <select
                    value={draft.providerId}
                    onChange={(event) => {
                      const value = event.target.value
                      const selected = providers.find((item) => item.id === value)
                      setDraft((current) => ({
                        ...current,
                        providerId: value,
                        providerName: selected?.name ?? '',
                      }))
                    }}
                  >
                    <option value="">{t('maintenanceBilling.selectProvider')}</option>
                    {providers
                      .filter(
                        (provider) =>
                          provider.active || provider.id === draft.providerId,
                      )
                      .map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {t('maintenanceBilling.hours')}
                  <input
                    type="number"
                    min="0"
                    step="0.25"
                    value={draft.hours}
                    disabled={draft.hoursDisabled}
                    onChange={(event) => {
                      const hoursValue = event.target.value
                      const numeric = Number(String(hoursValue).replace(',', '.'))
                      setDraft((current) => ({
                        ...current,
                        hours: hoursValue,
                        hoursDisabled: false,
                        price:
                          Number.isFinite(numeric) && numeric > 0
                            ? String(roundMoney(numeric * hourlyCost))
                            : current.price,
                      }))
                    }}
                  />
                </label>
                <label>
                  {t('maintenanceBilling.price')}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.price}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        price: event.target.value,
                        hoursDisabled: true,
                        hours: '0',
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
                onClick={() => setIsMergeOpen(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={isSaving}
                onClick={() => void submitMerge()}
              >
                {t('maintenanceBilling.confirmGroup')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {openVisitId ? (
        <VisitDetailModal
          visitId={openVisitId}
          getEndpoint={getEndpoint}
          propertyOptions={propertyOptions}
          onClose={() => setOpenVisitId('')}
          onVisitChanged={() => {
            void refreshMonth()
          }}
        />
      ) : null}
    </>
  )
}
