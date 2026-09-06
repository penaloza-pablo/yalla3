import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { fetchJson } from '../operations/api'
import { addDaysToDateString, getTodayMadrid } from '../operations/dateHelpers'
import {
  filterBookingsPlannerPropertyOptions,
  getPropertyLabel,
} from '../operations/propertyHelpers'
import type { PropertyOption } from '../operations/types'
import {
  LINEN_OPTIONS,
  LINEN_VALUES,
  PLANNER_WINDOW_DAYS,
  type PlannerWarningCode,
  isCanonicalLinenValue,
  isEarlyCheckInEnabled,
} from '../../amplify/functions/shared/bookings-planner'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  isMobileSearchOpen: boolean
  onToggleMobileSearch: () => void
}

type PlanRow = {
  id: string
  listingId: string
  guestName: string
  property: string
  checkIn: string
  checkOut: string
  guests: string
  nights: string
  status: string
  linen: string
  giftCard: string
  giftCardOn: boolean
  access: string
  earlyCheckInOn: boolean
  warnings: PlannerWarningCode[]
}

type BookingsApiResponse = {
  items?: Record<string, unknown>[]
  nextCursor?: string | null
}

const LINEN_BADGE_CLASS: Record<string, string> = {
  [LINEN_VALUES.NA]: 'status-neutral',
  [LINEN_VALUES.NO]: 'status-info',
  [LINEN_VALUES.YES]: 'status-success',
}

const linenBadgeLabel = (
  value: string,
  t: (key: string) => string,
) => {
  if (value === LINEN_VALUES.NA) {
    return 'n/a'
  }
  if (value === LINEN_VALUES.NO) {
    return 'no'
  }
  if (value === LINEN_VALUES.YES) {
    return t('bookingsPlan.linenYes')
  }
  return t('bookingsPlan.linenUnknown')
}

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : value == null ? '' : String(value)

const asBoolean = (value: unknown, fallback = false) =>
  typeof value === 'boolean' ? value : fallback

const asWarnings = (value: unknown): PlannerWarningCode[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is PlannerWarningCode =>
          entry === 'linen_ask_guest' ||
          entry === 'gift_card_access_missing' ||
          entry === 'single_guest',
      )
    : []

const isConfirmed = (status: string) => status.toLowerCase() === 'confirmed'

const formatDayMonth = (value: string) => {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) {
    return value || '—'
  }
  return `${match[3]}/${match[2]}`
}

const matchesSearch = (query: string, row: PlanRow) => {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return true
  }
  return [
    row.guestName,
    row.property,
    row.access,
    row.giftCard,
    row.checkIn,
    row.checkOut,
    row.guests,
    formatDayMonth(row.checkIn),
    formatDayMonth(row.checkOut),
  ].some((value) => value.toLowerCase().includes(normalized))
}

const mapRow = (item: Record<string, unknown>): PlanRow => {
  const giftCard = asString(item.GiftCard ?? item.giftCard)
  const early = asString(item.EarlyCheckIn ?? item.earlyCheckIn)
  return {
    id: asString(item.ReservationID ?? item.id),
    listingId: asString(item.ListingID ?? item.listingId),
    guestName: asString(item.GuestName) || '—',
    property: asString(item.ListingNickname ?? item.ListingName) || '—',
    checkIn: asString(item.CheckInDate).slice(0, 10),
    checkOut: asString(item.CheckOutDate).slice(0, 10),
    guests: asString(item.Guests),
    nights: asString(item.Nights),
    status: asString(item.Status),
    linen: asString(item.Linen ?? item.linen),
    giftCard,
    giftCardOn: asBoolean(
      item.GiftCardOn ?? item.giftCardOn,
      Boolean(giftCard) && giftCard !== 'Sin tarjeta',
    ),
    access: asString(item.Access ?? item.access),
    earlyCheckInOn: asBoolean(
      item.EarlyCheckInOn ?? item.earlyCheckInOn,
      isEarlyCheckInEnabled(early),
    ),
    warnings: asWarnings(item.PlannerWarnings ?? item.warnings),
  }
}

