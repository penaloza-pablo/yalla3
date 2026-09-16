import { useEffect, useState } from 'react'
import { getAmplifyEndpoint } from '../../lib/amplify-endpoint'
import { fetchJson, getVisitsByDate } from '../../operations/api'
import { addDaysToDateString } from '../../operations/dateHelpers'
import { withLiveRetry } from '../live-retry'
import { getDashboardDate } from '../dashboard-date-store'
import {
  asTrackerRow,
  type TrackerActivity,
  type TrackerResponse,
  type TrackerRow,
} from '../../bookings/checkInTrackerShared'
import {
  bookingHasEarlyCheckIn,
  isCompletedVisitStatus,
  trackerVisitKind,
  toDateOnly,
} from '../../../amplify/functions/shared/check-in-tracker'
import type { CheckinAction, CheckinGuest } from './CheckinWidget'
import {
  applyTrackerFlagsToRow,
  checkinActionToPatch,
  sortUpcomingTrackerRows,
  trackerRowToGuest,
} from './tracker-adapter'

type LiveState = {
  rows: TrackerRow[]
  guests: CheckinGuest[]
  activity: TrackerActivity | null
  loading: boolean
  busy: boolean
  error: string
  from: string
  to: string
}

const listeners = new Set<() => void>()

const notify = () => {
  listeners.forEach((listener) => listener())
}

let inflight: Promise<void> | null = null
let inflightDate = ''
let loadGeneration = 0
let inflightController: AbortController | null = null
let loadedAt = 0

let state: LiveState = {
  rows: [],
  guests: [],
  activity: null,
  loading: false,
  busy: false,
  error: '',
  from: '',
  to: '',
}

const STALE_MS = 20_000

const emptyCounts = () => ({ total: 0, completed: 0 })

const checkinsFromRows = (rows: TrackerRow[]) => ({
  total: rows.length,
  completed: rows.filter((row) => row.status === 'guest_entered').length,
  early: rows.filter((row) => row.earlyCheckIn).length,
})

const mergeActivity = (
  rows: TrackerRow[],
  activity: TrackerActivity | null,
): TrackerActivity | null => {
  if (!activity) {
    return {
      checkins: checkinsFromRows(rows),
      cleaning: emptyCounts(),
      maintenance: emptyCounts(),
    }
  }
  return {
    ...activity,
    checkins: checkinsFromRows(rows),
  }
}

const parseActivity = (value: unknown): TrackerActivity | null => {
  if (!value || typeof value !== 'object') {
    return null
  }
  const item = value as Record<string, unknown>
  const readCounts = (entry: unknown, extraEarly = false) => {
    if (!entry || typeof entry !== 'object') {
      return null
    }
    const counts = entry as Record<string, unknown>
    const total = Number(counts.total)
    const completed = Number(counts.completed)
    if (
      !Number.isSafeInteger(total) ||
      !Number.isSafeInteger(completed) ||
      total < 0 ||
      completed < 0 ||
      completed > total
    ) {
      return null
    }
    if (!extraEarly) {
      return { total, completed }
    }
    const early = Number(counts.early)
    if (!Number.isSafeInteger(early) || early < 0 || early > total) {
      return null
    }
    return { total, completed, early }
  }
  const checkins = readCounts(item.checkins, true)
  const cleaning = readCounts(item.cleaning)
  const maintenance = readCounts(item.maintenance)
  if (!checkins || !cleaning || !maintenance || !('early' in checkins)) {
    return null
  }
  return {
    checkins: checkins as TrackerActivity['checkins'],
    cleaning,
    maintenance,
  }
}

const visitActivityFromItems = (
  visits: Record<string, unknown>[],
  date: string,
) => {
  const cleaning = emptyCounts()
  const maintenance = emptyCounts()
  for (const visit of visits) {
    if (toDateOnly(visit.scheduledDate) !== date) {
      continue
    }
    const status = String(visit.status ?? '')
    if (status.toUpperCase() === 'CANCELLED') {
      continue
    }
    const kind = trackerVisitKind(visit)
    if (kind === 'cleaning') {
      cleaning.total += 1
      if (isCompletedVisitStatus(status)) {
        cleaning.completed += 1
      }
    } else if (kind === 'maintenance') {
      maintenance.total += 1
      if (isCompletedVisitStatus(status)) {
        maintenance.completed += 1
      }
    }
  }
  return { cleaning, maintenance }
}

