import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { addDaysToDateString } from './dateHelpers'
import { getPropertyLabel } from './propertyHelpers'
import {
  getMtlGroupLabel,
  getBookingsForPropertyIds,
  getVisitsForPropertyIds,
  rowHasBookings,
  rowHasVisits,
  type MtlDisplayRow,
} from './mtlPropertyHelpers'
import {
  BOOKING_CHECK_OUT_END,
  BOOKING_DURATION_MINUTES,
  canShiftDayWindowEarlier,
  canShiftDayWindowLater,
  clampCheckInLayout,
  clipVisitToDayWindow,
  DAY_MIN_DURATION_MINUTES,
  DAY_VIEW_DEFAULT_START_MINUTES,
  DAY_VIEW_PAN_STEP_MINUTES,
  DAY_VIEW_SPAN_MINUTES,
  EARLY_CHECK_IN_DURATION_MINUTES,
  formatAgendaDayLabel,
  formatMinutesAsTime,
  getDayTimelineHourMarks,
  getDayTimelineWindow,
  getDayWindowOverflow,
  getVisitTimeRange,
  isTerminalVisit,
  minutesToPositionPercent,
  positionPercentToMinutes,
  resolveCheckInLayout,
  shiftDayWindowStart,
  snapToDayGrid,
  type DayTimelineWindow,
} from './operationsViewHelpers'
import {
  readDayCheckInLayout,
  writeDayCheckInLayout,
  type StoredCheckInLayout,
} from './dayCheckInLayoutStore'
import { getTeamBlockStyle } from './teamColors'
import {
  buildDayTimelineVisits,
  dayVisitExpandsOverlapOnClick,
  formatVisitBarTitle,
  formatVisitSummaryLine,
  layoutDayTimelineVisits,
  pointerHitsCollapsedVisitOverlap,
  visitBlockTop,
  type DayTimelineVisit,
} from './visitOverlapLayout'
import type { VisitRecord } from './types'

type DragMode = 'move' | 'resize-start' | 'resize-end'

type ActiveDrag = {
  visitId: string
  mode: DragMode
  startMinutes: number
  endMinutes: number
  pointerStartX: number
  trackWidth: number
}

export type DayBookingEvent = {
  id: string
  kind: 'check-in' | 'check-out'
  propertyId: string
  reservationId?: string
  guestName: string
  guests?: string
  nights?: string
  giftCard?: string
  linen?: string
  earlyCheckIn?: boolean
  checkInStartMinutes?: number
  earlyLeadMinutes?: number
}

type Props = {
  dayViewDate: string
  displayRows: MtlDisplayRow[]
  visits: VisitRecord[]
  bookings: DayBookingEvent[]
  propertyById: Map<string, string>
  teamById: Map<string, string>
  syncingVisitIds: Set<string>
  onDayDateChange: (date: string) => void
  onVisitClick: (visitId: string) => void
  onVisitTimeChange: (
    visitId: string,
    scheduledStartTime: string,
    scheduledEndTime: string,
  ) => void
  onEarlyCheckInChange?: (booking: DayBookingEvent, enabled: boolean) => void
}

type DayTableRow = {
  key: string
  propertyLabel: string
  propertyVisits: VisitRecord[]
  propertyBookings: DayBookingEvent[]
  showRoomLabel: boolean
  isChildRow: boolean
  canExpand: boolean
  isExpanded: boolean
  mtlPrincipalId?: string
}

const CLICK_THRESHOLD_PX = 4

