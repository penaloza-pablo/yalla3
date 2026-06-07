import { useMemo, useState } from 'react'
import { getPropertyLabel } from './propertyHelpers'
import {
  getMtlGroupLabel,
  isPropertyIdInScope,
  type MtlDisplayRow,
} from './mtlPropertyHelpers'
import {
  formatAgendaDayLabel,
  isTerminalVisit,
} from './operationsViewHelpers'
import { getTeamColorStyle } from './teamColors'
import {
  assignUnitVerticalPositions,
  buildVisitOverlapUnits,
  formatVisitSummaryLine,
  type VisitOverlapUnit,
} from './visitOverlapLayout'
import type { PropertyOption, VisitRecord } from './types'

const DRAG_MIME = 'application/x-yalla-visit'
const AGENDA_LANE_HEIGHT = 26

type DragPayload = {
  visitId: string
  propertyId: string
  sourceDate: string
}

type Props = {
  dates: string[]
  displayRows: MtlDisplayRow[]
  visits: VisitRecord[]
  propertyById: Map<string, string>
  teamById: Map<string, string>
  syncingVisitIds: Set<string>
  shiftDays: number
  onVisitClick: (visitId: string) => void
  onDayHeaderClick: (date: string) => void
  onEmptyCellClick: (propertyId: string, date: string) => void
  onVisitReschedule: (visitId: string, newDate: string) => void
  onShiftDates: (deltaDays: number) => void
}

type AgendaTableRow = {
  key: string
  property: PropertyOption
  propertyLabel: string
  propertyIds: string[]
  createPropertyId: string
  isChildRow: boolean
  isMtlGroupHeader: boolean
  mtlPrincipalId?: string
  showRoomLabel: boolean
  canExpand?: boolean
  isExpanded?: boolean
}