const setState = (patch: Partial<LiveState>) => {
  state = { ...state, ...patch }
  if (patch.rows) {
    state.guests = patch.rows.map(trackerRowToGuest)
    state.activity = mergeActivity(patch.rows, patch.activity ?? state.activity)
  } else if (patch.activity) {
    state.activity = mergeActivity(state.rows, patch.activity)
  }
  notify()
}

const isAbortError = (error: unknown) =>
  (error instanceof DOMException && error.name === 'AbortError') ||
  (error instanceof Error && error.name === 'AbortError')

const parseItems = (payload: TrackerResponse) =>
  (payload.items ?? []).map((item) =>
    asTrackerRow(item as unknown as Record<string, unknown>),
  )

const loadRangeWithFallback = async (
  endpoint: string,
  from: string,
  to: string,
  signal?: AbortSignal,
) => {
  const ranged = await fetchJson<TrackerResponse>(
    `${endpoint}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    { signal },
  )
  if (ranged.from === from && ranged.to === to) {
    return { rows: parseItems(ranged), activity: parseActivity(ranged.activity) }
  }

  const knownDate = ranged.date || from
  const byId = new Map<string, TrackerRow>()
  for (const row of parseItems(ranged)) {
    if (row.id) {
      byId.set(row.id, row)
    }
  }

  const dates: string[] = []
  for (
    let cursor = from;
    cursor <= to;
    cursor = addDaysToDateString(cursor, 1)
  ) {
    if (cursor !== knownDate) {
      dates.push(cursor)
    }
  }

  const pages = await Promise.all(
    dates.map((date) =>
      fetchJson<TrackerResponse>(
        `${endpoint}?date=${encodeURIComponent(date)}`,
        { signal },
      ),
    ),
  )
  for (const page of pages) {
    for (const row of parseItems(page)) {
      if (row.id) {
        byId.set(row.id, row)
      }
    }
  }
  return {
    rows: [...byId.values()],
    activity: parseActivity(ranged.activity),
  }
}

const loadVisitActivity = async (date: string, signal?: AbortSignal) => {
  const endpoint = getAmplifyEndpoint(
    'getVisitsUrl',
    import.meta.env.VITE_GET_VISITS_URL,
  )
  if (!endpoint) {
    return null
  }
  try {
    const payload = await getVisitsByDate(endpoint, date, { signal })
    return visitActivityFromItems(
      (payload.items ?? []) as unknown as Record<string, unknown>[],
      date,
    )
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    return null
  }
}

const loadEarlyFlagsForDate = async (
  date: string,
  signal?: AbortSignal,
): Promise<Map<string, boolean> | null> => {
  const endpoint = getAmplifyEndpoint(
    'getBookingsUrl',
    import.meta.env.VITE_GET_BOOKINGS_URL,
  )
  if (!endpoint) {
    return null
  }
  try {
    const items: Record<string, unknown>[] = []
    let cursor: string | null = null
    do {
      const query = new URLSearchParams({
        checkInFrom: date,
        checkInTo: date,
        status: 'confirmed',
        limit: '200',
      })
      if (cursor) {
        query.set('cursor', cursor)
      }
      const payload = await fetchJson<{
        items?: Record<string, unknown>[]
        nextCursor?: string | null
      }>(`${endpoint}?${query.toString()}`, { signal })
      items.push(...(payload.items ?? []))
      cursor = payload.nextCursor ?? null
    } while (cursor)
    return new Map(
      items.flatMap((item) => {
        const id = String(item.ReservationID ?? item.id ?? '').trim()
        return id ? [[id, bookingHasEarlyCheckIn(item)] as const] : []
      }),
    )
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    return null
  }
}

export const useCheckinLive = () => {
  const [, setVersion] = useState(0)
  useEffect(
    () => subscribeCheckinLive(() => setVersion((current) => current + 1)),
    [],
  )
  return getCheckinLiveState()
}

export const getCheckinLiveState = () => state

export const subscribeCheckinLive = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const loadUpcomingCheckins = (
  force = false,
  date = getDashboardDate(),
) => {
  if (inflight && inflightDate === date && !force) {
    return inflight
  }
  if (
    !force &&
    state.from === date &&
    loadedAt > 0 &&
    Date.now() - loadedAt < STALE_MS
  ) {
    return Promise.resolve()
  }

  const generation = ++loadGeneration
  inflightController?.abort()
  const controller = new AbortController()
  inflightController = controller
  inflightDate = date
  const from = date
  const to = date

  inflight = (async () => {
    const endpoint = getAmplifyEndpoint('getCheckInTrackerUrl')
    if (!endpoint) {
      if (generation !== loadGeneration) {
        return
      }
      setState({
        loading: false,
        rows: [],
        activity: null,
        error: 'missingEndpoint',
        from,
        to,
      })
      return
    }
    setState({ loading: true, error: '' })
    try {
      const [loaded, earlyById] = await Promise.all([
        withLiveRetry(
          () => loadRangeWithFallback(endpoint, from, to, controller.signal),
          { signal: controller.signal },
        ),
        loadEarlyFlagsForDate(from, controller.signal),
      ])
      if (generation !== loadGeneration || controller.signal.aborted) {
        return
      }
      let rows = sortUpcomingTrackerRows(
        loaded.rows.filter((row) => Boolean(row.id)),
      )
      if (earlyById) {
        rows = rows.map((row) => ({
          ...row,
          earlyCheckIn: earlyById.get(row.id) ?? row.earlyCheckIn,
        }))
      }
      let activity = mergeActivity(rows, loaded.activity)
      if (!loaded.activity) {
        const visitCounts = await loadVisitActivity(from, controller.signal)
        if (generation !== loadGeneration || controller.signal.aborted) {
          return
        }
        if (visitCounts) {
          activity = { checkins: checkinsFromRows(rows), ...visitCounts }
        }
      }
      loadedAt = Date.now()
      setState({ loading: false, rows, activity, from, to, error: '' })
    } catch (loadError) {
      if (
        generation !== loadGeneration ||
        controller.signal.aborted ||
        isAbortError(loadError)
      ) {
        return
      }
      const previous = getCheckinLiveState()
      const keep = previous.from === from && previous.rows.length > 0
      setState({
        loading: false,
        rows: keep ? previous.rows : [],
        activity: keep ? previous.activity : null,
        from,
        to,
        error: keep
          ? ''
          : loadError instanceof Error && loadError.message
            ? loadError.message
            : 'loadError',
      })
    }
  })().finally(() => {
    if (generation === loadGeneration) {
      inflight = null
      inflightDate = ''
    }
  })

  return inflight
}

export const saveCheckinAction = async (
  guestId: string,
  action: CheckinAction,
) => {
  const patch = checkinActionToPatch(action)
  const row = state.rows.find((entry) => entry.id === guestId)
  const endpoint = getAmplifyEndpoint('upsertCheckInTrackerUrl')
  if (!patch || !row) {
    return
  }
  if (!endpoint) {
    setState({ error: 'missingWrite' })
    return
  }

  setState({ busy: true, error: '' })
  try {
    const payload = await fetchJson<{
      item?: { accessGranted?: boolean; guestEntered?: boolean }
    }>(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reservationId: row.id, ...patch }),
    })
    const flags = {
      accessGranted: payload.item?.accessGranted === true,
      guestEntered: payload.item?.guestEntered === true,
    }
    loadedAt = 0
    const rows = state.rows.map((entry) =>
      entry.id === row.id ? applyTrackerFlagsToRow(entry, flags) : entry,
    )
    setState({
      busy: false,
      rows,
    })
  } catch (saveError) {
    setState({
      busy: false,
      error:
        saveError instanceof Error && saveError.message
          ? saveError.message
          : 'saveError',
    })
  }
}

export const syncCheckinLiveFlags = (
  reservationId: string,
  flags: { accessGranted: boolean; guestEntered: boolean },
) => {
  if (!state.rows.some((entry) => entry.id === reservationId)) {
    loadedAt = 0
    return
  }
  setState({
    rows: state.rows.map((entry) =>
      entry.id === reservationId ? applyTrackerFlagsToRow(entry, flags) : entry,
    ),
  })
}
