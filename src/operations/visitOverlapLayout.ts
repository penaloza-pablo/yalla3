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

const buildTimeOverlapComponents = (visits: VisitRecord[]) => {
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

const buildTeamOverlapComponents = (visits: VisitRecord[]) =>
  buildTimeOverlapComponents(visits)

const clusterKeyForVisits = (visits: VisitRecord[]) =>
  visits
    .map((visit) => visit.id)
    .sort()
    .join('|')

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

export const DAY_VISIT_HEIGHT = 30
export const DAY_BOOKING_HEIGHT = 46
export const DAY_LANE_HEIGHT = DAY_BOOKING_HEIGHT
export const DAY_OVERLAP_STEP = DAY_BOOKING_HEIGHT - DAY_VISIT_HEIGHT

export const visitBlockTop = (entry: DayTimelineVisit) => {
  const base = Math.round((DAY_BOOKING_HEIGHT - DAY_VISIT_HEIGHT) / 2)
  if (entry.isClusterExpanded) {
    return entry.laneIndex * DAY_LANE_HEIGHT + base
  }
  return base + entry.stackLayer * DAY_OVERLAP_STEP
}

export type DayTimelineVisit = {
  visit: VisitRecord
  start: number
  end: number
  hasTimeOverlap: boolean
  overlapCount: number
  stackLayer: number
  clusterKey: string
  clusterSize: number
  isMultiTeamOverlap: boolean
  isClusterExpanded: boolean
  laneIndex: number
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

  const clusterByVisitId = new Map<
    string,
    { key: string; isMultiTeam: boolean; size: number; stackLayer: number }
  >()
  buildTimeOverlapComponents(sorted).forEach((component) => {
    const key = clusterKeyForVisits(component)
    const isMultiTeam = new Set(component.map((visit) => visit.teamId)).size > 1
    const ordered = [...component].sort(
      (a, b) =>
        getVisitTimeRange(a).start - getVisitTimeRange(b).start ||
        a.scheduledStartTime.localeCompare(b.scheduledStartTime) ||
        a.id.localeCompare(b.id),
    )
    ordered.forEach((visit, index) => {
      clusterByVisitId.set(visit.id, {
        key,
        isMultiTeam,
        size: component.length,
        stackLayer: component.length > 1 ? index : 0,
      })
    })
  })

  const items: DayTimelineVisit[] = sorted.map((visit) => {
    const { start, end } = getVisitTimeRange(visit)
    const cluster = clusterByVisitId.get(visit.id)
    return {
      visit,
      start,
      end,
      hasTimeOverlap: (cluster?.size ?? 1) > 1,
      overlapCount: cluster?.size ?? 1,
      stackLayer: cluster?.stackLayer ?? 0,
      clusterKey: cluster?.key ?? visit.id,
      clusterSize: cluster?.size ?? 1,
      isMultiTeamOverlap: cluster?.isMultiTeam ?? false,
      isClusterExpanded: false,
      laneIndex: 0,
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

  return items
}

export const layoutDayTimelineVisits = (
  items: DayTimelineVisit[],
  expandedClusterKeys: Set<string>,
  teamById: Map<string, string>,
): { items: DayTimelineVisit[]; channelHeight: number } => {
  const membersByCluster = new Map<string, DayTimelineVisit[]>()
  items.forEach((item) => {
    const members = membersByCluster.get(item.clusterKey) ?? []
    members.push(item)
    membersByCluster.set(item.clusterKey, members)
  })

  const laneByVisitId = new Map<string, number>()
  const expandedByCluster = new Map<string, boolean>()
  let channelHeight = DAY_LANE_HEIGHT

  membersByCluster.forEach((members, clusterKey) => {
    const shouldExpand =
      members.length > 1 && expandedClusterKeys.has(clusterKey)
    expandedByCluster.set(clusterKey, shouldExpand)
    if (!shouldExpand) {
      members.forEach((member) => laneByVisitId.set(member.visit.id, 0))
      const maxLayer = Math.max(0, ...members.map((member) => member.stackLayer))
      channelHeight = Math.max(
        channelHeight,
        DAY_BOOKING_HEIGHT + maxLayer * DAY_OVERLAP_STEP,
      )
      return
    }

    const sortedMembers = [...members].sort(
      (a, b) =>
        a.start - b.start ||
        compareTeamTimeTieBreak(a.visit.teamId, b.visit.teamId, teamById) ||
        a.visit.id.localeCompare(b.visit.id),
    )
    sortedMembers.forEach((member, index) => {
      laneByVisitId.set(member.visit.id, index)
    })
    channelHeight = Math.max(
      channelHeight,
      sortedMembers.length * DAY_LANE_HEIGHT,
    )
  })

  const nextItems = items.map((item) => ({
    ...item,
    isClusterExpanded: expandedByCluster.get(item.clusterKey) ?? false,
    laneIndex: laneByVisitId.get(item.visit.id) ?? 0,
  }))

  return { items: nextItems, channelHeight }
}

export const dayVisitExpandsOverlapOnClick = (entry: DayTimelineVisit) =>
  entry.hasTimeOverlap && !entry.isClusterExpanded

export const pointerHitsCollapsedVisitOverlap = (
  entry: DayTimelineVisit,
  items: DayTimelineVisit[],
  minutes: number,
  _offsetY?: number,
) => {
  if (!dayVisitExpandsOverlapOnClick(entry)) {
    return false
  }
  if (minutes < entry.start || minutes >= entry.end) {
    return false
  }
  return items.some(
    (other) =>
      other.visit.id !== entry.visit.id &&
      minutes >= other.start &&
      minutes < other.end,
  )
}

export const dayTimelineHasOverlaps = (items: DayTimelineVisit[]) =>
  items.some((item) => item.hasTimeOverlap)

export const formatVisitBarTitle = (
  visit: VisitRecord,
  options?: { roomLabel?: string },
) => {
  const roomSuffix = options?.roomLabel ? ` (${options.roomLabel})` : ''
  return `${visit.title.trim()}${roomSuffix}`
}

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