const warningsForRow = (row: PlanRow): PlannerWarningCode[] => {
  if (isCanonicalLinenValue(row.linen) || row.warnings.includes('linen_ask_guest')) {
    return row.warnings
  }
  return [...row.warnings, 'linen_ask_guest']
}

const CheckIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
    <path
      d="M10 1.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zm3.3 5.7-4.2 5.1-2.2-2.2-1.4 1.4 3 3a1 1 0 0 0 1.5-.1l4.9-6-1.6-1.2z"
      fill="currentColor"
    />
  </svg>
)

const WarningIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
    <path
      d="M10 1.6 18.5 17H1.5L10 1.6zM9 8h2v4H9V8zm1 7.2A1.1 1.1 0 1 0 10 13a1.1 1.1 0 0 0 0 2.2z"
      fill="currentColor"
    />
  </svg>
)

const PlanStatusIcon = ({
  ok,
  label,
  onClick,
}: {
  ok: boolean
  label: string
  onClick?: () => void
}) => (
  <button
    type="button"
    className={`plan-status-icon ${ok ? 'is-ready' : 'is-warn'}`}
    aria-label={label}
    onClick={onClick}
  >
    {ok ? <CheckIcon /> : <WarningIcon />}
  </button>
)

const SwitchToggle = ({
  on,
  disabled,
  label,
  onToggle,
}: {
  on: boolean
  disabled?: boolean
  label: string
  onToggle: () => void
}) => (
  <button
    type="button"
    className={`yalla-switch ${on ? 'is-on' : ''}`}
    aria-pressed={on}
    aria-label={label}
    disabled={disabled}
    onClick={onToggle}
  >
    <span className="yalla-switch-knob" />
  </button>
)

