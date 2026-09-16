import {
  isActivePlannerStatus,
  isEarlyCheckInEnabled,
  PLANNER_WINDOW_DAYS,
} from './bookings-planner';
import {
  addDaysToDateString,
  getInclusiveDayCount,
} from './date-range';
import { resolveYallaPropertyLabel } from './property-identity';

export const CHECK_IN_TRACKER_STATUSES = [
  'jobs_pending',
  'property_ready',
  'access_granted',
  'guest_entered',
] as const;

export type CheckInTrackerStatus = (typeof CHECK_IN_TRACKER_STATUSES)[number];

export const CHECK_IN_LOOKBACK_DAYS = 1;
export const CHECK_IN_TRACKER_MAX_RANGE_DAYS = 14;
export const CHECK_IN_TRACKER_UPCOMING_DAYS = PLANNER_WINDOW_DAYS;

export type DayActivityCounts = {
  total: number;
  completed: number;
};

export type DayActivity = {
  checkins: DayActivityCounts & { early: number };
  cleaning: DayActivityCounts;
  maintenance: DayActivityCounts;
};

const CLEANING_VISIT_TYPE_ID = 'visit_type_cleaning';
const MAINTENANCE_VISIT_TYPE_IDS = [
  'visit_type_maintenance',
  'visit_type_deep_property_check',
  'visit_type_property_check',
  'visit_type_fixings',
  'visit_type_emergency',
];
const MAINTENANCE_TEAM_ID = 'team_maintenance';

export type TrackerFlags = {
  accessGranted: boolean;
  guestEntered: boolean;
};

export type TrackerVisitKind = 'cleaning' | 'maintenance';

export type BlockingVisitSummary = {
  id: string;
  propertyId: string;
  visitTypeId: string;
  kind: TrackerVisitKind;
  scheduledDate: string;
  status: string;
  title: string;
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : value == null ? '' : String(value);

export const isIsoDateOnly = (value?: string) =>
  Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()));

export const resolveTrackerDateWindow = ({
  date,
  from,
  to,
  today,
}: {
  date?: string;
  from?: string;
  to?: string;
  today: string;
}):
  | { ok: true; from: string; to: string }
  | { ok: false; error: string } => {
  const start = from?.trim();
  const end = to?.trim();
  if (start || end) {
    if (!start || !end || !isIsoDateOnly(start) || !isIsoDateOnly(end)) {
      return { ok: false, error: 'from and to must be YYYY-MM-DD.' };
    }
    const orderedFrom = start <= end ? start : end;
    const orderedTo = start <= end ? end : start;
    const days = getInclusiveDayCount(orderedFrom, orderedTo);
    if (days < 1 || days > CHECK_IN_TRACKER_MAX_RANGE_DAYS) {
      return {
        ok: false,
        error: `range must be 1-${CHECK_IN_TRACKER_MAX_RANGE_DAYS} days.`,
      };
    }
    return { ok: true, from: orderedFrom, to: orderedTo };
  }

  const selected = date?.trim() || today;
  if (!isIsoDateOnly(selected)) {
    return { ok: false, error: 'date must be YYYY-MM-DD.' };
  }
  return { ok: true, from: selected, to: selected };
};

export const toDateOnly = (value: unknown) => asString(value).slice(0, 10);

export const readTrackerFlags = (item: Record<string, unknown>): TrackerFlags => ({
  accessGranted: item.CheckInAccessGranted === true,
  guestEntered: item.CheckInGuestEntered === true,
});

export const resolveCheckInTrackerStatus = (
  flags: TrackerFlags,
  hasBlockingVisits: boolean,
): CheckInTrackerStatus => {
  if (hasBlockingVisits) {
    return 'jobs_pending';
  }
  if (flags.guestEntered) {
    return 'guest_entered';
  }
  if (flags.accessGranted) {
    return 'access_granted';
  }
  return 'property_ready';
};

export const applyTrackerFlagPatch = (
  current: TrackerFlags,
  patch: { accessGranted?: boolean; guestEntered?: boolean },
):
  | { ok: true; flags: TrackerFlags }
  | { ok: false; error: 'no_fields' | 'guest_entered_requires_access' } => {
  if (patch.accessGranted === undefined && patch.guestEntered === undefined) {
    return { ok: false, error: 'no_fields' };
  }
  const accessGranted = patch.accessGranted ?? current.accessGranted;
  let guestEntered = patch.guestEntered ?? current.guestEntered;
  if (patch.accessGranted === false) {
    guestEntered = false;
  }
  if (guestEntered && !accessGranted) {
    return { ok: false, error: 'guest_entered_requires_access' };
  }
  return { ok: true, flags: { accessGranted, guestEntered } };
};

export const isOpenVisitStatus = (status: unknown) => {
  const normalized = asString(status).toUpperCase();
  return normalized !== 'COMPLETED' && normalized !== 'CANCELLED';
};

