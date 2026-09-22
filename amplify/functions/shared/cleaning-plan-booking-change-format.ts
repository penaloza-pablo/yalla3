import { addDaysToDateString, listDatesInRange } from './date-range';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_LOOKBACK_DAYS = 7;
const MAX_CANDIDATE_DATES = 16;

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const formatCleaningPlanDateDdMm = (dateOnly: string) => {
  const match = asString(dateOnly).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return asString(dateOnly);
  }
  return `${match[3]}/${match[2]}`;
};

export type VisitBookingContextSnapshot = {
  confirmationCode: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
  giftCardLabel: string;
  hasBookingGap: boolean;
  sofaBedYes: boolean;
};

export const candidateCleaningPlanDatesForBookingChange = ({
  currentCheckIn,
  previousCheckIn,
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
  today,
}: {
  currentCheckIn?: string;
  previousCheckIn?: string;
  lookbackDays?: number;
  today: string;
}) => {
  const checkIns = [asString(currentCheckIn), asString(previousCheckIn)].filter(
    (value) => DATE_ONLY.test(value),
  );
  if (checkIns.length === 0 || !DATE_ONLY.test(today)) {
    return [] as string[];
  }
  const minCheckIn = checkIns.reduce((left, right) =>
    left < right ? left : right,
  );
  const maxCheckIn = checkIns.reduce((left, right) =>
    left > right ? left : right,
  );
  const lookback = Math.max(0, Math.min(lookbackDays, MAX_CANDIDATE_DATES));
  const windowStart = addDaysToDateString(minCheckIn, -lookback);
  const earliest = today;
  const from = windowStart < earliest ? earliest : windowStart;
  if (from > maxCheckIn) {
    return [];
  }
  const dates = listDatesInRange(from, maxCheckIn);
  if (dates.length <= MAX_CANDIDATE_DATES) {
    return dates;
  }
  return dates.slice(dates.length - MAX_CANDIDATE_DATES);
};

const gapLabel = (hasGap: boolean) =>
  hasGap ? 'con hueco' : 'sin hueco';

export const describeVisitBookingContextChanges = (
  visitTitle: string,
  before: VisitBookingContextSnapshot | null,
  after: VisitBookingContextSnapshot | null,
) => {
  const label = asString(visitTitle) || 'Limpieza';
  if (!before && !after) {
    return [] as string[];
  }
  if (!before && after) {
    const checkIn = formatCleaningPlanDateDdMm(after.checkInDate) || '—';
    return [`${label}: nueva reserva con check-in ${checkIn}`];
  }
  if (before && !after) {
    const checkIn = formatCleaningPlanDateDdMm(before.checkInDate) || '—';
    return [`${label}: ya no hay reserva (antes check-in ${checkIn})`];
  }
  const previous = before as VisitBookingContextSnapshot;
  const next = after as VisitBookingContextSnapshot;
  const lines: string[] = [];
  if (previous.checkInDate !== next.checkInDate) {
    const from = formatCleaningPlanDateDdMm(previous.checkInDate) || '—';
    const to = formatCleaningPlanDateDdMm(next.checkInDate) || '—';
    lines.push(`${label}: antes check-in ${from} y ahora ${to}`);
  }
  if (previous.guestCount !== next.guestCount) {
    lines.push(
      `${label}: huéspedes ${previous.guestCount} → ${next.guestCount}`,
    );
  }
  if (previous.giftCardLabel !== next.giftCardLabel) {
    lines.push(
      `${label}: tarjeta ${previous.giftCardLabel || '—'} → ${next.giftCardLabel || '—'}`,
    );
  }
  if (previous.hasBookingGap !== next.hasBookingGap) {
    lines.push(
      `${label}: ${gapLabel(previous.hasBookingGap)} → ${gapLabel(next.hasBookingGap)}`,
    );
  }
  if (previous.sofaBedYes !== next.sofaBedYes) {
    lines.push(
      `${label}: sofá ${previous.sofaBedYes ? 'sí' : 'no'} → ${next.sofaBedYes ? 'sí' : 'no'}`,
    );
  }
  if (
    previous.confirmationCode !== next.confirmationCode &&
    previous.checkInDate === next.checkInDate
  ) {
    lines.push(
      `${label}: reserva ${previous.confirmationCode || '—'} → ${next.confirmationCode || '—'}`,
    );
  }
  return lines;
};

export type PlannerCleaningContextFields = {
  checkInDate?: string;
  checkOutDate?: string;
  guestCount?: number;
  giftCard?: string;
  linen?: string;
  confirmationCode?: string;
  listingId?: string;
  listingNickname?: string;
  status?: string;
};

export const plannerFieldsAffectCleaningContext = (
  previous: PlannerCleaningContextFields | null | undefined,
  current: PlannerCleaningContextFields,
) => {
  if (!previous) {
    return true;
  }
  return (
    asString(previous.checkInDate) !== asString(current.checkInDate) ||
    asString(previous.checkOutDate) !== asString(current.checkOutDate) ||
    (previous.guestCount ?? 0) !== (current.guestCount ?? 0) ||
    asString(previous.giftCard) !== asString(current.giftCard) ||
    asString(previous.linen) !== asString(current.linen) ||
    asString(previous.confirmationCode) !== asString(current.confirmationCode) ||
    asString(previous.listingId) !== asString(current.listingId) ||
    asString(previous.listingNickname) !== asString(current.listingNickname) ||
    asString(previous.status) !== asString(current.status)
  );
};
