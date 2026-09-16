import { createContext, useContext } from 'react'
import type { TodayViewMode } from '../nav/todayViews'

export type DashboardNavigateOptions = {
  inventoryStatuses?: string[]
  purchaseStatuses?: string[]
  purchaseInvoiceOff?: boolean
  reviewsCreatedPreset?: 'none' | 'last7' | 'last30'
}

export type DashboardNavigation = {
  toPage: (page: string, options?: DashboardNavigateOptions) => void
  toTodayView: (view: TodayViewMode) => void
}

export const DashboardNavContext = createContext<DashboardNavigation | null>(
  null,
)

export const useDashboardNav = () => useContext(DashboardNavContext)