export const trackerVisitKind = (
  visit: Record<string, unknown>,
): TrackerVisitKind | null => {
  const visitTypeId = asString(visit.visitTypeId);
  const folded = visitTypeId.toLowerCase();
  if (
    folded === CLEANING_VISIT_TYPE_ID ||
    folded.includes('cleaning')
  ) {
    return 'cleaning';
  }
  if (MAINTENANCE_VISIT_TYPE_IDS.includes(visitTypeId)) {
    return 'maintenance';
  }
  if (asString(visit.teamId) === MAINTENANCE_TEAM_ID) {
    return 'maintenance';
  }
  return null;
};

export const visitMatchesListing = (
  visit: Record<string, unknown>,
  listingId: string,
) => {
  const listing = listingId.trim();
  if (!listing) {
    return false;
  }
  return asString(visit.propertyId) === listing;
};

export const isBlockingVisitForCheckIn = (
  visit: Record<string, unknown>,
  checkInDate: string,
  listingId: string,
) => {
  if (!visitMatchesListing(visit, listingId)) {
    return false;
  }
  if (!trackerVisitKind(visit)) {
    return false;
  }
  if (!isOpenVisitStatus(visit.status)) {
    return false;
  }
  const scheduled = toDateOnly(visit.scheduledDate);
  const checkIn = toDateOnly(checkInDate);
  if (!isIsoDateOnly(scheduled) || !isIsoDateOnly(checkIn)) {
    return false;
  }
  const minDate = addDaysToDateString(checkIn, -CHECK_IN_LOOKBACK_DAYS);
  return scheduled >= minDate && scheduled <= checkIn;
};

export const blockingVisitsForListing = (
  visits: Record<string, unknown>[],
  checkInDate: string,
  listingId: string,
): BlockingVisitSummary[] =>
  visits
    .filter((visit) => isBlockingVisitForCheckIn(visit, checkInDate, listingId))
    .map((visit) => {
      const kind = trackerVisitKind(visit) ?? 'cleaning';
      return {
        id: asString(visit.id),
        propertyId: asString(visit.propertyId),
        visitTypeId: asString(visit.visitTypeId),
        kind,
        scheduledDate: toDateOnly(visit.scheduledDate),
        status: asString(visit.status).toUpperCase(),
        title: asString(visit.title) || asString(visit.visitTypeId) || kind,
      };
    });

export const shouldIncludeBooking = (item: Record<string, unknown>) =>
  isActivePlannerStatus(item.Status ?? item.status);

export const bookingHasEarlyCheckIn = (item: Record<string, unknown>) =>
  item.EarlyCheckInOn === true ||
  item.earlyCheckInOn === true ||
  item.earlyCheckIn === true ||
  isEarlyCheckInEnabled(item.EarlyCheckIn ?? item.earlyCheckIn);

export const isCompletedVisitStatus = (status: unknown) =>
  asString(status).toUpperCase() === 'COMPLETED';

export const summarizeDayActivity = (
  bookings: Record<string, unknown>[],
  visits: Record<string, unknown>[],
  date: string,
): DayActivity => {
  const dayBookings = bookings.filter(
    (item) => toDateOnly(item.CheckInDate ?? item.checkInDate) === date,
  );
  const checkins = {
    total: dayBookings.length,
    completed: 0,
    early: 0,
  };
  for (const item of dayBookings) {
    const row = mapCheckInTrackerRow(item, visits);
    if (row.status === 'guest_entered') {
      checkins.completed += 1;
    }
    if (row.earlyCheckIn) {
      checkins.early += 1;
    }
  }

  const cleaning = { total: 0, completed: 0 };
  const maintenance = { total: 0, completed: 0 };
  for (const visit of visits) {
    if (toDateOnly(visit.scheduledDate) !== date) {
      continue;
    }
    if (asString(visit.status).toUpperCase() === 'CANCELLED') {
      continue;
    }
    const kind = trackerVisitKind(visit);
    if (kind === 'cleaning') {
      cleaning.total += 1;
      if (isCompletedVisitStatus(visit.status)) {
        cleaning.completed += 1;
      }
    } else if (kind === 'maintenance') {
      maintenance.total += 1;
      if (isCompletedVisitStatus(visit.status)) {
        maintenance.completed += 1;
      }
    }
  }

  return { checkins, cleaning, maintenance };
};

export const mapCheckInTrackerRow = (
  item: Record<string, unknown>,
  visits: Record<string, unknown>[],
) => {
  const listingId = asString(item.ListingID ?? item.listingId);
  const checkInDate = toDateOnly(item.CheckInDate ?? item.checkInDate);
  const flags = readTrackerFlags(item);
  const openVisits = blockingVisitsForListing(visits, checkInDate, listingId);
  const property =
    resolveYallaPropertyLabel({
      id: listingId,
      listingNickname: asString(item.ListingNickname ?? item.ListingName),
      nickname: asString(item.ListingNickname ?? item.ListingName),
    }) || listingId;
  return {
    id: asString(item.ReservationID ?? item.id),
    listingId,
    guestName: asString(item.GuestName) || '—',
    property: property || '—',
    checkInDate,
    checkOutDate: toDateOnly(item.CheckOutDate ?? item.checkOutDate),
    status: resolveCheckInTrackerStatus(flags, openVisits.length > 0),
    accessGranted: flags.accessGranted,
    guestEntered: flags.guestEntered,
    earlyCheckIn: bookingHasEarlyCheckIn(item),
    openVisits,
  };
};
