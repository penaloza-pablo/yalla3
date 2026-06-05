import { useCallback, useEffect, useRef, useState } from 'react'
import { getPropertyLabel } from './propertyHelpers'
import {
  buildVisitLayoutSlots,
  clipVisitToDayWindow,
  DAY_MIN_DURATION_MINUTES,
  DAY_VIEW_END_MINUTES,
  DAY_VIEW_SPAN_MINUTES,
  DAY_VIEW_START_MINUTES,
  formatAgendaDayLabel,
  formatMinutesAsTime,
  getDayTimelineBounds,
  getDayWindowOverflow,
  getVisitTimeRange,
  isTerminalVisit,
  minutesToPositionPercent,
  snapToDayGrid,
} from './operationsViewHelpers'
import {
  getTeamColorStyle,
  getTeamStripeGradient,
} from './teamColors'
import type { PropertyOption, VisitRecord } from './types'

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
  properties: PropertyOption[]
  visits: VisitRecord[]
  teamById: Map<string, string>
  syncingVisitIds: Set<string>
  onVisitClick: (visitId: string) => void
  onVisitTimeChange: (
    visitId: string,
    scheduledStartTime: string,
    scheduledEndTime: string,
  ) => void
}

const CLICK_THRESHOLD_PX = 4

export function OperationsDayView({
  dayViewDate,
  properties,
  visits,
  teamById,
  syncingVisitIds,
  onVisitClick,
  onVisitTimeChange,
}: Props) {
  const { startMinutes, endMinutes } = getDayTimelineBounds()
  const hourMarks: number[] = []
  for (let minute = startMinutes; minute <= endMinutes; minute += 60) {
    hourMarks.push(minute)
  }

  const propertiesWithVisits = properties.filter((property) =>
    visits.some((visit) => visit.propertyId === property.id),
  )

  if (propertiesWithVisits.length === 0) {
    return (
      <section className="card">
        <p className="subtitle">
          No visits scheduled for {formatAgendaDayLabel(dayViewDate)}.
        </p>
      </section>
    )
  }

  return (
    <section className="card operations-day-card">
      <div className="operations-day-header">
        <h2 className="section-title">{formatAgendaDayLabel(dayViewDate)}</h2>
        <p className="subtitle">
          Timeline 09:00–19:00 by property. Drag to move; drag edges to resize (30 min
          snap).
        </p>
      </div>

      {propertiesWithVisits.map((property) => (
        <PropertyDayTimeline
          key={property.id}
          property={property}
          propertyVisits={visits
            .filter((visit) => visit.propertyId === property.id)
            .sort((a, b) => a.scheduledStartTime.localeCompare(b.scheduledStartTime))}
          hourMarks={hourMarks}
          teamById={teamById}
          syncingVisitIds={syncingVisitIds}
          onVisitClick={onVisitClick}
          onVisitTimeChange={onVisitTimeChange}
        />
      ))}
    </section>
  )
}

type PropertyTimelineProps = {
  property: PropertyOption
  propertyVisits: VisitRecord[]
  hourMarks: number[]
  teamById: Map<string, string>
  syncingVisitIds: Set<string>
  onVisitClick: (visitId: string) => void
  onVisitTimeChange: (
    visitId: string,
    scheduledStartTime: string,
    scheduledEndTime: string,
  ) => void
}

