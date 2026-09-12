import { addDaysToDateString, getTodayMadrid } from './dateHelpers'
import type { VisitRecord } from './types'
import i18n from '../i18n'

export const AGENDA_DAY_COUNT = 7

export const getAgendaDateRange = (anchorDate = getTodayMadrid()) => ({
  from: anchorDate,
  to: addDaysToDateString(anchorDate, AGENDA_DAY_COUNT - 1),
  dates: Array.from({ length: AGENDA_DAY_COUNT }, (_, index) =>
    addDaysToDateString(anchorDate, index),
  ),
})

export const parseTimeToMinutes = (value?: string) => {
  const match = value?.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) {
    return 0
  }
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return 0
  }
  return hours * 60 + minutes
}

export const formatMinutesAsTime = (minutes: number) => {
  const safe = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)))
  const hours = Math.floor(safe / 60)
  const mins = safe % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

export const addHoursToTimeString = (
  startTime: string,
  durationHours: number,
) => {
  const start = parseTimeToMinutes(startTime)
  if (!startTime.trim() || !Number.isFinite(durationHours) || durationHours <= 0) {
    return ''
  }
  return formatMinutesAsTime(start + Math.round(durationHours * 60))
}

export const getVisitTimeRange = (visit: VisitRecord) => {
  const start = parseTimeToMinutes(visit.scheduledStartTime)
  let end = parseTimeToMinutes(visit.scheduledEndTime)
  if (end <= start) {
    end = start + (visit.estimatedDurationMinutes ?? 60)
  }
  if (end <= start) {
    end = start + 60
  }
  return { start, end }
}

export const visitScheduleWriteFields = (visit: VisitRecord) => {
  const range = getVisitTimeRange(visit)
  const start = visit.scheduledStartTime?.trim() || formatMinutesAsTime(range.start)
  const storedEnd = visit.scheduledEndTime?.trim()
  const end =
    storedEnd && parseTimeToMinutes(storedEnd) > parseTimeToMinutes(start)
      ? storedEnd
      : formatMinutesAsTime(range.end)
  return {
    scheduledStartTime: start,
    scheduledEndTime: end,
    estimatedDurationMinutes: Math.max(1, range.end - range.start),
  }
}

export const isTerminalVisit = (visit: VisitRecord) =>
  visit.status === 'COMPLETED' || visit.status === 'CANCELLED'

export const groupVisitsByPropertyAndDate = (
  visits: VisitRecord[],
  propertyIds: string[],
  dates: string[],
) => {
  const map = new Map<string, VisitRecord[]>()
  propertyIds.forEach((propertyId) => {
    dates.forEach((date) => {
      map.set(`${propertyId}|${date}`, [])
    })
  })
  visits.forEach((visit) => {
    const key = `${visit.propertyId}|${visit.scheduledDate}`
    if (!map.has(key)) {
      map.set(key, [])
    }
    map.get(key)?.push(visit)
  })
  map.forEach((items, key) => {
    items.sort((a, b) =>
      a.scheduledStartTime.localeCompare(b.scheduledStartTime),
    )
    map.set(key, items)
  })
  return map
}

export type VisitLayoutSlot = {
  visit: VisitRecord
  start: number
  end: number
  stackIndex: number
  stackSize: number
  overlapTeamIds: string[]
  sameTeamOverlap: boolean
}

export const buildVisitLayoutSlots = (visits: VisitRecord[]): VisitLayoutSlot[] => {
  const sorted = [...visits].sort(
    (a, b) =>
      getVisitTimeRange(a).start - getVisitTimeRange(b).start ||
      a.scheduledStartTime.localeCompare(b.scheduledStartTime),
  )

  const slots = sorted.map((visit) => {
    const { start, end } = getVisitTimeRange(visit)
    return {
      visit,
      start,
      end,
      stackIndex: 0,
      stackSize: 1,
      overlapTeamIds: [] as string[],
      sameTeamOverlap: false,
    }
  })

  slots.forEach((slot) => {
    const overlapping = slots.filter(
      (other) =>
        other.visit.id !== slot.visit.id &&
        slot.start < other.end &&
        other.start < slot.end,
    )
    slot.overlapTeamIds = [
      ...new Set(overlapping.map((entry) => entry.visit.teamId)),
    ]

    const sameTeamOverlaps = slots
      .filter(
        (other) =>
          other.visit.teamId === slot.visit.teamId &&
          slot.start < other.end &&
          other.start < slot.end,
      )
      .sort(
        (a, b) =>
          a.start - b.start ||
          a.visit.scheduledStartTime.localeCompare(b.visit.scheduledStartTime) ||
          a.visit.id.localeCompare(b.visit.id),
      )

    slot.stackSize = sameTeamOverlaps.length
    slot.stackIndex = sameTeamOverlaps.findIndex(
      (entry) => entry.visit.id === slot.visit.id,
    )
    slot.sameTeamOverlap = sameTeamOverlaps.length > 1
  })

  return slots
}

