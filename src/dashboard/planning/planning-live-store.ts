import { useEffect, useState } from 'react'
import { PLANNER_WINDOW_DAYS } from '../../../amplify/functions/shared/bookings-planner'
import { getAmplifyEndpoint } from '../../lib/amplify-endpoint'
import { fetchJson } from '../../operations/api'
import { addDaysToDateString, getTodayMadrid } from '../../operations/dateHelpers'
import { withLiveRetry } from '../live-retry'
import {
  bookingsPlanWithoutWarningCounts,
  isConfirmedPlannerStatus,
  mapPlannerPlanRow,
} from '../../bookings/planner-plan-row'
import type { PlanningData } from './PlanningWidget'

type LiveState = {
  data: PlanningData | null
  loading: boolean
  error: string
}

type TodaySummaryPayload = {
  cleaning?: { planningReady?: unknown; planningTotal?: unknown }
  maintenance?: { planningReady?: unknown; planningTotal?: unknown }
}

type BookingsApiResponse = {
  items?: Record<string, unknown>[]
  nextCursor?: string | null
}

const listeners = new Set<() => void>()

const notify = () => {
  listeners.forEach((listener) => listener())
}

let inflight: Promise<void> | null = null
let loadedAt = 0

let state: LiveState = {
  data: null,
  loading: false,
  error: '',
}

const STALE_MS = 20_000
const PLAN_TOTAL = 2

const setState = (patch: Partial<LiveState>) => {
  state = { ...state, ...patch }
  notify()
}

const asPlanLine = (ready: unknown): { completed: number; total: 2 } => {
  const parsed = Number(ready)
  const completed = Number.isFinite(parsed)
    ? Math.min(PLAN_TOTAL, Math.max(0, Math.round(parsed)))
    : 0
  return { completed, total: PLAN_TOTAL }
}

const loadBookingsPlanRows = async (endpoint: string) => {
  const today = getTodayMadrid()
  const to = addDaysToDateString(today, PLANNER_WINDOW_DAYS - 1)
  const items: Record<string, unknown>[] = []
  let cursor: string | null = null
  do {
    const query = new URLSearchParams({
      checkInFrom: today,
      checkInTo: to,
      status: 'confirmed',
      limit: '200',
    })
    if (cursor) {
      query.set('cursor', cursor)
    }
    const payload = await fetchJson<BookingsApiResponse>(
      `${endpoint}?${query.toString()}`,
    )
    items.push(...(payload.items ?? []))
    cursor = payload.nextCursor ?? null
  } while (cursor)

  return items
    .map(mapPlannerPlanRow)
    .filter((row) => row.id && isConfirmedPlannerStatus(row.status))
}

export const getPlanningLiveState = () => state

export const subscribePlanningLive = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const usePlanningLive = () => {
  const [, setVersion] = useState(0)
  useEffect(
    () => subscribePlanningLive(() => setVersion((current) => current + 1)),
    [],
  )
  return getPlanningLiveState()
}

export const loadPlanningSnapshot = (force = false) => {
  if (inflight) {
    return inflight
  }
  if (!force && loadedAt > 0 && Date.now() - loadedAt < STALE_MS) {
    return Promise.resolve()
  }

  inflight = (async () => {
    const todayEndpoint = getAmplifyEndpoint(
      'getTodaySummaryUrl',
      import.meta.env.VITE_GET_TODAY_SUMMARY_URL,
    )
    const bookingsEndpoint = getAmplifyEndpoint(
      'getBookingsUrl',
      import.meta.env.VITE_GET_BOOKINGS_URL,
    )
    if (!todayEndpoint) {
      setState({ loading: false, data: null, error: 'missingTodayEndpoint' })
      return
    }
    if (!bookingsEndpoint) {
      setState({ loading: false, data: null, error: 'missingBookingsEndpoint' })
      return
    }
    setState({ loading: true, error: '' })
    try {
      const { summary, rows } = await withLiveRetry(async () => {
        const [nextSummary, nextRows] = await Promise.all([
          fetchJson<TodaySummaryPayload>(todayEndpoint),
          loadBookingsPlanRows(bookingsEndpoint),
        ])
        return { summary: nextSummary, rows: nextRows }
      })
      loadedAt = Date.now()
      setState({
        loading: false,
        error: '',
        data: {
          maintenance: asPlanLine(summary.maintenance?.planningReady),
          cleaning: asPlanLine(summary.cleaning?.planningReady),
          bookings: bookingsPlanWithoutWarningCounts(rows),
        },
      })
    } catch {
      const previous = getPlanningLiveState()
      setState({
        loading: false,
        data: previous.data,
        error: previous.data ? '' : 'loadError',
      })
    }
  })().finally(() => {
    inflight = null
  })

  return inflight
}
