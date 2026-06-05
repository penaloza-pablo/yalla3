import { useState } from 'react'
import { getPropertyLabel } from './propertyHelpers'
import {
  formatAgendaDayLabel,
  groupVisitsByPropertyAndDate,
  isTerminalVisit,
} from './operationsViewHelpers'
import { getTeamColorStyle } from './teamColors'
import type { PropertyOption, VisitRecord } from './types'

const DRAG_MIME = 'application/x-yalla-visit'

type DragPayload = {
  visitId: string
  propertyId: string
  sourceDate: string
}

type Props = {
  dates: string[]
  properties: PropertyOption[]
  visits: VisitRecord[]
  teamById: Map<string, string>
  syncingVisitIds: Set<string>
  onVisitClick: (visitId: string) => void
  onDayHeaderClick: (date: string) => void
  onEmptyCellClick: (propertyId: string, date: string) => void
  onVisitReschedule: (visitId: string, newDate: string) => void
}

export function OperationsAgendaView({
  dates,
  properties,
  visits,
  teamById,
  syncingVisitIds,
  onVisitClick,
  onDayHeaderClick,
  onEmptyCellClick,
  onVisitReschedule,
}: Props) {
  const propertyIds = properties.map((property) => property.id)
  const visitsByCell = groupVisitsByPropertyAndDate(visits, propertyIds, dates)
  const [dragOverCell, setDragOverCell] = useState<string | null>(null)

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
    propertyId: string,
    date: string,
  ) => {
    const payload = parseDragPayload(event)
    if (!payload || payload.propertyId !== propertyId) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverCell(`${propertyId}|${date}`)
  }

  const handleDrop = (
    event: React.DragEvent<HTMLTableCellElement>,
    propertyId: string,
    date: string,
  ) => {
    event.preventDefault()
    setDragOverCell(null)
    const payload = parseDragPayload(event)
    if (!payload || payload.propertyId !== propertyId) {
      return
    }
    if (payload.sourceDate === date) {
      return
    }
    onVisitReschedule(payload.visitId, date)
  }

  return (
    <section className="card operations-agenda-card">
      <div className="operations-agenda-scroll">
        <table className="operations-agenda-table">
          <thead>
            <tr>
              <th className="operations-agenda-property-header">Property</th>
              {dates.map((date) => (
                <th key={date} className="operations-agenda-day-header">
                  <button
                    type="button"
                    className="operations-agenda-day-button"
                    onClick={() => onDayHeaderClick(date)}
                  >
                    {formatAgendaDayLabel(date)}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {properties.map((property) => (
              <tr key={property.id}>
                <th className="operations-agenda-property-cell" scope="row">
                  {getPropertyLabel(property)}
                </th>
                {dates.map((date) => {
                  const cellKey = `${property.id}|${date}`
                  const cellVisits = visitsByCell.get(cellKey) ?? []
                  const isEmpty = cellVisits.length === 0
                  const isDropTarget = dragOverCell === cellKey

                  return (
                    <td
                      key={`${property.id}-${date}`}
                      className={`operations-agenda-cell${
                        isDropTarget ? ' is-drop-target' : ''
                      }`}
                      onDragOver={(event) =>
                        handleDragOver(event, property.id, date)
                      }
                      onDragLeave={() => {
                        if (dragOverCell === cellKey) {
                          setDragOverCell(null)
                        }
                      }}
                      onDrop={(event) => handleDrop(event, property.id, date)}
                    >
                      {isEmpty ? (
                        <button
                          type="button"
                          className="operations-agenda-empty-cell"
                          onClick={() => onEmptyCellClick(property.id, date)}
                          aria-label={`Create visit for ${getPropertyLabel(property)} on ${date}`}
                        />
                      ) : (
                        <div className="operations-agenda-cell-visits">
                          {cellVisits.map((visit) => {
                            const isSyncing = syncingVisitIds.has(visit.id)
                            const isDraggable = !isTerminalVisit(visit)

                            return (
                              <button
                                key={visit.id}
                                type="button"
                                draggable={isDraggable}
                                className={`operations-agenda-visit-chip${
                                  isTerminalVisit(visit) ? ' is-terminal' : ''
                                }${visit.status === 'CANCELLED' ? ' is-cancelled' : ''}${
                                  visit.status === 'COMPLETED' ? ' is-completed' : ''
                                }${isDraggable ? ' is-draggable' : ''}${
                                  isSyncing ? ' is-syncing' : ''
                                }`}
                                style={getTeamColorStyle(visit.teamId, teamById)}
                                onClick={() => onVisitClick(visit.id)}
                                onDragStart={(event) => handleDragStart(event, visit)}
                                title={visit.title}
                              >
                                {isSyncing ? (
                                  <span
                                    className="operations-sync-spinner"
                                    aria-hidden="true"
                                  />
                                ) : null}
                                <span className="operations-agenda-visit-time">
                                  {visit.scheduledStartTime || '—'}
                                </span>
                                <span className="operations-agenda-visit-title">
                                  {visit.title}
                                </span>
                                {isTerminalVisit(visit) ? (
                                  <span className="operations-agenda-terminal-mark">
                                    {visit.status === 'COMPLETED' ? '✓' : '✕'}
                                  </span>
                                ) : null}
                              </button>
                            )
                          })}
                        </div>
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