export function OperationsAgendaView({
  dates,
  displayRows,
  visits,
  propertyById,
  teamById,
  syncingVisitIds,
  shiftDays,
  onVisitClick,
  onDayHeaderClick,
  onEmptyCellClick,
  onVisitReschedule,
  onShiftDates,
}: Props) {
  const [expandedMtlIds, setExpandedMtlIds] = useState<Set<string>>(new Set())
  const [dragOverCell, setDragOverCell] = useState<string | null>(null)

  const tableRows = useMemo(() => {
    const rows: AgendaTableRow[] = []

    displayRows.forEach((row) => {
      if (row.kind === 'standalone') {
        rows.push({
          key: row.property.id,
          property: row.property,
          propertyLabel: getPropertyLabel(row.property),
          propertyIds: row.propertyIds,
          createPropertyId: row.property.id,
          isChildRow: false,
          isMtlGroupHeader: false,
          showRoomLabel: false,
        })
        return
      }

      const isExpanded = expandedMtlIds.has(row.principal.id)
      rows.push({
        key: row.principal.id,
        property: row.principal,
        propertyLabel: getMtlGroupLabel(row),
        propertyIds: isExpanded ? [row.principal.id] : row.propertyIds,
        createPropertyId: row.principal.id,
        isChildRow: false,
        isMtlGroupHeader: true,
        mtlPrincipalId: row.principal.id,
        showRoomLabel: !isExpanded,
        canExpand: true,
        isExpanded,
      })

      if (isExpanded) {
        row.children.forEach((child) => {
          rows.push({
            key: `${row.principal.id}:${child.id}`,
            property: child,
            propertyLabel: getPropertyLabel(child),
            propertyIds: [child.id],
            createPropertyId: child.id,
            isChildRow: true,
            isMtlGroupHeader: false,
            mtlPrincipalId: row.principal.id,
            showRoomLabel: false,
          })
        })
      }
    })

    return rows
  }, [displayRows, expandedMtlIds])

  const parseDragPayload = (event: React.DragEvent): DragPayload | null => {
    const raw = event.dataTransfer.getData(DRAG_MIME)
    if (!raw) {
      return null
    }
    try {
      return JSON.parse(raw) as DragPayload
    } catch {
      return null
    }
  }

  const handleDragStart = (
    event: React.DragEvent<HTMLButtonElement>,
    visit: VisitRecord,
  ) => {
    if (isTerminalVisit(visit)) {
      event.preventDefault()
      return
    }
    const payload: DragPayload = {
      visitId: visit.id,
      propertyId: visit.propertyId,
      sourceDate: visit.scheduledDate,
    }
    event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (
    event: React.DragEvent<HTMLTableCellElement>,
    propertyIds: string[],
    cellKey: string,
  ) => {
    const payload = parseDragPayload(event)
    if (!payload || !isPropertyIdInScope(payload.propertyId, propertyIds)) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverCell(cellKey)
  }

  const handleDrop = (
    event: React.DragEvent<HTMLTableCellElement>,
    propertyIds: string[],
    date: string,
  ) => {
    event.preventDefault()
    setDragOverCell(null)
    const payload = parseDragPayload(event)
    if (!payload || !isPropertyIdInScope(payload.propertyId, propertyIds)) {
      return
    }
    if (payload.sourceDate === date) {
      return
    }
    onVisitReschedule(payload.visitId, date)
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
    <section className="card operations-agenda-card">
      <div className="operations-agenda-scroll">
        <table className="operations-agenda-table">
          <thead>
            <tr>
              <th className="operations-agenda-property-header">Property</th>
              <th
                colSpan={dates.length}
                className="operations-agenda-dates-header"
              >
                <div className="operations-agenda-dates-nav">
                  <button
                    type="button"
                    className="operations-range-nav"
                    aria-label="Previous days"
                    title={`Previous ${shiftDays} days`}
                    onClick={() => onShiftDates(-shiftDays)}
                  >
                    &laquo;
                  </button>
                  <div className="operations-agenda-day-labels">
                    {dates.map((date) => (
                      <div key={date} className="operations-agenda-day-header">
                        <button
                          type="button"
                          className="operations-agenda-day-button"
                          onClick={() => onDayHeaderClick(date)}
                        >
                          {formatAgendaDayLabel(date)}
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="operations-range-nav"
                    aria-label="Next days"
                    title={`Next ${shiftDays} days`}
                    onClick={() => onShiftDates(shiftDays)}
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
                className={
                  row.isChildRow ? 'operations-agenda-row-child' : undefined
                }
              >
                <th
                  className={`operations-agenda-property-cell${
                    row.isChildRow ? ' is-child' : ''
                  }${row.isMtlGroupHeader ? ' is-mtl-header' : ''}`}
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
                {dates.map((date) => {
                  const cellKey = `${row.key}|${date}`
                  const cellVisits = visits.filter(
                    (visit) =>
                      visit.scheduledDate === date &&
                      row.propertyIds.includes(visit.propertyId),
                  )
                  const isEmpty = cellVisits.length === 0
                  const isDropTarget = dragOverCell === cellKey

                  return (
                    <td
                      key={`${row.key}-${date}`}
                      className={`operations-agenda-cell${
                        isDropTarget ? ' is-drop-target' : ''
                      }${row.isChildRow ? ' is-child' : ''}`}
                      onDragOver={(event) =>
                        handleDragOver(event, row.propertyIds, cellKey)
                      }
                      onDragLeave={() => {
                        if (dragOverCell === cellKey) {
                          setDragOverCell(null)
                        }
                      }}
                      onDrop={(event) =>
                        handleDrop(event, row.propertyIds, date)
                      }
                    >
                      {isEmpty ? (
                        <button
                          type="button"
                          className="operations-agenda-empty-cell"
                          onClick={() =>
                            onEmptyCellClick(row.createPropertyId, date)
                          }
                          aria-label={`Create visit for ${row.propertyLabel} on ${date}`}
                        />
                      ) : (
                        <AgendaVisitStack
                          visits={cellVisits}
                          propertyById={propertyById}
                          teamById={teamById}
                          syncingVisitIds={syncingVisitIds}
                          showRoomLabel={row.showRoomLabel}
                          onVisitClick={onVisitClick}
                          onDragStart={handleDragStart}
                        />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

type AgendaVisitStackProps = {
  visits: VisitRecord[]
  propertyById: Map<string, string>
  teamById: Map<string, string>
  syncingVisitIds: Set<string>
  showRoomLabel: boolean
  onVisitClick: (visitId: string) => void
  onDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    visit: VisitRecord,
  ) => void
}

function AgendaVisitStack({
  visits,
  propertyById,
  teamById,
  syncingVisitIds,
  showRoomLabel,
  onVisitClick,
  onDragStart,
}: AgendaVisitStackProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const units = buildVisitOverlapUnits(visits)
  const totalHeight = assignUnitVerticalPositions(
    units,
    teamById,
    expandedGroups,
    AGENDA_LANE_HEIGHT,
  )

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current)
      if (next.has(groupKey)) {
        next.delete(groupKey)
      } else {
        next.add(groupKey)
      }
      return next
    })
  }

  return (
    <div
      className="operations-agenda-cell-visits operations-agenda-cell-visits--stacked"
      style={{ minHeight: `${Math.max(totalHeight, AGENDA_LANE_HEIGHT)}px` }}
    >
      {units.map((unit) => (
        <AgendaOverlapUnit
          key={unit.key}
          unit={unit}
          top={unit.top}
          teamById={teamById}
          propertyById={propertyById}
          syncingVisitIds={syncingVisitIds}
          showRoomLabel={showRoomLabel}
          isExpanded={expandedGroups.has(unit.key)}
          onToggleExpand={() => toggleGroup(unit.key)}
          onVisitClick={onVisitClick}
          onDragStart={onDragStart}
        />
      ))}
    </div>
  )
}

type AgendaOverlapUnitProps = {
  unit: VisitOverlapUnit
  top: number
  teamById: Map<string, string>
  propertyById: Map<string, string>
  syncingVisitIds: Set<string>
  showRoomLabel: boolean
  isExpanded: boolean
  onToggleExpand: () => void
  onVisitClick: (visitId: string) => void
  onDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    visit: VisitRecord,
  ) => void
}

function AgendaOverlapUnit({
  unit,
  top,
  teamById,
  propertyById,
  syncingVisitIds,
  showRoomLabel,
  isExpanded,
  onToggleExpand,
  onVisitClick,
  onDragStart,
}: AgendaOverlapUnitProps) {
  const primaryVisit = unit.visits[0]
  const roomLabel = showRoomLabel
    ? propertyById.get(primaryVisit.propertyId)
    : undefined

  if (unit.collapsed && !isExpanded) {
    const anySyncing = unit.visits.some((visit) => syncingVisitIds.has(visit.id))
    const allTerminal = unit.visits.every((visit) => isTerminalVisit(visit))

    return (
      <button
        type="button"
        className={`operations-agenda-visit-chip operations-agenda-visit-chip--compact${
          allTerminal ? ' is-terminal' : ''
        }${anySyncing ? ' is-syncing' : ''} is-overlap-group`}
        style={{
          ...getTeamColorStyle(unit.teamId, teamById),
          top: `${top}px`,
        }}
        onClick={(event) => {
          event.stopPropagation()
          onToggleExpand()
        }}
        title={unit.visits
          .map((visit) =>
            formatVisitSummaryLine(visit, {
              roomLabel: showRoomLabel
                ? propertyById.get(visit.propertyId)
                : undefined,
            }),
          )
          .join('\n')}
      >
        {anySyncing ? (
          <span className="operations-sync-spinner" aria-hidden="true" />
        ) : null}
        <span className="operations-agenda-visit-summary">
          {formatVisitSummaryLine(primaryVisit, { roomLabel })}
        </span>
        <span className="operations-agenda-overlap-count">
          ×{unit.visits.length}
        </span>
      </button>
    )
  }

  if (unit.collapsed && isExpanded) {
    return (
      <div
        className="operations-agenda-overlap-expanded"
        style={{ top: `${top}px` }}
      >
        {unit.visits.map((visit, index) => (
          <AgendaVisitChip
            key={visit.id}
            visit={visit}
            teamById={teamById}
            syncingVisitIds={syncingVisitIds}
            showRoomLabel={showRoomLabel}
            roomLabel={propertyById.get(visit.propertyId)}
            top={index * AGENDA_LANE_HEIGHT}
            onVisitClick={onVisitClick}
            onDragStart={onDragStart}
          />
        ))}
        <button
          type="button"
          className="operations-agenda-collapse-group"
          onClick={(event) => {
            event.stopPropagation()
            onToggleExpand()
          }}
        >
          Collapse
        </button>
      </div>
    )
  }

  return (
    <AgendaVisitChip
      visit={primaryVisit}
      teamById={teamById}
      syncingVisitIds={syncingVisitIds}
      showRoomLabel={showRoomLabel}
      roomLabel={roomLabel}
      top={top}
      onVisitClick={onVisitClick}
      onDragStart={onDragStart}
    />
  )
}

type AgendaVisitChipProps = {
  visit: VisitRecord
  teamById: Map<string, string>
  syncingVisitIds: Set<string>
  showRoomLabel: boolean
  roomLabel?: string
  top: number
  onVisitClick: (visitId: string) => void
  onDragStart: (
    event: React.DragEvent<HTMLButtonElement>,
    visit: VisitRecord,
  ) => void
}

function AgendaVisitChip({
  visit,
  teamById,
  syncingVisitIds,
  showRoomLabel,
  roomLabel,
  top,
  onVisitClick,
  onDragStart,
}: AgendaVisitChipProps) {
  const isSyncing = syncingVisitIds.has(visit.id)
  const isDraggable = !isTerminalVisit(visit)

  return (
    <button
      type="button"
      draggable={isDraggable}
      className={`operations-agenda-visit-chip operations-agenda-visit-chip--compact${
        isTerminalVisit(visit) ? ' is-terminal' : ''
      }${visit.status === 'CANCELLED' ? ' is-cancelled' : ''}${
        visit.status === 'COMPLETED' ? ' is-completed' : ''
      }${isDraggable ? ' is-draggable' : ''}${isSyncing ? ' is-syncing' : ''}`}
      style={{
        ...getTeamColorStyle(visit.teamId, teamById),
        top: `${top}px`,
      }}
      onClick={() => onVisitClick(visit.id)}
      onDragStart={(event) => onDragStart(event, visit)}
      title={formatVisitSummaryLine(visit, {
        roomLabel: showRoomLabel ? roomLabel : undefined,
      })}
    >
      {isSyncing ? (
        <span className="operations-sync-spinner" aria-hidden="true" />
      ) : null}
      <span className="operations-agenda-visit-summary">
        {formatVisitSummaryLine(visit, {
          roomLabel: showRoomLabel ? roomLabel : undefined,
        })}
      </span>
      {isTerminalVisit(visit) ? (
        <span className="operations-agenda-terminal-mark">
          {visit.status === 'COMPLETED' ? '✓' : '✕'}
        </span>
      ) : null}
    </button>
  )
}