export const DAY_VIEW_EDGE_PAD_MINUTES = 30
export const DAY_VIEW_DEFAULT_START_MINUTES = 10 * 60 + DAY_VIEW_EDGE_PAD_MINUTES
export const DAY_VIEW_START_MINUTES = DAY_VIEW_DEFAULT_START_MINUTES
export const DAY_VIEW_WINDOW_SPAN_MINUTES = 7 * 60
export const DAY_VIEW_END_MINUTES =
  DAY_VIEW_DEFAULT_START_MINUTES + DAY_VIEW_WINDOW_SPAN_MINUTES
export const DAY_VIEW_SPAN_MINUTES = DAY_VIEW_WINDOW_SPAN_MINUTES
export const DAY_VIEW_PAN_STEP_MINUTES = 2 * 60
export const DAY_VIEW_MIN_WINDOW_START = 5 * 60 + DAY_VIEW_EDGE_PAD_MINUTES
export const DAY_VIEW_MAX_WINDOW_END = 21 * 60 + DAY_VIEW_EDGE_PAD_MINUTES
export const DAY_SNAP_MINUTES = 30
export const DAY_MIN_DURATION_MINUTES = 30
export const BOOKING_CHECK_IN_START = 15 * 60
export const BOOKING_CHECK_OUT_END = 11 * 60
export const BOOKING_DURATION_MINUTES = 30
export const EARLY_CHECK_IN_DURATION_MINUTES = 15

export type DayTimelineWindow = {
  startMinutes: number
  endMinutes: number
  spanMinutes: number
}

export const getDayTimelineWindow = (
  startMinutes = DAY_VIEW_DEFAULT_START_MINUTES,
): DayTimelineWindow => ({
  startMinutes,
  endMinutes: startMinutes + DAY_VIEW_WINDOW_SPAN_MINUTES,
  spanMinutes: DAY_VIEW_WINDOW_SPAN_MINUTES,
})

export const clampDayWindowStart = (startMinutes: number) =>
  Math.max(
    DAY_VIEW_MIN_WINDOW_START,
    Math.min(
      startMinutes,
      DAY_VIEW_MAX_WINDOW_END - DAY_VIEW_WINDOW_SPAN_MINUTES,
    ),
  )

export const shiftDayWindowStart = (
  currentStart: number,
  deltaMinutes: number,
) => clampDayWindowStart(currentStart + deltaMinutes)

export const canShiftDayWindowEarlier = (startMinutes: number) =>
  startMinutes > DAY_VIEW_MIN_WINDOW_START

export const canShiftDayWindowLater = (startMinutes: number) =>
  startMinutes + DAY_VIEW_WINDOW_SPAN_MINUTES < DAY_VIEW_MAX_WINDOW_END

export const snapToDayGrid = (minutes: number) =>
  Math.round(minutes / DAY_SNAP_MINUTES) * DAY_SNAP_MINUTES

export const getDayTimelineBounds = (
  startMinutes = DAY_VIEW_DEFAULT_START_MINUTES,
) => getDayTimelineWindow(startMinutes)

export const getDayTimelineHourMarks = (window: DayTimelineWindow) => {
  const marks: number[] = []
  const firstHour = Math.ceil(window.startMinutes / 60) * 60
  const lastHour = Math.floor(window.endMinutes / 60) * 60
  const start =
    firstHour === window.startMinutes ? firstHour + 60 : firstHour
  const end = lastHour === window.endMinutes ? lastHour - 60 : lastHour
  for (let minute = start; minute <= end; minute += 60) {
    marks.push(minute)
  }
  return marks
}

