import { useEffect, useState } from 'react'
import {
  PURCHASE_OVERDUE,
  PURCHASE_WAITING_DELIVERY,
  decoratePurchaseRecord,
  isExcludedPurchaseRecord,
  purchaseBusinessToday,
  readPurchaseInvoice,
} from '../../../amplify/functions/shared/purchase-status'
import { getAmplifyEndpoint } from '../../lib/amplify-endpoint'
import { fetchJson } from '../../operations/api'
import { withLiveRetry } from '../live-retry'
import { countInventoryStockAlerts } from './supplies-model.mjs'
import type { SuppliesData } from './SuppliesWidget'

type LiveState = {
  data: SuppliesData | null
  loading: boolean
  error: string
}

type ListResponse = {
  items?: Record<string, unknown>[]
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

const setState = (patch: Partial<LiveState>) => {
  state = { ...state, ...patch }
  notify()
}

const countPurchaseIndicators = (items: Record<string, unknown>[]) => {
  const today = purchaseBusinessToday()
  let waitingDelivery = 0
  let overdue = 0
  let waitingInvoice = 0
  for (const item of items) {
    const decorated = decoratePurchaseRecord(item, today)
    if (isExcludedPurchaseRecord(decorated)) {
      continue
    }
    const status = String(decorated.Status ?? '')
    if (status === PURCHASE_WAITING_DELIVERY) {
      waitingDelivery += 1
    }
    if (status === PURCHASE_OVERDUE) {
      overdue += 1
    }
    if (!readPurchaseInvoice(decorated)) {
      waitingInvoice += 1
    }
  }
  return { waitingDelivery, overdue, waitingInvoice }
}

export const getSuppliesLiveState = () => state

export const subscribeSuppliesLive = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const useSuppliesLive = () => {
  const [, setVersion] = useState(0)
  useEffect(
    () => subscribeSuppliesLive(() => setVersion((current) => current + 1)),
    [],
  )
  return getSuppliesLiveState()
}

export const loadSuppliesSnapshot = (
  force = false,
  options?: { silent?: boolean },
) => {
  if (inflight) {
    return inflight
  }
  if (!force && loadedAt > 0 && Date.now() - loadedAt < STALE_MS) {
    return Promise.resolve()
  }

  inflight = (async () => {
    const inventoryEndpoint = getAmplifyEndpoint(
      'getInventoryUrl',
      import.meta.env.VITE_GET_INVENTORY_URL,
    )
    const purchasesEndpoint = getAmplifyEndpoint(
      'getPurchasesUrl',
      import.meta.env.VITE_GET_PURCHASES_URL,
    )
    if (!inventoryEndpoint) {
      setState({ loading: false, data: null, error: 'missingInventoryEndpoint' })
      return
    }
    if (!purchasesEndpoint) {
      setState({ loading: false, data: null, error: 'missingPurchasesEndpoint' })
      return
    }
    if (!(options?.silent && state.data)) {
      setState({ loading: true, error: '' })
    }
    try {
      const { inventory, purchases } = await withLiveRetry(async () => {
        const [nextInventory, nextPurchases] = await Promise.all([
          fetchJson<ListResponse>(inventoryEndpoint),
          fetchJson<ListResponse>(purchasesEndpoint),
        ])
        return { inventory: nextInventory, purchases: nextPurchases }
      })
      loadedAt = Date.now()
      setState({
        loading: false,
        error: '',
        data: {
          stockAlerts: countInventoryStockAlerts(inventory.items ?? []),
          ...countPurchaseIndicators(purchases.items ?? []),
        },
      })
    } catch {
      const previous = getSuppliesLiveState()
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
