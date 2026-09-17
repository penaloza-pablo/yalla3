import {
  resolveCheckInTrackerStatus,
} from '../../../amplify/functions/shared/check-in-tracker'
import type { TrackerRow } from '../../bookings/checkInTrackerShared'
import type { CheckinAction, CheckinGuest } from './CheckinWidget'

export const trackerRowToGuest = (row: TrackerRow): CheckinGuest => ({
  id: row.id,
  name: row.guestName.trim() || '—',
  property: row.property.trim() || '—',
  checkInDate: row.checkInDate,
  accessGranted: row.accessGranted,
  entered: row.guestEntered,
  doNotEarlyCheckIn: row.doNotEarlyCheckIn,
  visits: row.openVisits.map((visit) => ({
    id: visit.id,
    type: visit.kind,
    date: visit.scheduledDate,
    closed: false,
  })),
})

export const checkinActionToPatch = (
  action: CheckinAction,
): { accessGranted?: boolean; guestEntered?: boolean } | null => {
  if (action === 'grant-access') {
    return { accessGranted: true }
  }
  if (action === 'mark-entered') {
    return { guestEntered: true }
  }
  if (action === 'undo-entry') {
    return { guestEntered: false }
  }
  if (action === 'revoke-access') {
    return { accessGranted: false }
  }
  return null
}

export const applyTrackerFlagsToRow = (
  row: TrackerRow,
  flags: { accessGranted: boolean; guestEntered: boolean },
): TrackerRow => ({
  ...row,
  accessGranted: flags.accessGranted,
  guestEntered: flags.guestEntered,
  status: resolveCheckInTrackerStatus(flags, row.openVisits.length > 0),
})

export const sortUpcomingTrackerRows = (rows: TrackerRow[]) =>
  [...rows].sort((left, right) => {
    const date = left.checkInDate.localeCompare(right.checkInDate)
    if (date !== 0) {
      return date
    }
    const done =
      Number(left.status === 'guest_entered') -
      Number(right.status === 'guest_entered')
    if (done !== 0) {
      return done
    }
    const property = left.property.localeCompare(right.property, 'es')
    if (property !== 0) {
      return property
    }
    return left.guestName.localeCompare(right.guestName, 'es')
  })
