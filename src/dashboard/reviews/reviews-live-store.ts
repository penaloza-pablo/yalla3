import { useEffect, useState } from 'react'
import { getAmplifyEndpoint } from '../../lib/amplify-endpoint'
import { fetchJson } from '../../operations/api'
import { withLiveRetry } from '../live-retry'
import { countPendingReviewsUnderFive } from './reviews-model.mjs'

type LiveState = {
  activeCount: number | null
  loading: boolean
  error: string
}

type ReviewsApiResponse = {
  items?: Record<string, unknown>[]
}

const listeners = new Set<() => void>()

const notify = () => {
  listeners.forEach((listener) => listener())
}

let inflight: Promise<void> | null = null
let loadedAt = 0

let state: LiveState = {
  activeCount: null,
  loading: false,
  error: '',
}

const STALE_MS = 20_000

const setState = (patch: Partial<LiveState>) => {
  state = { ...state, ...patch }
  notify()
}

export const getReviewsLiveState = () => state

export const subscribeReviewsLive = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useReviewsLive = () => {
  const [, setVersion] = useState(0)
  useEffect(
    () => subscribeReviewsLive(() => setVersion((current) => current + 1)),
    [],
  )
  return getReviewsLiveState()
}

export const loadReviewsSnapshot = (force = false) => {
  if (inflight) {
    return inflight
  }
  if (!force && loadedAt > 0 && Date.now() - loadedAt < STALE_MS) {
    return Promise.resolve()
  }

  inflight = (async () => {
    const endpoint = getAmplifyEndpoint(
      'getReviewsUrl',
      import.meta.env.VITE_GET_REVIEWS_URL,
    )
    if (!endpoint) {
      setState({ loading: false, activeCount: null, error: 'missingEndpoint' })
      return
    }
    setState({ loading: true, error: '' })
    try {
      const payload = await withLiveRetry(() =>
        fetchJson<ReviewsApiResponse>(endpoint),
      )
      loadedAt = Date.now()
      setState({
        loading: false,
        error: '',
        activeCount: countPendingReviewsUnderFive(payload.items ?? []),
      })
    } catch {
      const previous = getReviewsLiveState()
      setState({
        loading: false,
        activeCount: previous.activeCount,
        error: previous.activeCount === null ? 'loadError' : '',
      })
    }
  })().finally(() => {
    inflight = null
  })

  return inflight
}
