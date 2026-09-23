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

export const CLEANING_PLAN_REOPEN_CUTOFF_TIME = '10:00';

export const canReopenCleaningPlanForBookingChange = ({
  plannedDate,
  today,
  nowTime,
}: {
  plannedDate: string;
  today: string;
  nowTime: string;
}) => {
  if (!DATE_ONLY.test(plannedDate) || !DATE_ONLY.test(today)) {
    return false;
  }
  if (plannedDate < today) {
    return false;
  }
  if (plannedDate > today) {
    return true;
  }
  return nowTime < CLEANING_PLAN_REOPEN_CUTOFF_TIME;
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

export type VisitBookingContextChangeBlock = {
  title: string;
  facts: string[];
};

const beforeAfter = (label: string, from: string, to: string) =>
  `Antes ${label} ${from}, ahora ${to}`;

export const describeVisitBookingContextChanges = (
  visitTitle: string,
  before: VisitBookingContextSnapshot | null,
  after: VisitBookingContextSnapshot | null,
): VisitBookingContextChangeBlock | null => {
  const title = asString(visitTitle) || 'Limpieza';
  if (!before && !after) {
    return null;
  }
  if (!before && after) {
    const checkIn = formatCleaningPlanDateDdMm(after.checkInDate) || '—';
    return { title, facts: [`Nueva reserva con check-in ${checkIn}`] };
  }
  if (before && !after) {
    const checkIn = formatCleaningPlanDateDdMm(before.checkInDate) || '—';
    return { title, facts: [`Ya no hay reserva (antes check-in ${checkIn})`] };
  }
  const previous = before as VisitBookingContextSnapshot;
  const next = after as VisitBookingContextSnapshot;
  const facts: string[] = [];
  if (previous.checkInDate !== next.checkInDate) {
    const from = formatCleaningPlanDateDdMm(previous.checkInDate) || '—';
    const to = formatCleaningPlanDateDdMm(next.checkInDate) || '—';
    facts.push(beforeAfter('check-in', from, to));
  }
  if (previous.guestCount !== next.guestCount) {
    facts.push(
      beforeAfter(
        'huéspedes',
        String(previous.guestCount),
        String(next.guestCount),
      ),
    );
  }
  if (previous.giftCardLabel !== next.giftCardLabel) {
    facts.push(
      beforeAfter(
        'tarjeta',
        previous.giftCardLabel || '—',
        next.giftCardLabel || '—',
      ),
    );
  }
  if (previous.hasBookingGap !== next.hasBookingGap) {
    facts.push(
      `Antes ${gapLabel(previous.hasBookingGap)}, ahora ${gapLabel(next.hasBookingGap)}`,
    );
  }
  if (previous.sofaBedYes !== next.sofaBedYes) {
    facts.push(
      beforeAfter(
        'sofá',
        previous.sofaBedYes ? 'sí' : 'no',
        next.sofaBedYes ? 'sí' : 'no',
      ),
    );
  }
  if (
    previous.confirmationCode !== next.confirmationCode &&
    previous.checkInDate === next.checkInDate
  ) {
    facts.push(
      beforeAfter(
        'reserva',
        previous.confirmationCode || '—',
        next.confirmationCode || '—',
      ),
    );
  }
  if (facts.length === 0) {
    return null;
  }
  return { title, facts };
};

export const formatCleaningPlanBookingContextSlackText = ({
  dates,
  blocks,
  linkedDates,
}: {
  dates: string[];
  blocks: VisitBookingContextChangeBlock[];
  linkedDates: string[];
}) => {
  const visibleBlocks = blocks.filter((block) => block.facts.length > 0);
  if (dates.length === 0 || visibleBlocks.length === 0) {
    return '';
  }
  const dateList = dates.join(', ');
  const header =
    dates.length === 1
      ? `Se reabrió el plan de limpieza del ${dateList} por cambios en una reserva.`
      : `Se reabrieron planes de limpieza (${dateList}) por cambios en una reserva.`;
  const factLines = (block: VisitBookingContextChangeBlock) =>
    block.facts.map((fact) => `- ${fact}`).join('\n');
  const body =
    visibleBlocks.length === 1
      ? `${header} ${visibleBlocks[0].title}:\n${factLines(visibleBlocks[0])}`
      : [header, '', ...visibleBlocks.flatMap((block) => [
          `${block.title}:`,
          factLines(block),
        ])].join('\n');
  const reviewDates = linkedDates.join(', ');
  return `${body}\n\nRevisar plan y volver a marcarlo como listo: ${reviewDates}`;
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

const visitIdOf = (value: Record<string, unknown>) =>
  asString(value.id) || asString(value.visitId);

const listingKeyOf = (value: Record<string, unknown>) =>
  asString(value.propertyId) ||
  asString(value.listingId) ||
  visitIdOf(value);

const preferPlanVisit = (
  candidate: Record<string, unknown>,
  current: Record<string, unknown>,
  planVisitIds: Set<string>,
) => {
  const candidateOnPlan = planVisitIds.has(visitIdOf(candidate));
  const currentOnPlan = planVisitIds.has(visitIdOf(current));
  if (candidateOnPlan !== currentOnPlan) {
    return candidateOnPlan;
  }
  return asString(candidate.title).length > asString(current.title).length;
};

export const selectPlanVisitsForBookingContextChange = (
  visits: Record<string, unknown>[],
  planItems: Record<string, unknown>[],
) => {
  const planVisitIds = new Set(
    planItems.map((item) => visitIdOf(item)).filter(Boolean),
  );
  const planListingKeys = new Set(
    planItems.map((item) => listingKeyOf(item)).filter(Boolean),
  );
  const matching = visits.filter((visit) => {
    const visitId = visitIdOf(visit);
    const listingKey = listingKeyOf(visit);
    return (
      (visitId && planVisitIds.has(visitId)) ||
      (listingKey && planListingKeys.has(listingKey))
    );
  });
  const uniqueByListing = new Map<string, Record<string, unknown>>();
  for (const visit of matching) {
    const key = listingKeyOf(visit);
    if (!key) {
      continue;
    }
    const existing = uniqueByListing.get(key);
    if (!existing || preferPlanVisit(visit, existing, planVisitIds)) {
      uniqueByListing.set(key, visit);
    }
  }
  return [...uniqueByListing.values()];
};
