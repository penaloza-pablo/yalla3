import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CHECK_IN_TRACKER_STATUSES,
  resolveCheckInTrackerStatus,
  type CheckInTrackerStatus,
} from '../../amplify/functions/shared/check-in-tracker'
import { TableSkeleton } from '../design/Feedback'
import { YlIcon } from '../design/icons'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { fetchJson } from '../operations/api'
import {
  addDaysToDateString,
  formatDateOnlyLabel,
  getTodayMadrid,
} from '../operations/dateHelpers'
import { YallaSwitch } from './YallaSwitch'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  isMobileSearchOpen: boolean
  onToggleMobileSearch: () => void
}

type OpenVisit = {
  id: string
  kind: 'cleaning' | 'maintenance'
  scheduledDate: string
  status: string
  title: string
}

type TrackerRow = {
  id: string
  listingId: string
  guestName: string
  property: string
  checkInDate: string
  checkOutDate: string
  status: CheckInTrackerStatus
  accessGranted: boolean
  guestEntered: boolean
  openVisits: OpenVisit[]
}

type TrackerResponse = {
  date?: string
  items?: TrackerRow[]
  message?: string
}

const STATUS_TONE: Record<CheckInTrackerStatus, string> = {
  jobs_pending: 'status-warning',
  property_ready: 'status-neutral',
  access_granted: 'status-info',
  guest_entered: 'status-success',
}

const asRow = (item: Record<string, unknown>): TrackerRow => ({
  id: String(item.id ?? item.ReservationID ?? ''),
  listingId: String(item.listingId ?? ''),
  guestName: String(item.guestName ?? '—'),
  property: String(item.property ?? '—'),
  checkInDate: String(item.checkInDate ?? ''),
  checkOutDate: String(item.checkOutDate ?? ''),
  status: CHECK_IN_TRACKER_STATUSES.includes(
    item.status as CheckInTrackerStatus,
  )
    ? (item.status as CheckInTrackerStatus)
    : 'jobs_pending',
  accessGranted: item.accessGranted === true,
  guestEntered: item.guestEntered === true,
  openVisits: Array.isArray(item.openVisits)
    ? item.openVisits
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null
          }
          const visit = entry as Record<string, unknown>
          const kind = visit.kind === 'maintenance' ? 'maintenance' : 'cleaning'
          return {
            id: String(visit.id ?? ''),
            kind,
            scheduledDate: String(visit.scheduledDate ?? ''),
            status: String(visit.status ?? ''),
            title: String(visit.title ?? ''),
          }
        })
        .filter((visit): visit is OpenVisit => Boolean(visit?.id))
    : [],
})

const matchesSearch = (query: string, row: TrackerRow) => {
  const normalized = query.trim().toLowerCase()
  if (!normalized) {
    return true
  }
  return [row.guestName, row.property, row.status].some((value) =>
    value.toLowerCase().includes(normalized),
  )
}

