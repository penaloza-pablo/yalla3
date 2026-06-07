import { compareTeamTimeTieBreak } from './teamColors'
import { getVisitTimeRange } from './operationsViewHelpers'
import type { VisitRecord } from './types'

export type VisitOverlapUnit = {
  key: string
  teamId: string
  visits: VisitRecord[]
  start: number
  end: number
  teamLane: number
  top: number
  collapsed: boolean
}

const rangesOverlap = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
) => aStart < bEnd && bStart < aEnd

const buildTeamOverlapComponents = (visits: VisitRecord[]) => {
  const sorted = [...visits].sort(
    (a, b) =>
      getVisitTimeRange(a).start - getVisitTimeRange(b).start ||
      a.scheduledStartTime.localeCompare(b.scheduledStartTime) ||
      a.id.localeCompare(b.id),
  )

  const parent = sorted.map((_, index) => index)

  const find = (index: number): number => {
    if (parent[index] !== index) {
      parent[index] = find(parent[index])
    }
    return parent[index]
  }

  const union = (left: number, right: number) => {
    const rootLeft = find(left)
    const rootRight = find(right)
    if (rootLeft !== rootRight) {
      parent[rootRight] = rootLeft
    }
  }

  sorted.forEach((visit, index) => {
    const { start, end } = getVisitTimeRange(visit)
    for (let otherIndex = index + 1; otherIndex < sorted.length; otherIndex += 1) {
      const other = sorted[otherIndex]
      const otherRange = getVisitTimeRange(other)
      if (otherRange.start >= end) {
        break
      }
      if (rangesOverlap(start, end, otherRange.start, otherRange.end)) {
        union(index, otherIndex)
      }
    }
  })

  const components = new Map<number, VisitRecord[]>()
  sorted.forEach((visit, index) => {
    const root = find(index)
    const group = components.get(root) ?? []
    group.push(visit)
    components.set(root, group)
  })

  return [...components.values()]
}

const getUnitHeight = (
  unit: VisitOverlapUnit,
  expandedGroupKeys: Set<string>,
  laneHeight: number,
) => {
  const isExpanded = expandedGroupKeys.has(unit.key)
  if (unit.collapsed && isExpanded) {
    return unit.visits.length * laneHeight + 20
  }
  return laneHeight
}

export const buildVisitOverlapUnits = (visits: VisitRecord[]): VisitOverlapUnit[] => {
  const byTeam = new Map<string, VisitRecord[]>()
  visits.forEach((visit) => {
    const group = byTeam.get(visit.teamId) ?? []
    group.push(visit)
    byTeam.set(visit.teamId, group)
  })

  const units: VisitOverlapUnit[] = []

  byTeam.forEach((teamVisits, teamId) => {
    buildTeamOverlapComponents(teamVisits).forEach((component, index) => {
      const ranges = component.map((visit) => getVisitTimeRange(visit))
      const start = Math.min(...ranges.map((range) => range.start))
      const end = Math.max(...ranges.map((range) => range.end))
      const visitIds = component
        .map((visit) => visit.id)
        .sort()
        .join('|')

      units.push({
        key: `${teamId}|${start}|${visitIds}|${index}`,
        teamId,
        visits: component,
        start,
        end,
        teamLane: 0,
        top: 0,
        collapsed: component.length > 1,
      })
    })
  })

  return units.sort(
    (a, b) => a.start - b.start || a.end - b.end || a.key.localeCompare(b.key),
  )
}

const getEarliestStartForTeam = (
  units: VisitOverlapUnit[],
  teamId: string,
) =>
  Math.min(
    ...units.filter((unit) => unit.teamId === teamId).map((unit) => unit.start),
  )

const sortTeamIdsByEarliestStart = (
  units: VisitOverlapUnit[],
  teamById: Map<string, string>,
) =>
  [...new Set(units.map((unit) => unit.teamId))].sort((teamIdA, teamIdB) => {
    const startA = getEarliestStartForTeam(units, teamIdA)
    const startB = getEarliestStartForTeam(units, teamIdB)
    if (startA !== startB) {
      return startA - startB
    }
    return compareTeamTimeTieBreak(teamIdA, teamIdB, teamById)
  })

export const assignUnitVerticalPositions = (
  units: VisitOverlapUnit[],
  teamById: Map<string, string>,
  expandedGroupKeys: Set<string>,
  laneHeight: number,
) => {
  if (units.length === 0) {
    return laneHeight
  }

  const teamOrder = sortTeamIdsByEarliestStart(units, teamById)
  const teamLaneIndex = new Map(
    teamOrder.map((teamId, index) => [teamId, index]),
  )

  let currentTop = 0

  teamOrder.forEach((teamId) => {
    const teamUnits = units
      .filter((unit) => unit.teamId === teamId)
      .sort((a, b) => a.start - b.start || a.key.localeCompare(b.key))

    let offsetInTeam = 0
    teamUnits.forEach((unit) => {
      unit.teamLane = teamLaneIndex.get(teamId) ?? teamOrder.length
      unit.top = currentTop + offsetInTeam
      offsetInTeam += getUnitHeight(unit, expandedGroupKeys, laneHeight)
    })

    currentTop += offsetInTeam
  })

  return Math.max(currentTop, laneHeight)
}

export type DayTimelineVisit = {
  visit: VisitRecord
  start: number
  end: number
  hasTimeOverlap: boolean
  overlapCount: number
  stackLayer: number
}

export const buildDayTimelineVisits = (
  visits: VisitRecord[],
): DayTimelineVisit[] => {
  const sorted = [...visits].sort(
    (a, b) =>
      getVisitTimeRange(a).start - getVisitTimeRange(b).start ||
      a.scheduledStartTime.localeCompare(b.scheduledStartTime) ||
      a.id.localeCompare(b.id),
  )

  const items: DayTimelineVisit[] = sorted.map((visit) => {
    const { start, end } = getVisitTimeRange(visit)
    return {
      visit,
      start,
      end,
      hasTimeOverlap: false,
      overlapCount: 1,
      stackLayer: 0,
    }
  })

  items.forEach((item) => {
    const overlapping = items.filter(
      (other) =>
        other.visit.id !== item.visit.id &&
        rangesOverlap(item.start, item.end, other.start, other.end),
    )
    item.hasTimeOverlap = overlapping.length > 0
    item.overlapCount = overlapping.length + 1
  })

  items.forEach((item) => {
    if (!item.hasTimeOverlap) {
      return
    }
    const cluster = items
      .filter((other) =>
        rangesOverlap(item.start, item.end, other.start, other.end),
      )
      .sort(
        (a, b) =>
          a.start - b.start ||
          a.visit.scheduledStartTime.localeCompare(b.visit.scheduledStartTime) ||
          a.visit.id.localeCompare(b.visit.id),
      )
    item.stackLayer = cluster.findIndex(
      (entry) => entry.visit.id === item.visit.id,
    )
  })

  return items
}

export const dayTimelineHasOverlaps = (items: DayTimelineVisit[]) =>
  items.some((item) => item.hasTimeOverlap)

export const formatVisitSummaryLine = (
  visit: VisitRecord,
  options?: { roomLabel?: string; endTime?: string },
) => {
  const start = visit.scheduledStartTime || '—'
  const end = options?.endTime?.trim()
  const timeLabel = end && end !== start ? `${start} – ${end}` : start
  const roomSuffix = options?.roomLabel ? ` (${options.roomLabel})` : ''
  return `${timeLabel} - ${visit.title.trim()}${roomSuffix}`
}
