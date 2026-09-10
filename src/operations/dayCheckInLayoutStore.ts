const STORAGE_KEY = 'yalla.dayCheckInLayout.v1'

export type StoredCheckInLayout = {
  checkInStartMinutes: number
  earlyLeadMinutes: number
}

const isStoredLayout = (value: unknown): value is StoredCheckInLayout => {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.checkInStartMinutes === 'number' &&
    Number.isFinite(record.checkInStartMinutes) &&
    typeof record.earlyLeadMinutes === 'number' &&
    Number.isFinite(record.earlyLeadMinutes)
  )
}

const layoutKey = (date: string, bookingId: string) => `${date}|${bookingId}`

const readAll = (): Record<string, StoredCheckInLayout> => {
  if (typeof window === 'undefined') {
    return {}
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    const next: Record<string, StoredCheckInLayout> = {}
    Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
      if (isStoredLayout(value)) {
        next[key] = {
          checkInStartMinutes: value.checkInStartMinutes,
          earlyLeadMinutes: Math.max(0, value.earlyLeadMinutes),
        }
      }
    })
    return next
  } catch {
    return {}
  }
}

export const readDayCheckInLayout = (date: string, bookingId: string) =>
  readAll()[layoutKey(date, bookingId)] ?? null

export const writeDayCheckInLayout = (
  date: string,
  bookingId: string,
  layout: StoredCheckInLayout,
) => {
  try {
    const current = readAll()
    current[layoutKey(date, bookingId)] = {
      checkInStartMinutes: layout.checkInStartMinutes,
      earlyLeadMinutes: Math.max(0, layout.earlyLeadMinutes),
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}
