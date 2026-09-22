export type PlanResourceSlot = {
  id: string
  title: string
  resourceId: string
  startMinutes: number
  durationMinutes: number
}

export type PlanResourceOverlap = {
  resourceId: string
  first: PlanResourceSlot
  second: PlanResourceSlot
}

export type OverlapMessageParams = {
  name: string
  first: string
  firstTime: string
  second: string
  secondTime: string
  earliest: string
}

export const timeToMinutes = (value: string): number | null => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) {
    return null
  }
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null
  }
  return hours * 60 + minutes
}

export const minutesToTime = (totalMinutes: number) => {
  const normalized = Math.max(0, Math.round(totalMinutes))
  const hours = Math.floor(normalized / 60) % 24
  const minutes = normalized % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const intervalsOverlap = (left: PlanResourceSlot, right: PlanResourceSlot) =>
  left.startMinutes < right.startMinutes + right.durationMinutes &&
  right.startMinutes < left.startMinutes + left.durationMinutes

const orderSlots = (left: PlanResourceSlot, right: PlanResourceSlot) => {
  if (left.startMinutes !== right.startMinutes) {
    return left.startMinutes < right.startMinutes
      ? ([left, right] as const)
      : ([right, left] as const)
  }
  return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }) <=
    0
    ? ([left, right] as const)
    : ([right, left] as const)
}

export const findPlanResourceOverlaps = (
  slots: PlanResourceSlot[],
): PlanResourceOverlap[] => {
  const byResource = new Map<string, PlanResourceSlot[]>()
  for (const slot of slots) {
    const resourceId = slot.resourceId.trim()
    if (!resourceId || !Number.isFinite(slot.startMinutes)) {
      continue
    }
    const durationMinutes = Number(slot.durationMinutes)
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      continue
    }
    const current = byResource.get(resourceId)
    if (current) {
      current.push(slot)
    } else {
      byResource.set(resourceId, [slot])
    }
  }

  const overlaps: PlanResourceOverlap[] = []
  for (const [resourceId, resourceSlots] of byResource) {
    if (resourceSlots.length < 2) {
      continue
    }
    for (let index = 0; index < resourceSlots.length; index += 1) {
      const current = resourceSlots[index]
      for (let nextIndex = index + 1; nextIndex < resourceSlots.length; nextIndex += 1) {
        const candidate = resourceSlots[nextIndex]
        if (!intervalsOverlap(current, candidate)) {
          continue
        }
        const [first, second] = orderSlots(current, candidate)
        overlaps.push({ resourceId, first, second })
      }
    }
  }
  return overlaps
}

export const overlapMessageParams = (
  overlap: PlanResourceOverlap,
  resourceName: string,
): OverlapMessageParams => ({
  name: resourceName.trim() || overlap.resourceId,
  first: overlap.first.title,
  firstTime: minutesToTime(overlap.first.startMinutes),
  second: overlap.second.title,
  secondTime: minutesToTime(overlap.second.startMinutes),
  earliest: minutesToTime(
    overlap.first.startMinutes + overlap.first.durationMinutes,
  ),
})

export const overlapErrorMessage = (
  overlap: PlanResourceOverlap,
  resourceName: string,
) => {
  const params = overlapMessageParams(overlap, resourceName)
  return `${params.name} cannot cover ${params.first} (${params.firstTime}) and ${params.second} (${params.secondTime}) with the configured duration. ${params.second} must start at ${params.earliest} or later.`
}