const LinenBadgeSelect = ({
  value,
  disabled,
  open,
  onToggle,
  onSelect,
}: {
  value: string
  disabled?: boolean
  open: boolean
  onToggle: () => void
  onSelect: (linen: string) => void
}) => {
  const { t } = useTranslation()
  const className = LINEN_BADGE_CLASS[value] ?? 'status-warning'
  return (
    <div className="linen-badge-wrap">
      <button
        type="button"
        className={`status linen-badge ${className}`}
        disabled={disabled}
        aria-expanded={open}
        onClick={onToggle}
      >
        {linenBadgeLabel(value, t)}
      </button>
      {open ? (
        <div className="linen-badge-menu" role="listbox">
          {LINEN_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              className={`status linen-badge ${LINEN_BADGE_CLASS[option]} ${
                option === value ? 'is-selected' : ''
              }`}
              role="option"
              aria-selected={option === value}
              onClick={() => onSelect(option)}
            >
              {linenBadgeLabel(option, t)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function BookingsPlanView({
  getEndpoint,
  propertyOptions,
  searchQuery,
  onSearchQueryChange,
  isMobileSearchOpen,
  onToggleMobileSearch,
}: Props) {
  const { t } = useTranslation()
  const endpoints = useMemo(
    () => ({
      getBookings: getEndpoint(
        'getBookingsUrl',
        import.meta.env.VITE_GET_BOOKINGS_URL,
      ),
      getSettings: getEndpoint(
        'getBookingsPlannerSettingsUrl',
        import.meta.env.VITE_GET_BOOKINGS_PLANNER_SETTINGS_URL,
      ),
      upsertFields: getEndpoint(
        'upsertBookingPlannerFieldsUrl',
        import.meta.env.VITE_UPSERT_BOOKING_PLANNER_FIELDS_URL,
      ),
    }),
    [getEndpoint],
  )

  const properties = useMemo(
    () => filterBookingsPlannerPropertyOptions(propertyOptions),
    [propertyOptions],
  )

  const [rows, setRows] = useState<PlanRow[]>([])
  const [plannerEnabled, setPlannerEnabled] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accessDrafts, setAccessDrafts] = useState<Record<string, string>>({})
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [openLinenId, setOpenLinenId] = useState<string | null>(null)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [propertyIds, setPropertyIds] = useState<string[]>([])
  const [propertyDraft, setPropertyDraft] = useState<string[]>([])
  const accessInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const windowLabel = useMemo(() => {
    const today = getTodayMadrid()
    return `${formatDayMonth(today)} → ${formatDayMonth(
      addDaysToDateString(today, PLANNER_WINDOW_DAYS - 1),
    )}`
  }, [])

  const load = useCallback(async () => {
    if (!endpoints.getBookings) {
      setError(t('bookingsPlan.missingEndpoint'))
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const today = getTodayMadrid()
      const to = addDaysToDateString(today, PLANNER_WINDOW_DAYS - 1)
      const items: Record<string, unknown>[] = []
      let cursor: string | null = null
      do {
        const query = new URLSearchParams({
          checkInFrom: today,
          checkInTo: to,
          status: 'confirmed',
          limit: '200',
        })
        if (cursor) {
          query.set('cursor', cursor)
        }
        const payload: BookingsApiResponse = await fetchJson(
          `${endpoints.getBookings}?${query.toString()}`,
        )
        items.push(...(payload.items ?? []))
        cursor = payload.nextCursor ?? null
      } while (cursor)

      const nextRows = items
        .map(mapRow)
        .filter((row) => row.id && isConfirmed(row.status))
        .sort((left, right) => {
          if (left.checkIn !== right.checkIn) {
            return left.checkIn.localeCompare(right.checkIn)
          }
          return left.guestName.localeCompare(right.guestName)
        })
      setRows(nextRows)
      setAccessDrafts(
        Object.fromEntries(nextRows.map((row) => [row.id, row.access])),
      )

      if (endpoints.getSettings) {
        const settings = await fetchJson<{
          item?: { plannerEnabled?: boolean }
        }>(endpoints.getSettings)
        setPlannerEnabled(settings.item?.plannerEnabled === true)
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t('bookingsPlan.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [endpoints.getBookings, endpoints.getSettings, t])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!openLinenId) {
      return
    }
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('.linen-badge-wrap')) {
        setOpenLinenId(null)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [openLinenId])

  const saveFields = async (
    row: PlanRow,
    patch: {
      linen?: string
      giftCardOn?: boolean
      earlyCheckInOn?: boolean
      access?: string
    },
  ) => {
    if (!endpoints.upsertFields) {
      setError(t('bookingsPlan.missingWrite'))
      return
    }
    setSavingId(row.id)
    setError(null)
    try {
      const payload = await fetchJson<{
        item?: Record<string, unknown>
      }>(endpoints.upsertFields, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          reservationId: row.id,
          ...patch,
        }),
      })
      const next = payload.item
        ? mapRow({ ReservationID: row.id, ...payload.item })
        : row
      setRows((current) =>
        current.map((entry) =>
          entry.id === row.id
            ? {
                ...entry,
                ...next,
                id: row.id,
                listingId: row.listingId,
                guestName: row.guestName,
                property: row.property,
                checkIn: row.checkIn,
                checkOut: row.checkOut,
                guests: row.guests,
                nights: row.nights,
                status: row.status,
              }
            : entry,
        ),
      )
      if (patch.access !== undefined) {
        setAccessDrafts((current) => ({ ...current, [row.id]: next.access }))
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t('bookingsPlan.saveError'),
      )
    } finally {
      setSavingId(null)
    }
  }

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const expandAndFocusAccess = (row: PlanRow) => {
    setExpandedIds((current) => new Set(current).add(row.id))
    window.setTimeout(() => {
      accessInputRefs.current[row.id]?.focus()
    }, 0)
  }

  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (propertyIds.length > 0 && !propertyIds.includes(row.listingId)) {
          return false
        }
        return matchesSearch(searchQuery, row)
      }),
    [propertyIds, rows, searchQuery],
  )

  const warningCount = filteredRows.reduce(
    (sum, row) => sum + warningsForRow(row).length,
    0,
  )
  const canEdit = plannerEnabled
  const columnCount = 10

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('bookingsPlan.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Bookings Plan')}</h1>
          </div>
          <p className="subtitle">
            {t('bookingsPlan.subtitle', { range: windowLabel })}
          </p>
        </div>
        <MobileBodyPortal>
          <div
            className={`page-action-bar ${
              isMobileSearchOpen ? 'is-search-open' : ''
            }`}
          >
            <input
              className="search-input"
              placeholder={t('bookingsPlan.search')}
              type="search"
              aria-label={t('bookingsPlan.search')}
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
                className={`btn-ghost btn-filter ${
                  isFilterOpen || propertyIds.length > 0 ? 'is-active' : ''
                }`}
                type="button"
                aria-label={t('common.filters')}
                onClick={() => {
                  setPropertyDraft(propertyIds)
                  setIsFilterOpen(true)
                }}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  width="16"
                  height="16"
                >
                  <path
                    d="M3 4h14l-5.5 6.2V16l-3-1.5v-4.3L3 4z"
                    fill="currentColor"
                  />
                </svg>
                {propertyIds.length > 0 ? (
                  <span className="filter-badge">{propertyIds.length}</span>
                ) : null}
              </button>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => void load()}
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

      {plannerEnabled ? null : (
        <p className="notice">{t('bookingsPlan.plannerOff')}</p>
      )}
      {error ? <p className="notice error">{error}</p> : null}

      <section className="summary-cards">
        <div className="card card-compact">
          <p className="card-label">{t('bookingsPlan.visibleBookings')}</p>
          <p className="card-value">{isLoading ? '—' : filteredRows.length}</p>
          <p className="card-meta">{windowLabel}</p>
        </div>
        <div className="card card-compact">
          <p className="card-label">{t('bookingsPlan.warningsCard')}</p>
          <p className="card-value">{isLoading ? '—' : warningCount}</p>
          <p className="card-meta">{t('bookingsPlan.warningsCardMeta')}</p>
        </div>
      </section>

      <section className="card">
        <div className="table-wrapper">
          <table className="data-table data-table-bookings-plan">
            <thead>
              <tr>
                <th>{t('common.checkIn')}</th>
                <th>{t('common.guest')}</th>
                <th>{t('common.property')}</th>
                <th>{t('bookingsPlan.guests')}</th>
                <th>{t('bookingsPlan.linen')}</th>
                <th>{t('bookingsPlan.giftCard')}</th>
                <th>{t('bookingsPlan.access')}</th>
                <th>{t('bookingsPlan.earlyCheckIn')}</th>
                <th>{t('bookingsPlan.warnings')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={columnCount}>{t('bookingsPlan.loading')}</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={columnCount}>
                    {rows.length === 0
                      ? t('bookingsPlan.empty')
                      : t('bookingsPlan.emptyFiltered')}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const isExpanded = expandedIds.has(row.id)
                  const isSaving = savingId === row.id
                  const linenReady = isCanonicalLinenValue(row.linen)
                  const giftReady = Boolean(row.giftCard.trim())
                  const accessReady = Boolean(row.access.trim())
                  const displayWarnings = warningsForRow(row)
                  return (
                    <Fragment key={row.id}>
                      <tr>
                        <td>{formatDayMonth(row.checkIn)}</td>
                        <td>{row.guestName}</td>
                        <td>{row.property}</td>
                        <td>{row.guests || '—'}</td>
                        <td>
                          <PlanStatusIcon
                            ok={linenReady}
                            label={
                              linenReady
                                ? t('bookingsPlan.statusReady')
                                : t('bookingsPlan.statusNeedsReview')
                            }
                            onClick={() => toggleExpanded(row.id)}
                          />
                        </td>
                        <td>
                          <PlanStatusIcon
                            ok={giftReady}
                            label={
                              giftReady
                                ? t('bookingsPlan.statusReady')
                                : t('bookingsPlan.statusNeedsReview')
                            }
                            onClick={() => toggleExpanded(row.id)}
                          />
                        </td>
                        <td>
                          <PlanStatusIcon
                            ok={accessReady}
                            label={
                              accessReady
                                ? t('bookingsPlan.statusReady')
                                : t('bookingsPlan.statusNeedsReview')
                            }
                            onClick={() => {
                              if (!accessReady) {
                                expandAndFocusAccess(row)
                                return
                              }
                              toggleExpanded(row.id)
                            }}
                          />
                        </td>
                        <td>
                          <SwitchToggle
                            on={row.earlyCheckInOn}
                            disabled={!canEdit || isSaving}
                            label={t('bookingsPlan.earlyCheckIn')}
                            onToggle={() =>
                              void saveFields(row, {
                                earlyCheckInOn: !row.earlyCheckInOn,
                              })
                            }
                          />
                        </td>
                        <td>
                          {displayWarnings.length ? (
                            <span className="status status-warning">
                              {displayWarnings.length}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button
                              className="btn-icon btn-icon-ghost"
                              type="button"
                              onClick={() => toggleExpanded(row.id)}
                              aria-expanded={isExpanded}
                              aria-label={t('common.toggleDetails')}
                            >
                              {isExpanded ? '▾' : '▸'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="detail-row">
                          <td colSpan={columnCount}>
                            <div className="detail-grid">
                              <div>
                                <p className="detail-label">
                                  {t('common.checkOut')}
                                </p>
                                <p className="detail-value">
                                  {formatDayMonth(row.checkOut)}
                                </p>
                              </div>
                              <div>
                                <p className="detail-label">
                                  {t('bookingsPlan.linen')}
                                </p>
                                <LinenBadgeSelect
                                  value={
                                    isCanonicalLinenValue(row.linen)
                                      ? row.linen
                                      : ''
                                  }
                                  disabled={!canEdit || isSaving}
                                  open={openLinenId === row.id}
                                  onToggle={() =>
                                    setOpenLinenId((current) =>
                                      current === row.id ? null : row.id,
                                    )
                                  }
                                  onSelect={(linen) => {
                                    setOpenLinenId(null)
                                    void saveFields(row, { linen })
                                  }}
                                />
                              </div>
                              <div>
                                <p className="detail-label">
                                  {t('bookingsPlan.giftCard')}
                                </p>
                                <div className="plan-detail-control">
                                  <SwitchToggle
                                    on={row.giftCardOn}
                                    disabled={!canEdit || isSaving}
                                    label={t('bookingsPlan.giftCard')}
                                    onToggle={() =>
                                      void saveFields(row, {
                                        giftCardOn: !row.giftCardOn,
                                      })
                                    }
                                  />
                                  <p className="detail-value">
                                    {row.giftCard.trim() || '—'}
                                  </p>
                                </div>
                              </div>
                              <div className="detail-span-2">
                                <p className="detail-label">
                                  {t('bookingsPlan.access')}
                                </p>
                                {canEdit ? (
                                  <input
                                    ref={(node) => {
                                      accessInputRefs.current[row.id] = node
                                    }}
                                    value={accessDrafts[row.id] ?? row.access}
                                    disabled={isSaving}
                                    onChange={(event) =>
                                      setAccessDrafts((current) => ({
                                        ...current,
                                        [row.id]: event.target.value,
                                      }))
                                    }
                                    onBlur={(event) => {
                                      const value = event.target.value.trim()
                                      if (value !== row.access) {
                                        void saveFields(row, { access: value })
                                      }
                                    }}
                                  />
                                ) : (
                                  <p className="detail-value">
                                    {row.access.trim() || '—'}
                                  </p>
                                )}
                              </div>
                              {displayWarnings.length ? (
                                <div className="detail-span">
                                  <p className="detail-label">
                                    {t('bookingsPlan.warnings')}
                                  </p>
                                  <ul className="planner-warning-list">
                                    {displayWarnings.map((code) => (
                                      <li key={code}>
                                        {t(`bookingsPlan.warning.${code}`)}
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

      {isFilterOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-scrollable">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('common.filters')}</h3>
                <p className="modal-subtitle">{t('bookingsPlan.filterSubtitle')}</p>
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
                  <p className="filter-title">{t('common.property')}</p>
                  <div className="filter-options filter-options-scroll">
                    {properties.map((property) => (
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
    </>
  )
}
