import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  canShiftDayWindowEarlier,
  canShiftDayWindowLater,
  clipVisitToDayWindow,
  DAY_MIN_DURATION_MINUTES,
  DAY_VIEW_DEFAULT_START_MINUTES,
  DAY_VIEW_PAN_STEP_MINUTES,
  DAY_VIEW_SPAN_MINUTES,
  formatAgendaDayLabel,
  formatMinutesAsTime,
  getDayTimelineWindow,
  getDayWindowOverflow,
  getVisitTimeRange,
  isTerminalVisit,
  minutesToPositionPercent,
  shiftDayWindowStart,
  snapToDayGrid,
  type DayTimelineWindow,
} from './operationsViewHelpers'
import { getTeamBlockStyle } from './teamColors'
import {
  buildDayTimelineVisits,
  dayTimelineHasOverlaps,
  formatVisitSummaryLine,
  type DayTimelineVisit,
} from './visitOverlapLayout'
import type { VisitRecord } from './types'

const DAY_LANE_HEIGHT = 34
const BOOKING_CHECK_IN_START = 15 * 60
const BOOKING_CHECK_OUT_END = 11 * 60
const BOOKING_DURATION_MINUTES = 30

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
  guestName: string
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
}: Props) {
  const { t } = useTranslation()
  const [expandedMtlIds, setExpandedMtlIds] = useState<Set<string>>(new Set())
  const [windowStartMinutes, setWindowStartMinutes] = useState(
    DAY_VIEW_DEFAULT_START_MINUTES,
  )
  const timelineWindow = useMemo(
    () => getDayTimelineWindow(windowStartMinutes),
    [windowStartMinutes],
  )
  const { startMinutes, endMinutes } = timelineWindow
  const hourMarks: number[] = []
  for (let minute = startMinutes; minute <= endMinutes; minute += 60) {
    hourMarks.push(minute)
  }

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
          propertyBookings: getBookingsForPropertyIds(bookings, row.propertyIds),
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
          ? getBookingsForPropertyIds(bookings, [row.principal.id])
          : getBookingsForPropertyIds(bookings, row.propertyIds),
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
          const childBookings = getBookingsForPropertyIds(bookings, [child.id])
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
  }, [visibleRows, visits, bookings, expandedMtlIds])

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
              className="btn-ghost operations-day-next-btn"
              aria-label={t('operations.nextDay')}
              title={t('operations.nextDay')}
              onClick={() =>
                onDayDateChange(addDaysToDateString(dayViewDate, 1))
              }
            >
              <span aria-hidden="true">&gt;&gt;</span>
            </button>
          </div>
        </div>
      </div>

      {tableRows.length === 0 ? (
        <p className="subtitle operations-day-empty">
          No visits scheduled for {formatAgendaDayLabel(dayViewDate)}.
        </p>
      ) : (
      <div className="operations-day-scroll">
        <table className="operations-day-table">
          <thead>
            <tr>
              <th className="operations-day-property-header">Property</th>
              <th className="operations-day-timeline-header">
                <div className="operations-day-hours-wrap">
                  <button
                    type="button"
                    className="operations-range-nav"
                    aria-label="Earlier hours"
                    title="Earlier hours"
                    disabled={!canShiftDayWindowEarlier(windowStartMinutes)}
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
                    className="operations-range-nav"
                    aria-label="Later hours"
                    title="Later hours"
                    disabled={!canShiftDayWindowLater(windowStartMinutes)}
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
              <tr
                key={row.key}
                className={row.isChildRow ? 'operations-day-row-child' : undefined}
              >
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
                      onClick={() => toggleMtlGroup(row.mtlPrincipalId!)}
                      aria-expanded={row.isExpanded}
                      aria-label={
                        row.isExpanded
                          ? `Collapse ${row.propertyLabel}`
                          : `Expand ${row.propertyLabel}`
                      }
                    >
                      {row.isExpanded ? '▾' : '▸'}
                    </button>
                  ) : null}
                  <span>{row.propertyLabel}</span>
                </th>
                <td className="operations-day-timeline-cell">
                  <DayTimelineTrack
                    propertyVisits={row.propertyVisits}
                    propertyBookings={row.propertyBookings}
                    timelineWindow={timelineWindow}
                    propertyById={propertyById}
                    teamById={teamById}
                    syncingVisitIds={syncingVisitIds}
                    showRoomLabel={row.showRoomLabel}
                    onVisitClick={onVisitClick}
                    onVisitTimeChange={onVisitTimeChange}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </section>
  )
}

type DayTimelineTrackProps = {
  propertyVisits: VisitRecord[]
  propertyBookings: DayBookingEvent[]
  timelineWindow: DayTimelineWindow
  propertyById: Map<string, string>
  teamById: Map<string, string>
  syncingVisitIds: Set<string>
  showRoomLabel: boolean
  onVisitClick: (visitId: string) => void
  onVisitTimeChange: (
    visitId: string,
    scheduledStartTime: string,
    scheduledEndTime: string,
  ) => void
}

