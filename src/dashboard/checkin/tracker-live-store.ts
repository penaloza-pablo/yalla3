import { useEffect, useState } from 'react'
import { CHECK_IN_TRACKER_UPCOMING_DAYS } from '../../../amplify/functions/shared/check-in-tracker'
import { getAmplifyEndpoint } from '../../lib/amplify-endpoint'
import { fetchJson } from '../../operations/api'
import { addDaysToDateString, getTodayMadrid } from '../../operations/dateHelpers'
import {
  asTrackerRow,
  type TrackerResponse,
  type TrackerRow,
} from '../../bookings/checkInTrackerShared'
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
let loadedAt = 0

let state: LiveState = {
  rows: [],
  guests: [],
  loading: false,
  busy: false,
  error: '',
  from: '',
  to: '',
}

const STALE_MS = 20_000

const setState = (patch: Partial<LiveState>) => {
  state = { ...state, ...patch }
  if (patch.rows) {
    state.guests = patch.rows.map(trackerRowToGuest)
  }
  notify()
}

const upcomingWindow = () => {
  const from = getTodayMadrid()
  return {
    from,
    to: addDaysToDateString(from, CHECK_IN_TRACKER_UPCOMING_DAYS - 1),
  }
}

const parseItems = (payload: TrackerResponse) =>
  (payload.items ?? []).map((item) =>
    asTrackerRow(item as unknown as Record<string, unknown>),
  )

const loadRangeWithFallback = async (
  endpoint: string,
  from: string,
  to: string,
) => {
  const ranged = await fetchJson<TrackerResponse>(
    `${endpoint}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  )
  if (ranged.from === from && ranged.to === to) {
    return parseItems(ranged)
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
  return [...byId.values()]
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

export const loadUpcomingCheckins = (force = false) => {
  if (inflight) {
    return inflight
  }
  if (!force && loadedAt > 0 && Date.now() - loadedAt < STALE_MS) {
    return Promise.resolve()
  }

  inflight = (async () => {
    const endpoint = getAmplifyEndpoint('getCheckInTrackerUrl')
    if (!endpoint) {
      setState({
        loading: false,
        rows: [],
        error: 'missingEndpoint',
      })
      return
    }
    const { from, to } = upcomingWindow()
    setState({ loading: true, error: '', from, to })
    try {
      const rows = sortUpcomingTrackerRows(
        (await loadRangeWithFallback(endpoint, from, to)).filter((row) =>
          Boolean(row.id),
        ),
      )
      loadedAt = Date.now()
      setState({ loading: false, rows, from, to, error: '' })
    } catch (loadError) {
      setState({
        loading: false,
        rows: [],
        error:
          loadError instanceof Error && loadError.message
            ? loadError.message
            : 'loadError',
      })
    }
  })().finally(() => {
    inflight = null
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
    setState({
      busy: false,
      rows: state.rows.map((entry) =>
        entry.id === row.id ? applyTrackerFlagsToRow(entry, flags) : entry,
      ),
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
