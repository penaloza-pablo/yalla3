const BUSINESS_TIMEZONE = 'Europe/Madrid'
export const MAX_VISIT_DATE_RANGE_DAYS = 31

export const getTodayMadrid = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE }).format(
    new Date(),
  )

const parseDateOnly = (value: string) => {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) {
    return null
  }
  const [, year, month, day] = match
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
}

const formatDateOnly = (date: Date) => {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const addDaysToDateString = (value: string, days: number) => {
  const parsed = parseDateOnly(value)
  if (!parsed) {
    return value
  }
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return formatDateOnly(parsed)
}

export const normalizeDateRange = (from: string, to: string) => {
  const start = parseDateOnly(from)
  const end = parseDateOnly(to)
  if (!start || !end) {
    return { from, to, dates: [from] }
  }
  const rangeStart = start.getTime() <= end.getTime() ? start : end
  const rangeEnd = start.getTime() <= end.getTime() ? end : start
  const dates: string[] = []
  const cursor = new Date(rangeStart)
  while (cursor.getTime() <= rangeEnd.getTime()) {
    dates.push(formatDateOnly(cursor))
    if (dates.length > MAX_VISIT_DATE_RANGE_DAYS) {
      break
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return {
    from: formatDateOnly(rangeStart),
    to: formatDateOnly(rangeEnd),
    dates,
  }
}

export const getTomorrowMadrid = () => addDaysToDateString(getTodayMadrid(), 1)

export const calendarDaysBetween = (from: string, to: string) => {
  const start = parseDateOnly(from)
  const end = parseDateOnly(to)
  if (!start || !end) {
    return 0
  }
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
}

export const MAX_PLAN_READY_AHEAD_DAYS = 2

export const isPlanDateTooFarAhead = (
  plannedDate: string,
  today = getTodayMadrid(),
  maxAheadDays = MAX_PLAN_READY_AHEAD_DAYS,
) => calendarDaysBetween(today, plannedDate) > maxAheadDays

export const getMadridMonthRange = (monthOffset = 0) => {
  const today = getTodayMadrid()
  const [year, month] = today.split('-').map(Number)
  const start = new Date(Date.UTC(year, month - 1 + monthOffset, 1))
  const end = new Date(Date.UTC(year, month + monthOffset, 0))
  return {
    from: formatDateOnly(start),
    to: formatDateOnly(end),
  }
}

export const formatDayMonthLabel = (value: string) => {
  const parsed = parseDateOnly(value)
  if (!parsed) {
    return value
  }
  const day = String(parsed.getUTCDate()).padStart(2, '0')
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}`
}

export const formatDateOnlyLabel = (value: string, locale = 'en') => {
  const parsed = parseDateOnly(value)
  if (!parsed) {
    return value
  }
  return new Intl.DateTimeFormat(locale.toLowerCase().startsWith('es') ? 'es-ES' : 'en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed)
}

export const formatTaskCreatedDate = (value?: string) => {
  if (!value?.trim()) {
    return '—'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed)
}