export function OperationsDayView({
  dayViewDate,
  displayRows,
  visits,
  bookings,
  propertyById,
  teamById,
  syncingVisitIds,
  onDayDateChange,
  onVisitClick,
  onVisitTimeChange,
  onEarlyCheckInChange,
}: Props) {
  const { t } = useTranslation()
  const [expandedMtlIds, setExpandedMtlIds] = useState<Set<string>>(new Set())
  const [selectedCheckIn, setSelectedCheckIn] = useState<DayBookingEvent | null>(
    null,
  )
  const [windowStartMinutes, setWindowStartMinutes] = useState(
    DAY_VIEW_DEFAULT_START_MINUTES,
  )
  const [layoutEpoch, setLayoutEpoch] = useState(0)
  const bookingsWithLayout = useMemo(
    () =>
      bookings.map((booking) => {
        if (booking.kind !== 'check-in') {
          return booking
        }
        const stored = readDayCheckInLayout(dayViewDate, booking.id)
        const resolved = resolveCheckInLayout({ ...booking, ...stored })
        return {
          ...booking,
          ...resolved,
          earlyLeadMinutes: booking.earlyCheckIn
            ? resolved.earlyLeadMinutes || EARLY_CHECK_IN_DURATION_MINUTES
            : 0,
        }
      }),
    [bookings, dayViewDate, layoutEpoch],
  )
  const handleCheckInLayoutChange = useCallback(
    (booking: DayBookingEvent, layout: StoredCheckInLayout) => {
      const previous = resolveCheckInLayout({
        ...booking,
        ...readDayCheckInLayout(dayViewDate, booking.id),
      })
      writeDayCheckInLayout(dayViewDate, booking.id, layout)
      setLayoutEpoch((value) => value + 1)
      const wasOn = previous.earlyLeadMinutes > 0
      const nowOn = layout.earlyLeadMinutes > 0
      if (wasOn !== nowOn) {
        onEarlyCheckInChange?.(booking, nowOn)
      }
    },
    [dayViewDate, onEarlyCheckInChange],
  )

  useEffect(() => {
    setSelectedCheckIn(null)
  }, [dayViewDate])
  const timelineWindow = useMemo(
    () => getDayTimelineWindow(windowStartMinutes),
    [windowStartMinutes],
  )
  const hourMarks = useMemo(
    () => getDayTimelineHourMarks(timelineWindow),
    [timelineWindow],
  )
  const windowOverflow = useMemo(
    () => getDayWindowOverflow(visits, timelineWindow, bookingsWithLayout),
    [visits, bookingsWithLayout, timelineWindow],
  )
  const canShiftEarlier = canShiftDayWindowEarlier(windowStartMinutes)
  const canShiftLater = canShiftDayWindowLater(windowStartMinutes)

  useEffect(() => {
    setWindowStartMinutes(DAY_VIEW_DEFAULT_START_MINUTES)
  }, [dayViewDate])

  const shiftTimelineWindow = (deltaMinutes: number) => {
    setWindowStartMinutes((current) => shiftDayWindowStart(current, deltaMinutes))
  }

  const visibleRows = displayRows.filter(
    (row) => rowHasVisits(row, visits) || rowHasBookings(row, bookings),
  )

  const tableRows = useMemo(() => {
    const rows: DayTableRow[] = []

    visibleRows.forEach((row) => {
      if (row.kind === 'standalone') {
        rows.push({
          key: row.property.id,
          propertyLabel: getPropertyLabel(row.property),
          propertyVisits: getVisitsForPropertyIds(visits, row.propertyIds).sort(
            (a, b) => a.scheduledStartTime.localeCompare(b.scheduledStartTime),
          ),
          propertyBookings: getBookingsForPropertyIds(
            bookingsWithLayout,
            row.propertyIds,
          ),
          showRoomLabel: false,
          isChildRow: false,
          canExpand: false,
          isExpanded: false,
        })
        return
      }

      const isExpanded = expandedMtlIds.has(row.principal.id)
      rows.push({
        key: row.principal.id,
        propertyLabel: getMtlGroupLabel(row),
        propertyVisits: isExpanded
          ? visits
              .filter((visit) => visit.propertyId === row.principal.id)
              .sort((a, b) =>
                a.scheduledStartTime.localeCompare(b.scheduledStartTime),
              )
          : getVisitsForPropertyIds(visits, row.propertyIds).sort((a, b) =>
              a.scheduledStartTime.localeCompare(b.scheduledStartTime),
            ),
        propertyBookings: isExpanded
          ? getBookingsForPropertyIds(bookingsWithLayout, [row.principal.id])
          : getBookingsForPropertyIds(bookingsWithLayout, row.propertyIds),
        showRoomLabel: !isExpanded,
        isChildRow: false,
        canExpand: true,
        isExpanded,
        mtlPrincipalId: row.principal.id,
      })

      if (isExpanded) {
        row.children.forEach((child) => {
          const childVisits = visits
            .filter((visit) => visit.propertyId === child.id)
            .sort((a, b) =>
              a.scheduledStartTime.localeCompare(b.scheduledStartTime),
            )
          const childBookings = getBookingsForPropertyIds(
            bookingsWithLayout,
            [child.id],
          )
          if (childVisits.length === 0 && childBookings.length === 0) {
            return
          }
          rows.push({
            key: `${row.principal.id}:${child.id}`,
            propertyLabel: getPropertyLabel(child),
            propertyVisits: childVisits,
            propertyBookings: childBookings,
            showRoomLabel: false,
            isChildRow: true,
            canExpand: false,
            isExpanded: false,
            mtlPrincipalId: row.principal.id,
          })
        })
      }
    })

    return rows
  }, [visibleRows, visits, bookingsWithLayout, expandedMtlIds])

  const toggleMtlGroup = (principalId: string) => {
    setExpandedMtlIds((current) => {
      const next = new Set(current)
      if (next.has(principalId)) {
        next.delete(principalId)
      } else {
        next.add(principalId)
      }
      return next
    })
  }

  return (
    <section className="card operations-day-card">
      <div className="operations-day-header">
        <div className="operations-day-title-row">
          <h2 className="section-title">{formatAgendaDayLabel(dayViewDate)}</h2>
          <div className="operations-day-date-controls">
            <button
              type="button"
              className="btn-ghost operations-day-nav-btn"
              aria-label={t('operations.previousDay')}
              title={t('operations.previousDay')}
              onClick={() =>
                onDayDateChange(addDaysToDateString(dayViewDate, -1))
              }
            >
              <span aria-hidden="true">&lt;</span>
            </button>
            <label className="btn-ghost operations-day-calendar-btn">
              <svg aria-hidden="true" viewBox="0 0 20 20" width="22" height="22">
                <path
                  d="M6 2h2v2h4V2h2v2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2zm10 6H4v8h12V8z"
                  fill="currentColor"
                />
              </svg>
              <input
                className="operations-day-date-input"
                type="date"
                value={dayViewDate}
                onChange={(event) => onDayDateChange(event.target.value)}
                aria-label={t('operations.chooseDate')}
              />
            </label>
            <button
              type="button"
              className="btn-ghost operations-day-nav-btn"
              aria-label={t('operations.nextDay')}
              title={t('operations.nextDay')}
              onClick={() =>
                onDayDateChange(addDaysToDateString(dayViewDate, 1))
              }
            >
              <span aria-hidden="true">&gt;</span>
            </button>
          </div>
        </div>
      </div>

      {tableRows.length === 0 ? (
        <p className="subtitle operations-day-empty">
          {t('operations.emptyDayVisits', {
            date: formatAgendaDayLabel(dayViewDate),
          })}
        </p>
      ) : (
      <>
        {windowOverflow.hasEarly || windowOverflow.hasLate ? (
          <div className="operations-day-window-warnings" role="status">
            {windowOverflow.hasEarly ? (
              <button
                type="button"
                className="operations-day-window-warning"
                onClick={() => shiftTimelineWindow(-DAY_VIEW_PAN_STEP_MINUTES)}
                disabled={!canShiftEarlier}
              >
                {t('operations.visitsBeforeWindow', {
                  time: formatMinutesAsTime(timelineWindow.startMinutes),
                  earliest: formatMinutesAsTime(windowOverflow.earliestBefore),
                })}
              </button>
            ) : null}
            {windowOverflow.hasLate ? (
              <button
                type="button"
                className="operations-day-window-warning"
                onClick={() => shiftTimelineWindow(DAY_VIEW_PAN_STEP_MINUTES)}
                disabled={!canShiftLater}
              >
                {t('operations.visitsAfterWindow', {
                  time: formatMinutesAsTime(timelineWindow.endMinutes),
                  latest: formatMinutesAsTime(windowOverflow.latestAfter),
                })}
              </button>
            ) : null}
          </div>
        ) : null}
      <div className="operations-day-scroll">
        <table className="operations-day-table">
          <thead>
            <tr>
              <th className="operations-day-property-header">{t('operations.property')}</th>
              <th className="operations-day-timeline-header">
                <div className="operations-day-hours-wrap">
                  <button
                    type="button"
                    className="operations-range-nav operations-range-nav--start"
                    aria-label={t('operations.earlierHours')}
                    title={t('operations.earlierHours')}
                    disabled={!canShiftEarlier}
                    onClick={() => shiftTimelineWindow(-DAY_VIEW_PAN_STEP_MINUTES)}
                  >
                    &laquo;
                  </button>
                  <div className="operations-day-hours">
                    {hourMarks.map((minute) => (
                      <span
                        key={minute}
                        className="operations-day-hour"
                        style={{
                          left: `${minutesToPositionPercent(minute, timelineWindow)}%`,
                        }}
                      >
                        {formatMinutesAsTime(minute)}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="operations-range-nav operations-range-nav--end"
                    aria-label={t('operations.laterHours')}
                    title={t('operations.laterHours')}
                    disabled={!canShiftLater}
                    onClick={() => shiftTimelineWindow(DAY_VIEW_PAN_STEP_MINUTES)}
                  >
                    &raquo;
                  </button>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => (
              <DayPropertyRow
                key={row.key}
                row={row}
                timelineWindow={timelineWindow}
                propertyById={propertyById}
                teamById={teamById}
                syncingVisitIds={syncingVisitIds}
                onToggleMtlGroup={toggleMtlGroup}
                onVisitClick={onVisitClick}
                onVisitTimeChange={onVisitTimeChange}
                onCheckInLayoutChange={handleCheckInLayoutChange}
                onBookingClick={setSelectedCheckIn}
              />
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}
      {selectedCheckIn ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setSelectedCheckIn(null)}
        >
          <div
            className="modal operations-booking-popover"
            role="dialog"
            aria-modal="true"
            aria-label={selectedCheckIn.guestName || t('operations.checkInDetails')}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {selectedCheckIn.guestName || t('operations.checkInDetails')}
                </h3>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setSelectedCheckIn(null)}
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div>
                  <p className="detail-label">{t('bookingsPlan.guests')}</p>
                  <p className="detail-value">
                    {selectedCheckIn.guests || '—'}
                  </p>
                </div>
                <div>
                  <p className="detail-label">{t('bookingsPlan.nights')}</p>
                  <p className="detail-value">
                    {selectedCheckIn.nights || '—'}
                  </p>
                </div>
                <div>
                  <p className="detail-label">{t('bookingsPlan.giftCard')}</p>
                  <p className="detail-value">
                    {selectedCheckIn.giftCard || '—'}
                  </p>
                </div>
                <div>
                  <p className="detail-label">{t('bookingsPlan.linen')}</p>
                  <p className="detail-value">
                    {selectedCheckIn.linen || '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

type DayPropertyRowProps = {
  row: DayTableRow
  timelineWindow: DayTimelineWindow
  propertyById: Map<string, string>
  teamById: Map<string, string>
  syncingVisitIds: Set<string>
  onToggleMtlGroup: (mtlPrincipalId: string) => void
  onVisitClick: (visitId: string) => void
  onVisitTimeChange: (
    visitId: string,
    scheduledStartTime: string,
    scheduledEndTime: string,
  ) => void
  onCheckInLayoutChange: (
    booking: DayBookingEvent,
    layout: StoredCheckInLayout,
  ) => void
  onBookingClick: (booking: DayBookingEvent) => void
}

function DayPropertyRow({
  row,
  timelineWindow,
  propertyById,
  teamById,
  syncingVisitIds,
  onToggleMtlGroup,
  onVisitClick,
  onVisitTimeChange,
  onCheckInLayoutChange,
  onBookingClick,
}: DayPropertyRowProps) {
  const { t } = useTranslation()
  const [expandedClusterKeys, setExpandedClusterKeys] = useState<Set<string>>(
    () => new Set(),
  )
  const { items: timelineVisits, channelHeight } = useMemo(
    () =>
      layoutDayTimelineVisits(
        buildDayTimelineVisits(row.propertyVisits),
        expandedClusterKeys,
        teamById,
      ),
    [expandedClusterKeys, row.propertyVisits, teamById],
  )
  const hasExpandedClusters = timelineVisits.some(
    (entry) => entry.isClusterExpanded,
  )

  return (
    <tr className={row.isChildRow ? 'operations-day-row-child' : undefined}>
      <th
        className={`operations-day-property-cell${
          row.isChildRow ? ' is-child' : ''
        }${row.canExpand ? ' is-mtl-header' : ''}`}
        scope="row"
      >
        {row.canExpand ? (
          <button
            type="button"
            className="operations-mtl-toggle"
            onClick={() => onToggleMtlGroup(row.mtlPrincipalId!)}
            aria-expanded={row.isExpanded}
            aria-label={
              row.isExpanded
                ? t('operations.collapseProperty', { name: row.propertyLabel })
                : t('operations.expandProperty', { name: row.propertyLabel })
            }
          >
            {row.isExpanded ? '▾' : '▸'}
          </button>
        ) : null}
        <span>{row.propertyLabel}</span>
        {hasExpandedClusters ? (
          <button
            type="button"
            className="operations-mtl-toggle operations-day-overlap-collapse"
            aria-expanded
            aria-label={t('operations.collapseOverlappingVisits')}
            title={t('operations.collapseOverlappingVisits')}
            onClick={() => setExpandedClusterKeys(new Set())}
          >
            ▾
          </button>
        ) : null}
      </th>
      <td className="operations-day-timeline-cell">
        <DayTimelineTrack
          propertyVisits={row.propertyVisits}
          propertyBookings={row.propertyBookings}
          timelineVisits={timelineVisits}
          channelHeight={channelHeight}
          timelineWindow={timelineWindow}
          propertyById={propertyById}
          teamById={teamById}
          syncingVisitIds={syncingVisitIds}
          showRoomLabel={row.showRoomLabel}
          expandMtlOnVisitClick={row.canExpand && !row.isExpanded}
          onExpandMtlGroup={
            row.canExpand && row.mtlPrincipalId
              ? () => onToggleMtlGroup(row.mtlPrincipalId!)
              : undefined
          }
          onExpandOverlapCluster={(clusterKey) => {
            setExpandedClusterKeys((current) => {
              const next = new Set(current)
              next.add(clusterKey)
              return next
            })
          }}
          onVisitClick={onVisitClick}
          onVisitTimeChange={onVisitTimeChange}
          onCheckInLayoutChange={onCheckInLayoutChange}
          onBookingClick={onBookingClick}
        />
      </td>
    </tr>
  )
}

type DayTimelineTrackProps = {
  propertyVisits: VisitRecord[]
  propertyBookings: DayBookingEvent[]
  timelineVisits: DayTimelineVisit[]
  channelHeight: number
  timelineWindow: DayTimelineWindow
  propertyById: Map<string, string>
  teamById: Map<string, string>
  syncingVisitIds: Set<string>
  showRoomLabel: boolean
  expandMtlOnVisitClick: boolean
  onExpandMtlGroup?: () => void
  onExpandOverlapCluster: (clusterKey: string) => void
  onVisitClick: (visitId: string) => void
  onVisitTimeChange: (
    visitId: string,
    scheduledStartTime: string,
    scheduledEndTime: string,
  ) => void
  onCheckInLayoutChange: (
    booking: DayBookingEvent,
    layout: StoredCheckInLayout,
  ) => void
  onBookingClick: (booking: DayBookingEvent) => void
}

function minutesFromTrackPointer(
  clientX: number,
  track: HTMLElement,
  timelineWindow: DayTimelineWindow,
) {
  const rect = track.getBoundingClientRect()
  const percent = ((clientX - rect.left) / Math.max(rect.width, 1)) * 100
  return positionPercentToMinutes(percent, timelineWindow)
}

function DayTimelineTrack({
  propertyVisits,
  propertyBookings,
  timelineVisits,
  channelHeight,
  timelineWindow,
  propertyById,
  teamById,
  syncingVisitIds,
  showRoomLabel,
  expandMtlOnVisitClick,
  onExpandMtlGroup,
  onExpandOverlapCluster,
  onVisitClick,
  onVisitTimeChange,
  onCheckInLayoutChange,
  onBookingClick,
}: DayTimelineTrackProps) {
  const { t } = useTranslation()
  const trackRef = useRef<HTMLDivElement>(null)
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null)
  const [previewRange, setPreviewRange] = useState<{
    visitId: string
    start: number
    end: number
  } | null>(null)
  const dragMovedRef = useRef(false)
  const pointerHitOverlapRef = useRef(false)

  const overflow = getDayWindowOverflow(
    propertyVisits,
    timelineWindow,
    propertyBookings,
  )

  const finishDrag = useCallback(
    (drag: ActiveDrag, nextStart: number, nextEnd: number) => {
      if (nextStart === drag.startMinutes && nextEnd === drag.endMinutes) {
        return
      }
      onVisitTimeChange(
        drag.visitId,
        formatMinutesAsTime(nextStart),
        formatMinutesAsTime(nextEnd),
      )
    },
    [onVisitTimeChange],
  )

  useEffect(() => {
    if (!activeDrag) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      const deltaPx = event.clientX - activeDrag.pointerStartX
      if (Math.abs(deltaPx) > CLICK_THRESHOLD_PX) {
        dragMovedRef.current = true
      }
      const deltaMinutes = snapToDayGrid(
        (deltaPx / activeDrag.trackWidth) * DAY_VIEW_SPAN_MINUTES,
      )

      let nextStart = activeDrag.startMinutes
      let nextEnd = activeDrag.endMinutes

      if (activeDrag.mode === 'move') {
        const duration = activeDrag.endMinutes - activeDrag.startMinutes
        nextStart = activeDrag.startMinutes + deltaMinutes
        nextEnd = nextStart + duration
      } else if (activeDrag.mode === 'resize-start') {
        nextStart = activeDrag.startMinutes + deltaMinutes
        if (nextEnd - nextStart < DAY_MIN_DURATION_MINUTES) {
          nextStart = nextEnd - DAY_MIN_DURATION_MINUTES
        }
      } else {
        nextEnd = activeDrag.endMinutes + deltaMinutes
        if (nextEnd - nextStart < DAY_MIN_DURATION_MINUTES) {
          nextEnd = nextStart + DAY_MIN_DURATION_MINUTES
        }
      }

      setPreviewRange({
        visitId: activeDrag.visitId,
        start: nextStart,
        end: nextEnd,
      })
    }

    const handlePointerUp = (event: PointerEvent) => {
      const deltaPx = event.clientX - activeDrag.pointerStartX
      const deltaMinutes = snapToDayGrid(
        (deltaPx / activeDrag.trackWidth) * DAY_VIEW_SPAN_MINUTES,
      )

      let nextStart = activeDrag.startMinutes
      let nextEnd = activeDrag.endMinutes

      if (activeDrag.mode === 'move') {
        const duration = activeDrag.endMinutes - activeDrag.startMinutes
        nextStart = activeDrag.startMinutes + deltaMinutes
        nextEnd = nextStart + duration
      } else if (activeDrag.mode === 'resize-start') {
        nextStart = activeDrag.startMinutes + deltaMinutes
        if (nextEnd - nextStart < DAY_MIN_DURATION_MINUTES) {
          nextStart = nextEnd - DAY_MIN_DURATION_MINUTES
        }
      } else {
        nextEnd = activeDrag.endMinutes + deltaMinutes
        if (nextEnd - nextStart < DAY_MIN_DURATION_MINUTES) {
          nextEnd = nextStart + DAY_MIN_DURATION_MINUTES
        }
      }

      finishDrag(activeDrag, nextStart, nextEnd)
      setActiveDrag(null)
      setPreviewRange(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [activeDrag, finishDrag])

  const pointerHitsOverlap = (
    entry: DayTimelineVisit,
    clientX: number,
    clientY: number,
  ) => {
    const track = trackRef.current
    if (!track) {
      return false
    }
    const rect = track.getBoundingClientRect()
    return pointerHitsCollapsedVisitOverlap(
      entry,
      timelineVisits,
      minutesFromTrackPointer(clientX, track, timelineWindow),
      clientY - rect.top,
    )
  }

  const beginDrag = (
    event: React.PointerEvent,
    entry: DayTimelineVisit,
    mode: DragMode,
  ) => {
    const visit = entry.visit
    if (isTerminalVisit(visit) || syncingVisitIds.has(visit.id)) {
      return
    }
    const hitsOverlap = pointerHitsOverlap(entry, event.clientX, event.clientY)
    pointerHitOverlapRef.current = hitsOverlap
    if (expandMtlOnVisitClick || hitsOverlap) {
      dragMovedRef.current = false
      return
    }
    const track = trackRef.current
    if (!track) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    dragMovedRef.current = false
    const { start, end } = getVisitTimeRange(visit)
    const trackWidth = track.getBoundingClientRect().width
    event.currentTarget.setPointerCapture(event.pointerId)
    setActiveDrag({
      visitId: visit.id,
      mode,
      startMinutes: start,
      endMinutes: end,
      pointerStartX: event.clientX,
      trackWidth,
    })
    setPreviewRange({ visitId: visit.id, start, end })
  }

  const handleBlockClick = (
    entry: DayTimelineVisit,
    clientX?: number,
    clientY?: number,
  ) => {
    if (dragMovedRef.current) {
      dragMovedRef.current = false
      pointerHitOverlapRef.current = false
      return
    }
    if (expandMtlOnVisitClick) {
      onExpandMtlGroup?.()
      return
    }
    const hitsOverlap =
      clientX === undefined || clientY === undefined
        ? pointerHitOverlapRef.current
        : pointerHitsOverlap(entry, clientX, clientY)
    pointerHitOverlapRef.current = false
    if (hitsOverlap && dayVisitExpandsOverlapOnClick(entry)) {
      onExpandOverlapCluster(entry.clusterKey)
      return
    }
    onVisitClick(entry.visit.id)
  }

  return (
    <div
      className={`operations-day-track-wrap${
        overflow.hasEarly ? ' has-early' : ''
      }${overflow.hasLate ? ' has-late' : ''}`}
    >
      {overflow.hasEarly ? (
        <span
          className="operations-day-overflow-indicator operations-day-overflow-indicator--start"
          title={t('operations.visitsBeforeWindow', {
            time: formatMinutesAsTime(timelineWindow.startMinutes),
            earliest: formatMinutesAsTime(overflow.earliestBefore),
          })}
        >
          ‹ {formatMinutesAsTime(overflow.earliestBefore)}
        </span>
      ) : null}
      {overflow.hasLate ? (
        <span
          className="operations-day-overflow-indicator operations-day-overflow-indicator--end"
          title={t('operations.visitsAfterWindow', {
            time: formatMinutesAsTime(timelineWindow.endMinutes),
            latest: formatMinutesAsTime(overflow.latestAfter),
          })}
        >
          {formatMinutesAsTime(overflow.latestAfter)} ›
        </span>
      ) : null}
      <div
        ref={trackRef}
        className={`operations-day-track${
          timelineVisits.some((entry) => entry.isClusterExpanded)
            ? ' is-overlap-expanded'
            : ''
        }`}
        style={{
          height: `${channelHeight}px`,
        }}
      >
        {timelineVisits.map((entry) => (
          <DayVisitBlock
            key={entry.visit.id}
            entry={entry}
            timelineWindow={timelineWindow}
            propertyById={propertyById}
            teamById={teamById}
            syncingVisitIds={syncingVisitIds}
            showRoomLabel={showRoomLabel}
            previewRange={previewRange}
            expandMtlOnVisitClick={expandMtlOnVisitClick}
            lockDrag={expandMtlOnVisitClick}
            beginDrag={beginDrag}
            handleBlockClick={handleBlockClick}
          />
        ))}
        {propertyBookings.map((booking) => (
          <DayBookingBlock
            key={booking.id}
            booking={booking}
            timelineWindow={timelineWindow}
            onCheckInLayoutChange={onCheckInLayoutChange}
            onBookingClick={onBookingClick}
          />
        ))}
      </div>
    </div>
  )
}

type DayVisitBlockProps = {
  entry: DayTimelineVisit
  timelineWindow: DayTimelineWindow
  propertyById: Map<string, string>
  teamById: Map<string, string>
  syncingVisitIds: Set<string>
  showRoomLabel: boolean
  previewRange: { visitId: string; start: number; end: number } | null
  expandMtlOnVisitClick: boolean
  lockDrag: boolean
  beginDrag: (
    event: React.PointerEvent,
    entry: DayTimelineVisit,
    mode: DragMode,
  ) => void
  handleBlockClick: (
    entry: DayTimelineVisit,
    clientX?: number,
    clientY?: number,
  ) => void
}

function DayVisitBlock({
  entry,
  timelineWindow,
  propertyById,
  teamById,
  syncingVisitIds,
  showRoomLabel,
  previewRange,
  expandMtlOnVisitClick,
  lockDrag,
  beginDrag,
  handleBlockClick,
}: DayVisitBlockProps) {
  const { t } = useTranslation()
  const { visit } = entry
  const isDragging = previewRange?.visitId === visit.id
  const start = isDragging ? previewRange!.start : entry.start
  const end = isDragging ? previewRange!.end : entry.end
  const clipped = clipVisitToDayWindow(start, end, timelineWindow)
  const left = minutesToPositionPercent(clipped.visualStart, timelineWindow)
  const width = Math.max(
    2,
    minutesToPositionPercent(clipped.visualEnd, timelineWindow) -
      minutesToPositionPercent(clipped.visualStart, timelineWindow),
  )
  const isSyncing = syncingVisitIds.has(visit.id)
  const isEditable = !isTerminalVisit(visit)
  const roomLabel = showRoomLabel ? propertyById.get(visit.propertyId) : undefined
  const expandsOverlap = dayVisitExpandsOverlapOnClick(entry)
  const clickHint = expandMtlOnVisitClick
    ? t('operations.expandRoomsOnVisitClick')
    : expandsOverlap
      ? t('operations.expandOverlappingVisits')
      : undefined

  const summaryTitle = `${formatVisitSummaryLine(visit, {
    roomLabel,
    endTime: visit.scheduledEndTime,
  })}${
    entry.hasTimeOverlap
      ? ` · ${t('operations.overlapsWithVisits', {
          count: entry.overlapCount - 1,
        })}`
      : ''
  }${clickHint ? ` · ${clickHint}` : ''}`

  return (
    <div
      className={`operations-day-visit-block operations-day-visit-block--compact${
        isTerminalVisit(visit) ? ' is-terminal' : ''
      }${visit.status === 'COMPLETED' ? ' is-completed' : ''}${
        visit.status === 'CANCELLED' ? ' is-cancelled' : ''
      }${isDragging ? ' is-dragging' : ''}${isSyncing ? ' is-syncing' : ''}${
        clipped.extendsBefore ? ' extends-before' : ''
      }${clipped.extendsAfter ? ' extends-after' : ''}${
        entry.hasTimeOverlap ? ' has-time-overlap' : ''
      }${expandsOverlap || expandMtlOnVisitClick ? ' is-overlap-group' : ''}${
        lockDrag ? ' is-click-expand' : ''
      } has-team-solid`}
      style={{
        left: `${left}%`,
        width: `${width}%`,
        top: `${visitBlockTop(entry)}px`,
        ...getTeamBlockStyle(visit.teamId, teamById),
        zIndex: isDragging
          ? 5
          : entry.isClusterExpanded
            ? 2
            : entry.hasTimeOverlap
              ? Math.min(5, 2 + entry.stackLayer)
              : 2,
      }}
      title={summaryTitle}
    >
      {isEditable ? (
        <>
          {lockDrag ? null : (
            <span
              className="operations-day-resize-handle operations-day-resize-handle--start"
              onPointerDown={(event) => beginDrag(event, entry, 'resize-start')}
              aria-label={t('operations.resizeStartTime')}
            />
          )}
          <div
            className="operations-day-block-body"
            onPointerDown={(event) => beginDrag(event, entry, 'move')}
            onClick={(event) =>
              handleBlockClick(entry, event.clientX, event.clientY)
            }
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleBlockClick(entry)
              }
            }}
          >
            {isSyncing ? (
              <span
                className="operations-sync-spinner operations-sync-spinner--block"
                aria-hidden="true"
              />
            ) : null}
            <span className="operations-day-visit-summary">
              {formatVisitBarTitle(visit, { roomLabel })}
            </span>
          </div>
          {lockDrag ? null : (
            <span
              className="operations-day-resize-handle operations-day-resize-handle--end"
              onPointerDown={(event) => beginDrag(event, entry, 'resize-end')}
              aria-label={t('operations.resizeEndTime')}
            />
          )}
        </>
      ) : (
        <button
          type="button"
          className="operations-day-block-body operations-day-block-body--button"
          onClick={(event) =>
            handleBlockClick(entry, event.clientX, event.clientY)
          }
        >
          <span className="operations-day-visit-summary">
            {formatVisitBarTitle(visit, { roomLabel })}
          </span>
        </button>
      )}
      {isTerminalVisit(visit) ? (
        <span className="operations-day-terminal-mark">
          {visit.status === 'COMPLETED' ? '✓' : '✕'}
        </span>
      ) : null}
    </div>
  )
}

function DayBookingIcon({ kind }: { kind: DayBookingEvent['kind'] }) {
  if (kind === 'check-in') {
    return (
      <svg
        className="operations-day-booking-icon"
        viewBox="0 0 16 16"
        width="14"
        height="14"
        aria-hidden="true"
      >
        <path
          d="M7 3.5H4.5A1.5 1.5 0 0 0 3 5v6a1.5 1.5 0 0 0 1.5 1.5H7M8.5 8H14m0 0-2.2-2.2M14 8l-2.2 2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  return (
    <svg
      className="operations-day-booking-icon"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path
        d="M9 3.5h2.5A1.5 1.5 0 0 1 13 5v6a1.5 1.5 0 0 1-1.5 1.5H9M2 8h5.5M2 8l2.2-2.2M2 8l2.2 2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function DayBookingTimeBlock({
  start,
  end,
  timelineWindow,
  className,
  title,
  children,
  onMovePointerDown,
  onClick,
}: {
  start: number
  end: number
  timelineWindow: DayTimelineWindow
  className: string
  title: string
  children?: ReactNode
  onMovePointerDown?: (event: React.PointerEvent) => void
  onClick?: () => void
}) {
  const clipped = clipVisitToDayWindow(start, end, timelineWindow)
  if (clipped.visualEnd <= clipped.visualStart) {
    return null
  }
  const left = minutesToPositionPercent(clipped.visualStart, timelineWindow)
  const width = Math.max(
    2,
    minutesToPositionPercent(clipped.visualEnd, timelineWindow) -
      minutesToPositionPercent(clipped.visualStart, timelineWindow),
  )
  return (
    <div
      className={className}
      style={{
        left: `${left}%`,
        width: `${width}%`,
      }}
      title={title}
      aria-label={title}
      role={onMovePointerDown || onClick ? 'button' : undefined}
      onPointerDown={onMovePointerDown}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

type BookingDrag = {
  mode: 'move' | 'resize-early'
  source: 'check-in' | 'early'
  checkInStartMinutes: number
  earlyLeadMinutes: number
  pointerStartX: number
  trackWidth: number
}

function DayBookingBlock({
  booking,
  timelineWindow,
  onCheckInLayoutChange,
  onBookingClick,
}: {
  booking: DayBookingEvent
  timelineWindow: DayTimelineWindow
  onCheckInLayoutChange: (
    booking: DayBookingEvent,
    layout: StoredCheckInLayout,
  ) => void
  onBookingClick: (booking: DayBookingEvent) => void
}) {
  const { t } = useTranslation()
  const layout = resolveCheckInLayout(booking)
  const [preview, setPreview] = useState<StoredCheckInLayout | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<BookingDrag | null>(null)
  const movedRef = useRef(false)
  const stopListeningRef = useRef<() => void>(() => {})
  const display = preview ?? layout

  useEffect(() => () => stopListeningRef.current(), [])

  const applyDelta = (drag: BookingDrag, deltaPx: number) => {
    const deltaMinutes = snapToDayGrid(
      (deltaPx / drag.trackWidth) * DAY_VIEW_SPAN_MINUTES,
    )
    if (drag.mode === 'move') {
      return clampCheckInLayout({
        checkInStartMinutes: drag.checkInStartMinutes + deltaMinutes,
        earlyLeadMinutes: drag.earlyLeadMinutes,
        minLead: 0,
      })
    }
    const leadDelta =
      Math.round(((deltaPx / drag.trackWidth) * DAY_VIEW_SPAN_MINUTES) / 15) *
      15
    return clampCheckInLayout({
      checkInStartMinutes: drag.checkInStartMinutes,
      earlyLeadMinutes: drag.earlyLeadMinutes - leadDelta,
      minLead: 0,
    })
  }

  const beginDrag = (
    event: React.PointerEvent,
    mode: BookingDrag['mode'],
    source: BookingDrag['source'] = 'check-in',
  ) => {
    const track = event.currentTarget.closest('.operations-day-track')
    if (!track) {
      return
    }
    event.stopPropagation()
    const trackWidth = track.getBoundingClientRect().width
    if (trackWidth <= 0) {
      return
    }
    movedRef.current = false
    const drag: BookingDrag = {
      mode,
      source,
      checkInStartMinutes: layout.checkInStartMinutes,
      earlyLeadMinutes: layout.earlyLeadMinutes,
      pointerStartX: event.clientX,
      trackWidth,
    }
    dragRef.current = drag
    setIsDragging(true)
    setPreview(layout)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Synthetic or already-released pointers can throw here.
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const current = dragRef.current
      if (!current) {
        return
      }
      const deltaPx = moveEvent.clientX - current.pointerStartX
      if (Math.abs(deltaPx) > CLICK_THRESHOLD_PX) {
        movedRef.current = true
      }
      setPreview(applyDelta(current, deltaPx))
    }

    const handlePointerUp = (upEvent: PointerEvent) => {
      stopListeningRef.current()
      const current = dragRef.current
      dragRef.current = null
      setIsDragging(false)
      if (!current) {
        setPreview(null)
        return
      }
      const deltaPx = upEvent.clientX - current.pointerStartX
      if (
        current.mode === 'move' &&
        current.source === 'check-in' &&
        !movedRef.current &&
        Math.abs(deltaPx) <= CLICK_THRESHOLD_PX
      ) {
        setPreview(null)
        return
      }
      const next = applyDelta(current, deltaPx)
      if (
        next.checkInStartMinutes !== layout.checkInStartMinutes ||
        next.earlyLeadMinutes !== layout.earlyLeadMinutes
      ) {
        onCheckInLayoutChange(booking, next)
      }
      setPreview(null)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    stopListeningRef.current = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      stopListeningRef.current = () => {}
    }
  }

  const handleCheckInClick = () => {
    if (movedRef.current) {
      movedRef.current = false
      return
    }
    onBookingClick(booking)
  }

  if (booking.kind === 'check-out') {
    const start = BOOKING_CHECK_OUT_END - BOOKING_DURATION_MINUTES
    return (
      <DayBookingTimeBlock
        start={start}
        end={BOOKING_CHECK_OUT_END}
        timelineWindow={timelineWindow}
        className="operations-day-booking-block is-check-out"
        title={`${t('common.checkOut')} · ${booking.guestName}`}
      >
        <DayBookingIcon kind="check-out" />
      </DayBookingTimeBlock>
    )
  }

  const start = display.checkInStartMinutes
  const end = start + BOOKING_DURATION_MINUTES
  const showEarlyCheckIn = display.earlyLeadMinutes > 0

  return (
    <>
      {showEarlyCheckIn ? (
        <DayBookingTimeBlock
          start={start - display.earlyLeadMinutes}
          end={start}
          timelineWindow={timelineWindow}
          className={`operations-day-booking-block is-early-check-in${
            isDragging ? ' is-dragging' : ''
          }`}
          title={`${t('bookingsPlan.earlyCheckIn')} · ${booking.guestName}`}
          onMovePointerDown={(event) => beginDrag(event, 'move', 'early')}
        >
          <span
            className="operations-day-resize-handle operations-day-resize-handle--start"
            onPointerDown={(event) => {
              event.stopPropagation()
              beginDrag(event, 'resize-early', 'early')
            }}
            onClick={(event) => event.stopPropagation()}
            aria-label={t('operations.resizeEarlyCheckIn')}
          />
        </DayBookingTimeBlock>
      ) : null}
      <DayBookingTimeBlock
        start={start}
        end={end}
        timelineWindow={timelineWindow}
        className={`operations-day-booking-block is-check-in${
          showEarlyCheckIn ? ' has-early-lead' : ''
        }${isDragging ? ' is-dragging' : ''}`}
        title={`${t('common.checkIn')} · ${booking.guestName}`}
        onMovePointerDown={(event) => beginDrag(event, 'move', 'check-in')}
        onClick={handleCheckInClick}
      >
        {showEarlyCheckIn ? null : (
          <span
            className="operations-day-resize-handle operations-day-resize-handle--start"
            onPointerDown={(event) => {
              event.stopPropagation()
              beginDrag(event, 'resize-early', 'check-in')
            }}
            onClick={(event) => event.stopPropagation()}
            aria-label={t('operations.addEarlyCheckIn')}
          />
        )}
        <DayBookingIcon kind="check-in" />
      </DayBookingTimeBlock>
    </>
  )
}
