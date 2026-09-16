import {
  CHECK_IN_TRACKER_STATUSES,
  type CheckInTrackerStatus,
} from '../../amplify/functions/shared/check-in-tracker'

export type TrackerOpenVisit = {
  id: string
  kind: 'cleaning' | 'maintenance'
  scheduledDate: string
  status: string
  title: string
}

export type TrackerRow = {
  id: string
  listingId: string
  guestName: string
  property: string
  checkInDate: string
  checkOutDate: string
  status: CheckInTrackerStatus
  accessGranted: boolean
  guestEntered: boolean
  earlyCheckIn: boolean
  openVisits: TrackerOpenVisit[]
}

export type TrackerActivityCounts = {
  total: number
  completed: number
}

export type TrackerActivity = {
  checkins: TrackerActivityCounts & { early: number }
  cleaning: TrackerActivityCounts
  maintenance: TrackerActivityCounts
}

export type TrackerResponse = {
  date?: string
  from?: string
  to?: string
  items?: TrackerRow[]
  activity?: TrackerActivity
  message?: string
}

export const asTrackerRow = (item: Record<string, unknown>): TrackerRow => ({
  id: String(item.id ?? item.ReservationID ?? ''),
  listingId: String(item.listingId ?? ''),
  guestName: String(item.guestName ?? '—'),
  property: String(item.property ?? '—'),
  checkInDate: String(item.checkInDate ?? ''),
  checkOutDate: String(item.checkOutDate ?? ''),
  status: CHECK_IN_TRACKER_STATUSES.includes(item.status as CheckInTrackerStatus)
    ? (item.status as CheckInTrackerStatus)
    : 'jobs_pending',
  accessGranted: item.accessGranted === true,
  guestEntered: item.guestEntered === true,
  earlyCheckIn: item.earlyCheckIn === true,
  openVisits: Array.isArray(item.openVisits)
    ? item.openVisits
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null
          }
          const visit = entry as Record<string, unknown>
          const kind = visit.kind === 'maintenance' ? 'maintenance' : 'cleaning'
          return {
            id: String(visit.id ?? ''),
            kind,
            scheduledDate: String(visit.scheduledDate ?? ''),
            status: String(visit.status ?? ''),
            title: String(visit.title ?? ''),
          }
        })
        .filter((visit): visit is TrackerOpenVisit => Boolean(visit?.id))
    : [],
})