function PropertyDayTimeline({
  property,
  propertyVisits,
  hourMarks,
  teamById,
  syncingVisitIds,
  onVisitClick,
  onVisitTimeChange,
}: PropertyTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null)
  const [previewRange, setPreviewRange] = useState<{
    visitId: string
    start: number
    end: number
  } | null>(null)
  const dragMovedRef = useRef(false)

  const overflow = getDayWindowOverflow(propertyVisits)
  const layoutSlots = buildVisitLayoutSlots(propertyVisits)
  const maxStack = Math.max(1, ...layoutSlots.map((slot) => slot.stackSize))

  const finishDrag = useCallback(
    (drag: ActiveDrag, nextStart: number, nextEnd: number) => {
      if (
        nextStart === drag.startMinutes &&
        nextEnd === drag.endMinutes
      ) {
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
    <div className="operations-day-property">
      <h3 className="operations-day-property-title">{getPropertyLabel(property)}</h3>
      <div className="operations-day-timeline">
        <div className="operations-day-hours">
          {hourMarks.map((minute) => (
            <span
              key={minute}
              className="operations-day-hour"
              style={{ left: `${minutesToPositionPercent(minute)}%` }}
            >
              {formatMinutesAsTime(minute)}
            </span>
          ))}
        </div>
        <div
          className={`operations-day-track-wrap${
            overflow.hasEarly ? ' has-early' : ''
          }${overflow.hasLate ? ' has-late' : ''}`}
        >
          {overflow.hasEarly ? (
            <span
              className="operations-day-overflow-indicator operations-day-overflow-indicator--start"
              title={`Visits before ${formatMinutesAsTime(DAY_VIEW_START_MINUTES)} (earliest ${formatMinutesAsTime(overflow.earliestBefore)})`}
            >
              ‹ {formatMinutesAsTime(overflow.earliestBefore)}
            </span>
          ) : null}
          {overflow.hasLate ? (
            <span
              className="operations-day-overflow-indicator operations-day-overflow-indicator--end"
              title={`Visits after ${formatMinutesAsTime(DAY_VIEW_END_MINUTES)} (latest ${formatMinutesAsTime(overflow.latestAfter)})`}
            >
              {formatMinutesAsTime(overflow.latestAfter)} ›
            </span>
          ) : null}
          <div
            ref={trackRef}
            className="operations-day-track"
            style={{ minHeight: `${maxStack * 36 + 48}px` }}
          >
            {layoutSlots.map((slot) => {
              const isDragging = previewRange?.visitId === slot.visit.id
              const range = isDragging ? previewRange! : slot
              const start = isDragging ? range.start : slot.start
              const end = isDragging ? range.end : slot.end
              const clipped = clipVisitToDayWindow(start, end)
              const visibleWidth = clipped.visualEnd - clipped.visualStart
              const left = minutesToPositionPercent(clipped.visualStart)
              const width = Math.max(
                2,
                minutesToPositionPercent(clipped.visualEnd) -
                  minutesToPositionPercent(clipped.visualStart),
              )
              const hasMultiTeamOverlap = slot.overlapTeamIds.some(
                (teamId) => teamId !== slot.visit.teamId,
              )
              const stripeTeams = hasMultiTeamOverlap
                ? [
                    slot.visit.teamId,
                    ...slot.overlapTeamIds.filter(
                      (teamId) => teamId !== slot.visit.teamId,
                    ),
                  ]
                : [slot.visit.teamId]
              const isSyncing = syncingVisitIds.has(slot.visit.id)
              const isEditable = !isTerminalVisit(slot.visit)
              const displayStart = isDragging ? start : slot.start
              const displayEnd = isDragging ? end : slot.end

              return (
                <div
                  key={slot.visit.id}
                  className={`operations-day-visit-block${
                    isTerminalVisit(slot.visit) ? ' is-terminal' : ''
                  }${slot.visit.status === 'COMPLETED' ? ' is-completed' : ''}${
                    slot.visit.status === 'CANCELLED' ? ' is-cancelled' : ''
                  }${slot.sameTeamOverlap ? ' has-same-team-overlap' : ''}${
                    isDragging ? ' is-dragging' : ''
                  }${isSyncing ? ' is-syncing' : ''}${
                    clipped.extendsBefore ? ' extends-before' : ''
                  }${clipped.extendsAfter ? ' extends-after' : ''}`}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    top: `${slot.stackIndex * 34}px`,
                    ...(hasMultiTeamOverlap
                      ? {
                          background: getTeamStripeGradient(
                            stripeTeams,
                            teamById,
                          ),
                        }
                      : getTeamColorStyle(slot.visit.teamId, teamById)),
                  }}
                  title={`${formatMinutesAsTime(displayStart)} – ${formatMinutesAsTime(displayEnd)} · ${slot.visit.title}`}
                >
                  {isEditable ? (
                    <>
                      <span
                        className="operations-day-resize-handle operations-day-resize-handle--start"
                        onPointerDown={(event) =>
                          beginDrag(event, slot.visit, 'resize-start')
                        }
                        aria-label="Resize start time"
                      />
                      <div
                        className="operations-day-block-body"
                        onPointerDown={(event) =>
                          beginDrag(event, slot.visit, 'move')
                        }
                        onClick={() => handleBlockClick(slot.visit.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            onVisitClick(slot.visit.id)
                          }
                        }}
                      >
                        {isSyncing ? (
                          <span
                            className="operations-sync-spinner operations-sync-spinner--block"
                            aria-hidden="true"
                          />
                        ) : null}
                        <span className="operations-day-visit-time">
                          {formatMinutesAsTime(displayStart)}
                          {visibleWidth > 0 && displayEnd !== displayStart
                            ? ` – ${formatMinutesAsTime(displayEnd)}`
                            : ''}
                        </span>
                        <span className="operations-day-visit-title">
                          {slot.visit.title}
                        </span>
                        <span className="operations-day-visit-team">
                          {teamById.get(slot.visit.teamId) ?? slot.visit.teamId}
                        </span>
                      </div>
                      <span
                        className="operations-day-resize-handle operations-day-resize-handle--end"
                        onPointerDown={(event) =>
                          beginDrag(event, slot.visit, 'resize-end')
                        }
                        aria-label="Resize end time"
                      />
                    </>
                  ) : (
                    <button
                      type="button"
                      className="operations-day-block-body operations-day-block-body--button"
                      onClick={() => onVisitClick(slot.visit.id)}
                    >
                      <span className="operations-day-visit-time">
                        {slot.visit.scheduledStartTime}
                      </span>
                      <span className="operations-day-visit-title">
                        {slot.visit.title}
                      </span>
                      <span className="operations-day-visit-team">
                        {teamById.get(slot.visit.teamId) ?? slot.visit.teamId}
                      </span>
                    </button>
                  )}
                  {slot.sameTeamOverlap && slot.stackSize > 1 ? (
                    <span className="operations-day-overlap-badge">
                      overlap {slot.stackIndex + 1}/{slot.stackSize}
                    </span>
                  ) : null}
                  {isTerminalVisit(slot.visit) ? (
                    <span className="operations-day-terminal-mark">
                      {slot.visit.status === 'COMPLETED' ? '✓' : '✕'}
                    </span>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