export function CheckInTrackerView({
  getEndpoint,
  searchQuery,
  onSearchQueryChange,
  isMobileSearchOpen,
  onToggleMobileSearch,
}: Props) {
  const { t, i18n } = useTranslation()
  const endpoints = useMemo(
    () => ({
      getTracker: getEndpoint('getCheckInTrackerUrl'),
      upsertTracker: getEndpoint('upsertCheckInTrackerUrl'),
    }),
    [getEndpoint],
  )

  const [date, setDate] = useState(getTodayMadrid)
  const [rows, setRows] = useState<TrackerRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!endpoints.getTracker) {
      setError(t('checkInTracker.missingEndpoint'))
      setRows([])
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        setRows([])
        setError(t('checkInTracker.loadError'))
        return
      }
      const payload = await fetchJson<TrackerResponse>(
        `${endpoints.getTracker}?date=${encodeURIComponent(date)}`,
      )
      setRows((payload.items ?? []).map((item) => asRow(item as unknown as Record<string, unknown>)))
    } catch (loadError) {
      setRows([])
      setError(
        loadError instanceof Error && loadError.message
          ? loadError.message
          : t('checkInTracker.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [date, endpoints.getTracker, t])

  useEffect(() => {
    void load()
  }, [load])

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesSearch(searchQuery, row)),
    [rows, searchQuery],
  )

  const counts = useMemo(() => {
    const next = {
      jobs_pending: 0,
      property_ready: 0,
      access_granted: 0,
      guest_entered: 0,
    }
    for (const row of filteredRows) {
      next[row.status] += 1
    }
    return next
  }, [filteredRows])

  const saveFlags = async (
    row: TrackerRow,
    patch: { accessGranted?: boolean; guestEntered?: boolean },
  ) => {
    if (!endpoints.upsertTracker) {
      setError(t('checkInTracker.missingWrite'))
      return
    }
    setSavingId(row.id)
    setError(null)
    try {
      const payload = await fetchJson<{
        item?: { accessGranted?: boolean; guestEntered?: boolean }
      }>(endpoints.upsertTracker, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reservationId: row.id, ...patch }),
      })
      const accessGranted = payload.item?.accessGranted === true
      const guestEntered = payload.item?.guestEntered === true
      setRows((current) =>
        current.map((entry) => {
          if (entry.id !== row.id) {
            return entry
          }
          return {
            ...entry,
            accessGranted,
            guestEntered,
            status: resolveCheckInTrackerStatus(
              { accessGranted, guestEntered },
              entry.openVisits.length > 0,
            ),
          }
        }),
      )
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message
          ? saveError.message
          : t('checkInTracker.saveError'),
      )
    } finally {
      setSavingId(null)
    }
  }

  const dateLabel = formatDateOnlyLabel(date, i18n.language)
  const columnCount = 4

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('checkInTracker.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Check-in Tracker')}</h1>
          </div>
          <p className="subtitle">
            {t('checkInTracker.subtitle', { date: dateLabel })}
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
              placeholder={t('checkInTracker.search')}
              type="search"
              aria-label={t('checkInTracker.search')}
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
            />
            <div className="header-actions">
              <div className="btn-group operations-day-date-stepper">
                <button
                  type="button"
                  className="operations-day-nav-btn"
                  aria-label={t('operations.previousDay')}
                  onClick={() => setDate(addDaysToDateString(date, -1))}
                >
                  <YlIcon name="chevron.left" size={16} />
                </button>
                <label className="check-in-tracker-date">
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    aria-label={t('operations.chooseDate')}
                  />
                </label>
                <button
                  type="button"
                  className="operations-day-nav-btn"
                  aria-label={t('operations.nextDay')}
                  onClick={() => setDate(addDaysToDateString(date, 1))}
                >
                  <YlIcon name="chevron.right" size={16} />
                </button>
              </div>
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
                  <YlIcon name="xmark" size={16} />
                ) : (
                  <YlIcon name="magnifyingglass" size={16} />
                )}
              </button>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => void load()}
                disabled={isLoading}
                aria-label={t('common.refresh')}
              >
                <YlIcon name="arrow.clockwise" size={16} />
              </button>
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {error ? <p className="notice error">{error}</p> : null}

      <section className="summary-cards summary-cards-4">
        {CHECK_IN_TRACKER_STATUSES.map((status) => (
          <div className="card card-compact" key={status}>
            <p className="card-label">{t(`checkInTracker.status.${status}`)}</p>
            <p className="card-value">{isLoading ? '—' : counts[status]}</p>
          </div>
        ))}
      </section>

      <section className="card">
        {isLoading ? (
          <TableSkeleton rows={5} label={t('checkInTracker.loading')} />
        ) : (
          <div className="table-wrapper">
            <table className="data-table data-table-check-in-tracker">
              <thead>
                <tr>
                  <th>{t('common.guest')}</th>
                  <th>{t('common.property')}</th>
                  <th>{t('checkInTracker.state')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td className="table-empty" colSpan={columnCount}>
                      {rows.length === 0
                        ? t('checkInTracker.empty')
                        : t('checkInTracker.emptyFiltered')}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const jobsPending = row.status === 'jobs_pending'
                    const isSaving = savingId === row.id
                    const canToggleAccess =
                      !isSaving && (!jobsPending || row.accessGranted)
                    const canToggleGuest =
                      !isSaving &&
                      row.accessGranted &&
                      (!jobsPending || row.guestEntered)
                    const currentIndex = CHECK_IN_TRACKER_STATUSES.indexOf(
                      row.status,
                    )
                    return (
                      <tr key={row.id}>
                        <td data-label={t('common.guest')}>{row.guestName}</td>
                        <td data-label={t('common.property')}>{row.property}</td>
                        <td data-label={t('checkInTracker.state')}>
                          <div className="check-in-tracker-status">
                            <div
                              className="tracker-pipeline"
                              aria-hidden="true"
                            >
                              {CHECK_IN_TRACKER_STATUSES.map((status, index) => (
                                <span
                                  key={status}
                                  className={`tracker-step ${
                                    index < currentIndex
                                      ? 'is-done'
                                      : index === currentIndex
                                        ? 'is-current'
                                        : ''
                                  }`}
                                />
                              ))}
                            </div>
                            <span className={`status ${STATUS_TONE[row.status]}`}>
                              {t(`checkInTracker.status.${row.status}`)}
                            </span>
                            {row.openVisits.length > 0 ? (
                              <p className="card-meta">
                                {t('checkInTracker.openVisits', {
                                  count: row.openVisits.length,
                                })}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td data-label={t('common.actions')}>
                          <div className="check-in-tracker-actions">
                            <div className="plan-detail-control">
                              <YallaSwitch
                                on={row.accessGranted}
                                disabled={!canToggleAccess}
                                label={t('checkInTracker.markAccess')}
                                onToggle={() =>
                                  void saveFlags(row, {
                                    accessGranted: !row.accessGranted,
                                  })
                                }
                              />
                              <span>{t('checkInTracker.status.access_granted')}</span>
                            </div>
                            <div className="plan-detail-control">
                              <YallaSwitch
                                on={row.guestEntered}
                                disabled={!canToggleGuest}
                                label={t('checkInTracker.markEntered')}
                                onToggle={() =>
                                  void saveFlags(row, {
                                    guestEntered: !row.guestEntered,
                                  })
                                }
                              />
                              <span>{t('checkInTracker.status.guest_entered')}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
