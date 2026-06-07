import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getPropertyLabel } from './propertyHelpers'
import {
  getMtlGroupLabel,
  getVisitsForPropertyIds,
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

type DragMode = 'move' | 'resize-start' | 'resize-end'

type ActiveDrag = {
  visitId: string
  mode: DragMode
  startMinutes: number
  endMinutes: number
  pointerStartX: number
  trackWidth: number
}

type Props = {
  dayViewDate: string
  displayRows: MtlDisplayRow[]
  visits: VisitRecord[]
  propertyById: Map<string, string>
  teamById: Map<string, string>
  syncingVisitIds: Set<string>
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
  propertyById,
  teamById,
  syncingVisitIds,
  onVisitClick,
  onVisitTimeChange,
}: Props) {
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

  const visibleRows = displayRows.filter((row) => rowHasVisits(row, visits))

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
          if (childVisits.length === 0) {
            return
          }
          rows.push({
            key: `${row.principal.id}:${child.id}`,
            propertyLabel: getPropertyLabel(child),
            propertyVisits: childVisits,
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
  }, [visibleRows, visits, expandedMtlIds])

  if (tableRows.length === 0) {
    return (
      <section className="card">
        <p className="subtitle">
          No visits scheduled for {formatAgendaDayLabel(dayViewDate)}.
        </p>
      </section>
    )
  }

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
        <h2 className="section-title">{formatAgendaDayLabel(dayViewDate)}</h2>
        <p className="subtitle">
          Timeline {formatMinutesAsTime(startMinutes)}–
          {formatMinutesAsTime(endMinutes)}. One line per property; overlapping
          visits are highlighted so you can reschedule them. Drag to move; drag edges
          to resize (30 min snap).
        </p>
      </div>

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
    </section>
  )
}

type DayTimelineTrackProps = {
  propertyVisits: VisitRecord[]
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