function DayTimelineTrack({
  propertyVisits,
  propertyBookings,
  timelineWindow,
  propertyById,
  teamById,
  syncingVisitIds,
  showRoomLabel,
  onVisitClick,
  onVisitTimeChange,
}: DayTimelineTrackProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null)
  const [previewRange, setPreviewRange] = useState<{
    visitId: string
    start: number
    end: number
  } | null>(null)
  const dragMovedRef = useRef(false)

  const overflow = getDayWindowOverflow(propertyVisits, timelineWindow)
  const timelineVisits = buildDayTimelineVisits(propertyVisits)
  const hasTimeConflicts = dayTimelineHasOverlaps(timelineVisits)

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

  const beginDrag = (
    event: React.PointerEvent,
    visit: VisitRecord,
    mode: DragMode,
  ) => {
    if (isTerminalVisit(visit) || syncingVisitIds.has(visit.id)) {
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

  const handleBlockClick = (visitId: string) => {
    if (dragMovedRef.current) {
      dragMovedRef.current = false
      return
    }
    onVisitClick(visitId)
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
          title={`Visits before ${formatMinutesAsTime(timelineWindow.startMinutes)} (earliest ${formatMinutesAsTime(overflow.earliestBefore)})`}
        >
          ‹ {formatMinutesAsTime(overflow.earliestBefore)}
        </span>
      ) : null}
      {overflow.hasLate ? (
        <span
          className="operations-day-overflow-indicator operations-day-overflow-indicator--end"
          title={`Visits after ${formatMinutesAsTime(timelineWindow.endMinutes)} (latest ${formatMinutesAsTime(overflow.latestAfter)})`}
        >
          {formatMinutesAsTime(overflow.latestAfter)} ›
        </span>
      ) : null}
      <div
        ref={trackRef}
        className={`operations-day-track${
          hasTimeConflicts ? ' has-time-conflicts' : ''
        }`}
        style={{ minHeight: `${DAY_LANE_HEIGHT + 8}px` }}
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
            onVisitClick={onVisitClick}
            beginDrag={beginDrag}
            handleBlockClick={handleBlockClick}
          />
        ))}
        {propertyBookings.map((booking) => (
          <DayBookingBlock
            key={booking.id}
            booking={booking}
            timelineWindow={timelineWindow}
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
  onVisitClick: (visitId: string) => void
  beginDrag: (
    event: React.PointerEvent,
    visit: VisitRecord,
    mode: DragMode,
  ) => void
  handleBlockClick: (visitId: string) => void
}

function DayVisitBlock({
  entry,
  timelineWindow,
  propertyById,
  teamById,
  syncingVisitIds,
  showRoomLabel,
  previewRange,
  onVisitClick,
  beginDrag,
  handleBlockClick,
}: DayVisitBlockProps) {
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
      } has-team-solid`}
      style={{
        left: `${left}%`,
        width: `${width}%`,
        top: 0,
        zIndex: entry.hasTimeOverlap ? 2 + entry.stackLayer : 1,
        ...getTeamBlockStyle(visit.teamId, teamById),
      }}
      title={`${formatVisitSummaryLine(visit, {
        roomLabel,
        endTime: visit.scheduledEndTime,
      })}${entry.hasTimeOverlap ? ` · Overlaps with ${entry.overlapCount - 1} other visit(s)` : ''}`}
    >
      {isEditable ? (
        <>
          <span
            className="operations-day-resize-handle operations-day-resize-handle--start"
            onPointerDown={(event) => beginDrag(event, visit, 'resize-start')}
            aria-label="Resize start time"
          />
          <div
            className="operations-day-block-body"
            onPointerDown={(event) => beginDrag(event, visit, 'move')}
            onClick={() => handleBlockClick(visit.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                onVisitClick(visit.id)
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
              {formatVisitSummaryLine(visit, {
                roomLabel,
                endTime: formatMinutesAsTime(end),
              })}
            </span>
          </div>
          <span
            className="operations-day-resize-handle operations-day-resize-handle--end"
            onPointerDown={(event) => beginDrag(event, visit, 'resize-end')}
            aria-label="Resize end time"
          />
        </>
      ) : (
        <button
          type="button"
          className="operations-day-block-body operations-day-block-body--button"
          onClick={() => onVisitClick(visit.id)}
        >
          <span className="operations-day-visit-summary">
            {formatVisitSummaryLine(visit, {
              roomLabel,
              endTime: visit.scheduledEndTime,
            })}
          </span>
        </button>
      )}
      {entry.hasTimeOverlap ? (
        <span
          className="operations-day-time-overlap-badge"
          title={`Overlaps with ${entry.overlapCount - 1} other visit(s) — reschedule to fix`}
        >
          ⚠
        </span>
      ) : null}
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

function DayBookingBlock({
  booking,
  timelineWindow,
}: {
  booking: DayBookingEvent
  timelineWindow: DayTimelineWindow
}) {
  const start =
    booking.kind === 'check-in'
      ? BOOKING_CHECK_IN_START
      : BOOKING_CHECK_OUT_END - BOOKING_DURATION_MINUTES
  const end =
    booking.kind === 'check-in'
      ? start + BOOKING_DURATION_MINUTES
      : BOOKING_CHECK_OUT_END
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
  const label =
    booking.kind === 'check-in'
      ? `Check-in · ${booking.guestName}`
      : `Check-out · ${booking.guestName}`

  return (
    <div
      className={`operations-day-booking-block ${
        booking.kind === 'check-in' ? 'is-check-in' : 'is-check-out'
      }`}
      style={{
        left: `${left}%`,
        width: `${width}%`,
      }}
      title={label}
      aria-label={label}
    >
      <DayBookingIcon kind={booking.kind} />
    </div>
  )
}
