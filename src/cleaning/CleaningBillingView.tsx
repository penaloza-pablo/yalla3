import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { PropertyGroupChips } from './PropertyGroupChips'
import { BILLING_PROPERTY_GROUP_CHIPS, billingPropertyGroupOf } from './propertyGroups'
import {
  OTHER_CLEANING_TYPE_ID,
  type CleaningBillingLine,
  type CleaningBillingMonth,
  type CleaningBillingPropertyGroup,
  type CleaningBillingWarning,
  type PropertyCleaningDetailsRecord,
  type PropertyCleaningType,
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
  date: string
  propertyId: string
  cleaningTypeId: string
  cleaningTypeName: string
  price: string
  isOther: boolean
}

const emptyDraft = (monthId: string): LineDraft => ({
  lineId: '',
  visitId: '',
  isManual: true,
  date: `${monthId}-01`,
  propertyId: '',
  cleaningTypeId: '',
  cleaningTypeName: '',
  price: '',
  isOther: false,
})

const mapMonth = (item: Record<string, unknown>): CleaningBillingMonth => ({
  id: String(item.id ?? ''),
  status: (String(item.status ?? 'CURRENT') as CleaningBillingMonth['status']),
  lineCount: Number(item.lineCount ?? 0),
  completedCount: Number(item.completedCount ?? 0),
  warningCount: Number(item.warningCount ?? 0),
  total: Number(item.total ?? 0),
  canClose: Boolean(item.canClose),
  canReopen: Boolean(item.canReopen),
  canEdit: item.canEdit !== false,
  closedAt: typeof item.closedAt === 'string' ? item.closedAt : undefined,
})

const mapLine = (item: Record<string, unknown>): CleaningBillingLine => ({
  id: String(item.id ?? ''),
  source: item.source === 'manual' ? 'manual' : 'visit',
  visitId: String(item.visitId ?? ''),
  propertyId: String(item.propertyId ?? ''),
  property: String(item.property ?? item.propertyId ?? ''),
  date: String(item.date ?? '').slice(0, 10),
  status: String(item.status ?? ''),
  cleaningTypeId: String(item.cleaningTypeId ?? ''),
  cleaningTypeName: String(item.cleaningTypeName ?? ''),
  price:
    item.price === null || item.price === undefined ? null : Number(item.price),
  isOther: Boolean(item.isOther),
  isManual: Boolean(item.isManual) || item.source === 'manual',
  warnings: Array.isArray(item.warnings)
    ? (item.warnings as CleaningBillingWarning[])
    : [],
  cleaningTypes: Array.isArray(item.cleaningTypes)
    ? (item.cleaningTypes as PropertyCleaningType[])
    : [],
})

const monthBounds = (monthId: string) => {
  const [year, month] = monthId.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return {
    min: `${monthId}-01`,
    max: `${monthId}-${String(lastDay).padStart(2, '0')}`,
  }
}

