import { parseHhMmToMinutes } from './visit-task-utils';

export const DEFAULT_CHECK_IN_TIME = '15:00';
export const CHECK_IN_TIME_ACTOR = 'check-in-time';
export const PLANNED_ARRIVAL_FIELD = 'PlannedArrival';

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();

export const normalizePlannedArrival = (value: unknown) => {
  const text = asString(value);
  const match = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) {
    return '';
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours > 23 ||
    minutes > 59
  ) {
    return '';
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const plannedArrivalFromGuestyReservation = (
  reservation: Record<string, unknown> | null | undefined,
) => {
  if (!reservation) {
    return undefined;
  }
  const candidates = [
    reservation.plannedArrival,
    reservation.plannedArrivalTime,
    reservation.checkInTime,
    (reservation.listing as Record<string, unknown> | undefined)?.defaultCheckInTime,
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }
    const normalized = normalizePlannedArrival(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return undefined;
};

export const checkInTimeFromBooking = (item: Record<string, unknown>) =>
  normalizePlannedArrival(item.PlannedArrival ?? item.plannedArrival) ||
  DEFAULT_CHECK_IN_TIME;

export const isCheckInTimeDue = (nowTime: string, checkInTime: string) => {
  const now = parseHhMmToMinutes(nowTime);
  const due = parseHhMmToMinutes(checkInTime);
  if (now == null || due == null) {
    return false;
  }
  return now >= due;
};