export const getBookingEventTimeRange = (booking: {
  kind: 'check-in' | 'check-out'
  earlyCheckIn?: boolean
  checkInStartMinutes?: number
  earlyLeadMinutes?: number
}) => {
  if (booking.kind === 'check-in') {
    const start = booking.checkInStartMinutes ?? BOOKING_CHECK_IN_START
    const lead =
      booking.earlyLeadMinutes ??
      (booking.earlyCheckIn ? EARLY_CHECK_IN_DURATION_MINUTES : 0)
    return {
      start: start - lead,
      end: start + BOOKING_DURATION_MINUTES,
    }
  }
  return {
    start: BOOKING_CHECK_OUT_END - BOOKING_DURATION_MINUTES,
    end: BOOKING_CHECK_OUT_END,
  }
}

export const resolveCheckInLayout = (booking: {
  earlyCheckIn?: boolean
  checkInStartMinutes?: number
  earlyLeadMinutes?: number
}) => {
  const checkInStartMinutes =
    booking.checkInStartMinutes ?? BOOKING_CHECK_IN_START
  const earlyLeadMinutes =
    booking.earlyLeadMinutes ??
    (booking.earlyCheckIn ? EARLY_CHECK_IN_DURATION_MINUTES : 0)
  return { checkInStartMinutes, earlyLeadMinutes }
}

export const clampCheckInLayout = ({
  checkInStartMinutes,
  earlyLeadMinutes,
  minLead = 0,
}: {
  checkInStartMinutes: number
  earlyLeadMinutes: number
  minLead?: number
}) => {
  const lead = Math.max(minLead, Math.round(earlyLeadMinutes / 15) * 15)
  const start = Math.max(
    lead,
    Math.min(
      24 * 60 - BOOKING_DURATION_MINUTES,
      snapToDayGrid(checkInStartMinutes),
    ),
  )
  return {
    checkInStartMinutes: start,
    earlyLeadMinutes: Math.min(lead, start),
  }
}

export type ClippedVisitRange = {
  visualStart: number
  visualEnd: number
  extendsBefore: boolean
  extendsAfter: boolean
}

export const clipVisitToDayWindow = (
  start: number,
  end: number,
  window: DayTimelineWindow = getDayTimelineWindow(),
): ClippedVisitRange => ({
  visualStart: Math.max(start, window.startMinutes),
  visualEnd: Math.min(end, window.endMinutes),
  extendsBefore: start < window.startMinutes,
  extendsAfter: end > window.endMinutes,
})

export const getDayWindowOverflow = (
  visits: VisitRecord[],
  window: DayTimelineWindow = getDayTimelineWindow(),
  bookings: Array<{
    kind: 'check-in' | 'check-out'
    earlyCheckIn?: boolean
    checkInStartMinutes?: number
    earlyLeadMinutes?: number
  }> = [],
) => {
  let hasEarly = false
  let hasLate = false
  let earliestBefore = window.startMinutes
  let latestAfter = window.endMinutes

  const ranges = [
    ...visits.map(getVisitTimeRange),
    ...bookings.map(getBookingEventTimeRange),
  ]

  ranges.forEach(({ start, end }) => {
    if (start < window.startMinutes) {
      hasEarly = true
      earliestBefore = Math.min(earliestBefore, start)
    }
    if (end > window.endMinutes) {
      hasLate = true
      latestAfter = Math.max(latestAfter, end)
    }
  })

  return { hasEarly, hasLate, earliestBefore, latestAfter }
}

export const minutesToPositionPercent = (
  minutes: number,
  window: DayTimelineWindow = getDayTimelineWindow(),
) =>
  ((minutes - window.startMinutes) / window.spanMinutes) * 100

export const positionPercentToMinutes = (
  percent: number,
  window: DayTimelineWindow = getDayTimelineWindow(),
) => window.startMinutes + (percent / 100) * window.spanMinutes

export const formatAgendaDayLabel = (date: string) => {
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return date
  }
  const locale = i18n.language?.startsWith('es') ? 'es-ES' : 'en-GB'
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(
    parsed,
  )
  const day = parsed.getDate()
  const month = new Intl.DateTimeFormat(locale, { month: 'short' })
    .format(parsed)
    .replace('.', '')
    .slice(0, 3)
  return `${weekday} ${day} ${month}`
}