export function CleaningBillingView({
  getEndpoint,
  propertyOptions,
  isSummaryInfoOpen,
  onToggleSummaryInfo,
}: Props) {
  const { t, i18n } = useTranslation()
  const endpoints = useMemo(
    () => ({
      getBilling: getEndpoint(
        'getCleaningBillingUrl',
        import.meta.env.VITE_GET_CLEANING_BILLING_URL,
      ),
      upsertBilling: getEndpoint(
        'upsertCleaningBillingUrl',
        import.meta.env.VITE_UPSERT_CLEANING_BILLING_URL,
      ),
      getDetails: getEndpoint(
        'getPropertyCleaningDetailsUrl',
        import.meta.env.VITE_GET_PROPERTY_CLEANING_DETAILS_URL,
      ),
      exportBilling: getEndpoint(
        'exportCleaningBillingUrl',
        import.meta.env.VITE_EXPORT_CLEANING_BILLING_URL,
      ),
    }),
    [getEndpoint],
  )

  const [months, setMonths] = useState<CleaningBillingMonth[]>([])
  const [selectedMonthId, setSelectedMonthId] = useState('')
  const [month, setMonth] = useState<CleaningBillingMonth | null>(null)
  const [lines, setLines] = useState<CleaningBillingLine[]>([])
  const [details, setDetails] = useState<PropertyCleaningDetailsRecord[]>([])
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
  const detailsByPropertyId = useMemo(
    () => new Map(details.map((item) => [item.propertyId, item])),
    [details],
  )

  const loadMonths = useCallback(async () => {
    if (!endpoints.getBilling) {
      setError(t('cleaningBilling.missingEndpoint'))
      return
    }
    const payload = await fetchJson<{ months?: Record<string, unknown>[] }>(
      endpoints.getBilling,
    )
    setMonths((payload.months ?? []).map(mapMonth))
  }, [endpoints.getBilling, t])

  const loadMonth = useCallback(
    async (monthId: string) => {
      if (!endpoints.getBilling || !monthId) {
        return
      }
      const payload = await fetchJson<{
        month?: Record<string, unknown>
        lines?: Record<string, unknown>[]
      }>(`${endpoints.getBilling}?month=${encodeURIComponent(monthId)}`)
      setMonth(payload.month ? mapMonth(payload.month) : null)
      setLines((payload.lines ?? []).map(mapLine))
    },
    [endpoints.getBilling],
  )

  const loadDetails = useCallback(async () => {
    if (!endpoints.getDetails) {
      return
    }
    const payload = await fetchJson<{ items?: PropertyCleaningDetailsRecord[] }>(
      endpoints.getDetails,
    )
    setDetails(payload.items ?? [])
  }, [endpoints.getDetails])

  const refreshList = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      await loadMonths()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningBilling.loadError'),
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
      await Promise.all([loadMonth(selectedMonthId), loadDetails()])
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningBilling.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [loadDetails, loadMonth, selectedMonthId, t])

  useEffect(() => {
    if (selectedMonthId) {
      void refreshMonth()
      return
    }
    void refreshList()
  }, [refreshList, refreshMonth, selectedMonthId])

  const save = async (body: Record<string, unknown>) => {
    if (!endpoints.upsertBilling) {
      setError(t('cleaningBilling.missingWrite'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      const payload = await fetchJson<{
        month?: Record<string, unknown>
        lines?: Record<string, unknown>[]
      }>(endpoints.upsertBilling, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      setMonth(payload.month ? mapMonth(payload.month) : null)
      setLines((payload.lines ?? []).map(mapLine))
      setMessage(t('cleaningBilling.saved'))
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningBilling.saveError'),
      )
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
    .filter((line) => line.warnings.length === 0)
    .reduce((sum, line) => sum + (line.price ?? 0), 0)

  const draftTypes: PropertyCleaningType[] = draft.visitId
    ? lines.find((line) => line.id === draft.lineId)?.cleaningTypes ?? []
    : detailsByPropertyId.get(draft.propertyId)?.cleaningTypes ?? []

  const formatMonthLabel = (monthId: string) => {
    const [year, month] = monthId.split('-').map(Number)
    return new Intl.DateTimeFormat(
      i18n.language.startsWith('es') ? 'es-ES' : 'en-GB',
      { month: 'long', year: 'numeric', timeZone: 'UTC' },
    ).format(new Date(Date.UTC(year, month - 1, 1)))
  }

  const exportClosedMonth = async (scope: 'filtered' | 'all') => {
    if (!selectedMonthId || month?.status !== 'CLOSED') {
      return false
    }
    if (!endpoints.exportBilling) {
      setError(t('cleaningBilling.missingExport'))
      return false
    }
    setIsExporting(true)
    setError('')
    try {
      const sourceLines = scope === 'filtered' ? filteredLines : lines
      const headers = [
        t('cleaningBilling.property'),
        t('cleaningBilling.date'),
        t('cleaningBilling.visitStatus'),
        t('cleaningBilling.cleaningType'),
        t('cleaningBilling.price'),
        t('cleaningBilling.source'),
      ]
      const rows = sourceLines.map((line) => ({
        [t('cleaningBilling.property')]:
          propertyById.get(line.propertyId) || line.property,
        [t('cleaningBilling.date')]: line.date,
        [t('cleaningBilling.visitStatus')]: line.isManual
          ? t('cleaningBilling.manualStatus')
          : line.status,
        [t('cleaningBilling.cleaningType')]: line.cleaningTypeName || '',
        [t('cleaningBilling.price')]: line.price ?? '',
        [t('cleaningBilling.source')]: line.isManual
          ? t('cleaningBilling.sourceManual')
          : t('cleaningBilling.sourceVisit'),
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
        let message = errorText || t('cleaningBilling.exportError')
        try {
          const parsed = JSON.parse(errorText) as { message?: string }
          if (parsed.message) {
            message = parsed.message
          }
        } catch {
          // Keep the raw response text when it is not JSON.
        }
        throw new Error(message)
      }
      await downloadFromResponse(
        response,
        `cleaning-billing-${selectedMonthId}.xlsx`,
      )
      return true
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : t('cleaningBilling.exportError'),
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
    setDraft({ ...emptyDraft(selectedMonthId), date: bounds.min })
    setIsFormOpen(true)
  }

  const openEdit = (line: CleaningBillingLine) => {
    setDraft({
      lineId: line.id,
      visitId: line.visitId,
      isManual: line.isManual,
      date: line.date,
      propertyId: line.propertyId,
      cleaningTypeId: line.isOther ? OTHER_CLEANING_TYPE_ID : line.cleaningTypeId,
      cleaningTypeName: line.cleaningTypeName,
      price: line.price === null ? '' : String(line.price),
      isOther: line.isOther,
    })
    setIsFormOpen(true)
  }

  const submitDraft = async () => {
    if (!selectedMonthId) {
      return
    }
    const isOther =
      draft.isOther || draft.cleaningTypeId === OTHER_CLEANING_TYPE_ID
    const cleaningTypeName = isOther
      ? draft.cleaningTypeName.trim()
      : draftTypes.find((item) => item.id === draft.cleaningTypeId)?.name ||
        draft.cleaningTypeName.trim()
    const price = Number(draft.price)
    if (!cleaningTypeName || !Number.isFinite(price)) {
      setError(t('cleaningBilling.lineRequired'))
      return
    }
    if (draft.isManual && !draft.propertyId) {
      setError(t('cleaningBilling.propertyRequired'))
      return
    }
    await save({
      month: selectedMonthId,
      action: draft.isManual
        ? draft.lineId
          ? 'update-manual'
          : 'add-manual'
        : 'override',
      visitId: draft.visitId || undefined,
      lineId: draft.lineId || undefined,
      date: draft.date,
      propertyId: draft.propertyId,
      property: propertyById.get(draft.propertyId) || draft.propertyId,
      cleaningTypeId: isOther ? OTHER_CLEANING_TYPE_ID : draft.cleaningTypeId,
      cleaningTypeName,
      price,
      isOther,
    })
    setIsFormOpen(false)
  }

  const statusLabel = (status: CleaningBillingMonth['status']) => {
    if (status === 'CURRENT') return t('cleaningBilling.statusCurrent')
    if (status === 'PENDING_TO_CLOSE') return t('cleaningBilling.statusPending')
    return t('cleaningBilling.statusClosed')
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('cleaningBilling.eyebrow')}</p>
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
                : t('pages.Cleaning Billing')}
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
              ? t('cleaningBilling.monthSubtitle')
              : t('cleaningBilling.subtitle')}
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
                    onClick={() => setIsExportOpen(true)}
                    disabled={month?.status !== 'CLOSED' || isExporting}
                    aria-label={t('common.export')}
                    title={
                      month?.status === 'CLOSED'
                        ? t('common.export')
                        : t('cleaningBilling.exportClosedOnly')
                    }
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
                  {month?.canEdit ? (
                    <button
                      className="btn-ghost"
                      type="button"
                      onClick={openCreate}
                      aria-label={t('cleaningBilling.addManual')}
                    >
                      <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
                        <path d="M9 4h2v5h5v2h-5v5H9v-5H4V9h5V4z" fill="currentColor" />
                      </svg>
                    </button>
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
            <p className="card-label">{t('cleaningBilling.status')}</p>
            <p className="card-value">{statusLabel(month.status)}</p>
            <p className="card-meta">{t('cleaningBilling.statusMeta')}</p>
          </div>
          <div className="card card-compact">
            <p className="card-label">{t('cleaningBilling.totalCard')}</p>
            <p className="card-value">{money.format(filteredTotal)}</p>
            <p className="card-meta">{t('cleaningBilling.totalCardMeta')}</p>
          </div>
          <div className="card card-compact">
            <p className="card-label">{t('cleaningBilling.warningsCard')}</p>
            <p className="card-value">{month.warningCount}</p>
            <p className="card-meta">{t('cleaningBilling.warningsCardMeta')}</p>
          </div>
        </section>
      ) : (
        <section className={`summary-cards ${isSummaryInfoOpen ? 'is-open' : ''}`}>
          <div className="card card-compact">
            <p className="card-label">{t('cleaningBilling.monthsCard')}</p>
            <p className="card-value">{isLoading ? '—' : months.length}</p>
            <p className="card-meta">{t('cleaningBilling.monthsCardMeta')}</p>
          </div>
          <div className="card card-compact">
            <p className="card-label">{t('cleaningBilling.pendingCard')}</p>
            <p className="card-value">
              {isLoading
                ? '—'
                : months.filter((item) => item.status === 'PENDING_TO_CLOSE').length}
            </p>
            <p className="card-meta">{t('cleaningBilling.pendingCardMeta')}</p>
          </div>
        </section>
      )}

      {selectedMonthId ? (
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{t('cleaningBilling.linesTitle')}</h2>
              <p className="card-subtitle">{t('cleaningBilling.linesSubtitle')}</p>
            </div>
            <div className="table-actions">
              {month?.canClose ? (
                <button
                  className="btn-primary"
                  type="button"
                  disabled={isSaving}
                  onClick={() => {
                    if (window.confirm(t('cleaningBilling.closeConfirm'))) {
                      void save({ month: selectedMonthId, action: 'close' })
                    }
                  }}
                >
                  {t('cleaningBilling.close')}
                </button>
              ) : null}
              {month?.canReopen ? (
                <button
                  className="btn-secondary"
                  type="button"
                  disabled={isSaving}
                  onClick={() => void save({ month: selectedMonthId, action: 'reopen' })}
                >
                  {t('cleaningBilling.reopen')}
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
            <table className="data-table data-table-cleaning-billing">
              <thead>
                <tr>
                  <th>{t('cleaningBilling.property')}</th>
                  <th>{t('cleaningBilling.date')}</th>
                  <th>{t('cleaningBilling.visitStatus')}</th>
                  <th>{t('cleaningBilling.cleaningType')}</th>
                  <th>{t('cleaningBilling.price')}</th>
                  <th>{t('cleaningBilling.source')}</th>
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
                    <td colSpan={7}>{t('cleaningBilling.emptyLines')}</td>
                  </tr>
                ) : (
                  filteredLines.map((line) => (
                    <tr
                      key={line.id}
                      className={line.warnings.length ? 'billing-warning-row' : ''}
                    >
                      <td>
                        {line.visitId ? (
                          <button
                            type="button"
                            className="cleaning-visit-title-btn"
                            aria-label={t('cleaningPlan.openVisit')}
                            onClick={() => setOpenVisitId(line.visitId)}
                          >
                            {propertyById.get(line.propertyId) || line.property}
                          </button>
                        ) : (
                          propertyById.get(line.propertyId) || line.property
                        )}
                        {line.warnings.length > 0 ? (
                          <p className="card-meta billing-warning-text">
                            {line.warnings
                              .map((warning) => t(`cleaningBilling.warning.${warning}`))
                              .join(' · ')}
                          </p>
                        ) : null}
                      </td>
                      <td>{formatDateOnlyLabel(line.date, i18n.language)}</td>
                      <td>{line.isManual ? t('cleaningBilling.manualStatus') : line.status}</td>
                      <td>{line.cleaningTypeName || '—'}</td>
                      <td>
                        {line.price === null ? '—' : money.format(line.price)}
                      </td>
                      <td>
                        {line.isManual
                          ? t('cleaningBilling.sourceManual')
                          : t('cleaningBilling.sourceVisit')}
                      </td>
                      <td>
                        {month?.canEdit ? (
                          <div className="table-actions">
                            <button
                              className="btn-secondary"
                              type="button"
                              onClick={() => openEdit(line)}
                            >
                              {t('cleaningSettings.edit')}
                            </button>
                            {line.isManual ? (
                              <button
                                className="btn-secondary"
                                type="button"
                                disabled={isSaving}
                                onClick={() => {
                                  if (window.confirm(t('cleaningBilling.deleteConfirm'))) {
                                    void save({
                                      month: selectedMonthId,
                                      action: 'delete-manual',
                                      lineId: line.id,
                                    })
                                  }
                                }}
                              >
                                {t('common.delete')}
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{t('cleaningBilling.cardTitle')}</h2>
              <p className="card-subtitle">{t('cleaningBilling.cardSubtitle')}</p>
            </div>
          </div>
          <div className="table-wrapper">
            <table className="data-table data-table-cleaning-billing-months">
              <thead>
                <tr>
                  <th>{t('cleaningBilling.month')}</th>
                  <th>{t('cleaningBilling.status')}</th>
                  <th>{t('cleaningBilling.lines')}</th>
                  <th>{t('cleaningBilling.warnings')}</th>
                  <th>{t('cleaningBilling.total')}</th>
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
                    <td colSpan={6}>{t('cleaningBilling.empty')}</td>
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
                          {t('cleaningBilling.open')}
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
                <p className="modal-subtitle">{t('cleaningBilling.filterSubtitle')}</p>
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
                <p className="filter-title">{t('cleaningBilling.property')}</p>
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
                  {draft.lineId
                    ? t('cleaningBilling.editLine')
                    : t('cleaningBilling.addManual')}
                </h3>
                <p className="modal-subtitle">{t('cleaningBilling.formSubtitle')}</p>
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
                {draft.isManual ? (
                  <>
                    <label>
                      {t('cleaningBilling.date')}
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
                      {t('cleaningBilling.property')}
                      <select
                        value={draft.propertyId}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            propertyId: event.target.value,
                            cleaningTypeId: '',
                            cleaningTypeName: '',
                            isOther: false,
                          }))
                        }
                      >
                        <option value="">{t('cleaningBilling.selectProperty')}</option>
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
                  {t('cleaningBilling.cleaningType')}
                  <select
                    value={
                      draft.isOther ? OTHER_CLEANING_TYPE_ID : draft.cleaningTypeId
                    }
                    onChange={(event) => {
                      const value = event.target.value
                      const isOther = value === OTHER_CLEANING_TYPE_ID
                      const selected = draftTypes.find((item) => item.id === value)
                      setDraft((current) => ({
                        ...current,
                        cleaningTypeId: value,
                        isOther,
                        cleaningTypeName: isOther ? current.cleaningTypeName : selected?.name ?? '',
                        price:
                          isOther || !selected
                            ? current.price
                            : String(selected.price),
                      }))
                    }}
                  >
                    <option value="">{t('cleaningBilling.selectType')}</option>
                    {draftTypes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                    <option value={OTHER_CLEANING_TYPE_ID}>
                      {t('cleaningBilling.otherType')}
                    </option>
                  </select>
                </label>
                {draft.isOther ? (
                  <label>
                    {t('cleaningBilling.otherTypeName')}
                    <input
                      type="text"
                      value={draft.cleaningTypeName}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          cleaningTypeName: event.target.value,
                        }))
                      }
                    />
                  </label>
                ) : null}
                <label>
                  {t('cleaningBilling.price')}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.price}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        price: event.target.value,
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
                onClick={() => void submitDraft()}
              >
                {t('common.save')}
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
