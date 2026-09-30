export const CALENDAR_OCCUPANCY_VERSION = 'calendar-occupancy-v1';

export const CALENDAR_CHECKIN_LOOKBACK_DAYS = 120;

export const CALENDAR_METRIC_IDS = [
  'calendarOccupiedNights',
  'calendarPaidByGuest',
  'calendarAveragePaidPerNight',
  'calendarAccommodationRevenue',
  'calendarADR',
] as const;

export type CalendarMetricId = (typeof CALENDAR_METRIC_IDS)[number];

const OCCUPIED_STATUSES = new Set([
  'confirmed',
  'reserved',
  'checked_in',
  'checked-in',
  'checkedin',
]);

const EXCLUDED_STATUSES = new Set([
  'inquiry',
  'declined',
  'expired',
  'canceled',
  'cancelled',
  'closed',
  'no_show',
  'no-show',
  'noshow',
  'owner',
  'ownerstay',
  'blocked',
  'block',
]);

export type CalendarStayInput = {
  reservationId: string;
  unitId: string;
  status: string;
  checkIn: string;
  checkOut: string;
  currency: string | null;
  hostPayout: number | null;
  hostServiceFee: number | null;
  fareCleaning: number | null;
  fareAccommodation: number | null;
  nightlyAccommodation: number[] | null;
};

export type CalendarReservationTrace = {
  reservationId: string;
  unitId: string;
  nights: number;
  paidCents: number | null;
  accommodationCents: number | null;
  method: 'prorated' | 'nightly' | 'mixed' | 'none';
  issues: string[];
};

export type CalendarMonthResult = {
  version: string;
  updatedAt: string;
  propertyId: string;
  period: string;
  metrics: Record<CalendarMetricId, string | null>;
  coverage: {
    occupiedNights: number;
    paidCoveredNights: number;
    accommodationCoveredNights: number;
    adrNights: number;
  };
  methods: Array<'prorated' | 'nightly' | 'mixed'>;
  reservations: CalendarReservationTrace[];
  issues: string[];
  qualityFlags: string[];
};

const asRecord = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const toCents = (value: number) => Math.round(roundMoney(value) * 100);

const centsToDecimal = (cents: number) => (cents / 100).toFixed(2);

export const addCalendarDays = (isoDate: string, days: number) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export const stayNights = (checkIn: string, checkOut: string) => {
  const nights: string[] = [];
  if (!isIsoDate(checkIn) || !isIsoDate(checkOut) || checkOut <= checkIn) {
    return nights;
  }
  let cursor = checkIn;
  let guard = 0;
  while (cursor < checkOut && guard < 400) {
    nights.push(cursor);
    cursor = addCalendarDays(cursor, 1);
    guard += 1;
  }
  return nights;
};

const lastDateOfMonth = (monthId: string) => {
  const [year, month] = monthId.split('-').map(Number);
  const next =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return addCalendarDays(next, -1);
};

export const datesFromThrough = (start: string, end: string) => {
  const dates: string[] = [];
  if (!isIsoDate(start) || !isIsoDate(end) || end < start) return dates;
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 1100) {
    dates.push(cursor);
    cursor = addCalendarDays(cursor, 1);
    guard += 1;
  }
  return dates;
};

export const calendarQueryDates = (fromMonth: string, toMonth: string) =>
  datesFromThrough(
    addCalendarDays(`${fromMonth}-01`, -CALENDAR_CHECKIN_LOOKBACK_DAYS),
    lastDateOfMonth(toMonth),
  );

const normalizeStatus = (status: string) =>
  status.trim().toLowerCase().replace(/\s+/g, '_');

const statusDecision = (status: string) => {
  const normalized = normalizeStatus(status);
  if (!normalized) return 'unknown' as const;
  if (
    normalized.includes('owner') ||
    normalized.includes('block') ||
    normalized.includes('no_show') ||
    normalized.includes('noshow')
  ) {
    return 'excluded' as const;
  }
  if (EXCLUDED_STATUSES.has(normalized)) return 'excluded' as const;
  if (OCCUPIED_STATUSES.has(normalized)) return 'occupied' as const;
  return 'unknown' as const;
};

const reservationFromRaw = (raw: unknown) => {
  let payload: unknown = raw;
  if (typeof payload === 'string' && payload.trim()) {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  const root = asRecord(payload);
  if (!root) return null;
  const nested =
    asRecord(root.reservation) ??
    asRecord(asRecord(root.data)?.reservation) ??
    null;
  if (nested) return nested;
  if (asString(root._id) || asString(root.confirmationCode)) return root;
  return null;
};

const nightlyFromMoney = (money: Record<string, unknown>) => {
  const value = money.nightlyAccommodation;
  if (!Array.isArray(value) || value.length === 0) return null;
  const amounts = value.map((entry) => asNumber(entry));
  if (amounts.some((entry) => entry === null)) return null;
  return amounts as number[];
};

export const calendarStayFromBooking = (
  item: Record<string, unknown>,
  fallbackUnitId: string,
): CalendarStayInput | null => {
  const reservation = reservationFromRaw(item.RawPayload);
  const reservationId =
    asString(item.ReservationID) || asString(reservation?._id);
  if (!reservationId) return null;
  const money = asRecord(reservation?.money) ?? {};
  const listing = asRecord(reservation?.listing);
  const checkIn =
    asString(item.CheckInDate).slice(0, 10) ||
    asString(reservation?.checkInDateLocalized).slice(0, 10);
  const checkOut =
    asString(item.CheckOutDate).slice(0, 10) ||
    asString(reservation?.checkOutDateLocalized).slice(0, 10);
  return {
    reservationId,
    unitId:
      asString(item.ListingID) ||
      asString(reservation?.listingId) ||
      asString(listing?._id) ||
      asString(listing?.id) ||
      fallbackUnitId,
    status: asString(reservation?.status) || asString(item.Status),
    checkIn,
    checkOut,
    currency: asString(money.currency) || asString(item.Currency) || 'EUR',
    hostPayout: asNumber(money.hostPayout),
    hostServiceFee: asNumber(money.hostServiceFee),
    fareCleaning: asNumber(money.fareCleaning),
    fareAccommodation: asNumber(money.fareAccommodation),
    nightlyAccommodation: nightlyFromMoney(money),
  };
};

const spreadCents = (totalCents: number, nightCount: number) => {
  if (nightCount <= 0) return [];
  const sign = totalCents < 0 ? -1 : 1;
  const absolute = Math.abs(totalCents);
  const base = Math.floor(absolute / nightCount);
  const remainder = absolute % nightCount;
  return Array.from({ length: nightCount }, (_, index) =>
    sign * (base + (index < remainder ? 1 : 0)),
  );
};

const sumCents = (values: number[]) =>
  values.reduce((total, value) => total + value, 0);

type PreparedStay = {
  reservationId: string;
  unitId: string;
  nights: string[];
  flagNights: string[];
  paidCents: number | null;
  accommodationCents: number | null;
  paidByNight: Array<number | null>;
  accommodationByNight: Array<number | null>;
  complimentary: boolean;
  method: 'prorated' | 'nightly' | 'mixed' | 'none';
  issues: string[];
};

const moneySignature = (stay: CalendarStayInput) =>
  JSON.stringify({
    hostPayout: stay.hostPayout,
    hostServiceFee: stay.hostServiceFee,
    fareAccommodation: stay.fareAccommodation,
    currency: stay.currency || 'EUR',
    nightly: stay.nightlyAccommodation,
  });

const prepareStay = (
  group: CalendarStayInput[],
  today: string,
): PreparedStay | null => {
  const first = group[0];
  const issues: string[] = [];
  const statuses = new Set(group.map((stay) => normalizeStatus(stay.status)));
  const dateKeys = new Set(group.map((stay) => `${stay.checkIn}|${stay.checkOut}`));
  const moneyKeys = new Set(group.map(moneySignature));
  const unitIds = new Set(group.map((stay) => stay.unitId));
  if (dateKeys.size > 1 || statuses.size > 1 || unitIds.size > 1) {
    const claimed = [
      ...new Set(
        group.flatMap((stay) =>
          stayNights(stay.checkIn, stay.checkOut).filter((night) => night < today),
        ),
      ),
    ];
    return {
      reservationId: first.reservationId,
      unitId: first.unitId,
      nights: [],
      flagNights: claimed,
      paidCents: null,
      accommodationCents: null,
      paidByNight: [],
      accommodationByNight: [],
      complimentary: false,
      method: 'none',
      issues: ['contradictory'],
    };
  }
  if (moneyKeys.size > 1) {
    issues.push('contradictory');
  }
  const decision = statusDecision(first.status);
  if (decision !== 'occupied') {
    if (decision === 'unknown') issues.push('unknown_status');
    return null;
  }
  const allNights = stayNights(first.checkIn, first.checkOut);
  const realized = allNights.filter((night) => night < today);
  if (allNights.length === 0) issues.push('invalid_dates');
  const currency = (first.currency || 'EUR').toUpperCase();
  const currencyBlocked = currency !== 'EUR';
  if (currencyBlocked) issues.push('currency');
  const paidKnown =
    !currencyBlocked &&
    moneyKeys.size === 1 &&
    !(first.hostPayout === null && first.hostServiceFee === null);
  const paidCents = paidKnown
    ? toCents((first.hostPayout ?? 0) + (first.hostServiceFee ?? 0))
    : null;
  const accommodationCents =
    !currencyBlocked && moneyKeys.size === 1 && first.fareAccommodation !== null
      ? toCents(first.fareAccommodation)
      : null;
  const complimentary = paidCents === 0;
  let method: PreparedStay['method'] = paidCents === null ? 'none' : 'prorated';
  let accommodationByNight: Array<number | null> = realized.map(() => null);
  let paidByNight: Array<number | null> = realized.map(() => null);
  const nightly = first.nightlyAccommodation;
  const nightlyCents =
    nightly && nightly.length === allNights.length
      ? nightly.map((amount) => toCents(amount))
      : null;
  const nightlyMatchesAccommodation =
    nightlyCents !== null &&
    accommodationCents !== null &&
    sumCents(nightlyCents) === accommodationCents;
  const nightlyMatchesPaid =
    nightlyCents !== null &&
    paidCents !== null &&
    sumCents(nightlyCents) === paidCents;
  if (
    nightly &&
    nightly.length > 0 &&
    !nightlyMatchesAccommodation &&
    !nightlyMatchesPaid
  ) {
    issues.push('nightly_mismatch');
  }
  const realizedIndex = new Map(
    realized.map((night) => [night, allNights.indexOf(night)]),
  );
  const takeRealized = (amounts: number[]) =>
    realized.map((night) => amounts[realizedIndex.get(night) ?? 0]);
  if (nightlyMatchesAccommodation && nightlyCents) {
    accommodationByNight = takeRealized(nightlyCents);
  } else if (accommodationCents !== null) {
    accommodationByNight = takeRealized(
      spreadCents(accommodationCents, allNights.length),
    );
  }
  if (nightlyMatchesPaid && nightlyCents) {
    paidByNight = takeRealized(nightlyCents);
  } else if (paidCents !== null) {
    paidByNight = takeRealized(spreadCents(paidCents, allNights.length));
  }
  const usedNightly = nightlyMatchesAccommodation || nightlyMatchesPaid;
  const usedProrate =
    (accommodationCents !== null && !nightlyMatchesAccommodation) ||
    (paidCents !== null && !nightlyMatchesPaid);
  if (usedNightly && usedProrate) method = 'mixed';
  else if (usedNightly) method = 'nightly';
  else if (paidCents !== null || accommodationCents !== null) method = 'prorated';
  else method = 'none';
  return {
    reservationId: first.reservationId,
    unitId: first.unitId,
    nights: realized,
    flagNights:
      realized.length > 0
        ? realized
        : isIsoDate(first.checkIn)
          ? [first.checkIn]
          : [],
    paidCents,
    accommodationCents,
    paidByNight,
    accommodationByNight,
    complimentary,
    method,
    issues,
  };
};

const emptyMetrics = (): Record<CalendarMetricId, string | null> => ({
  calendarOccupiedNights: '0',
  calendarPaidByGuest: null,
  calendarAveragePaidPerNight: null,
  calendarAccommodationRevenue: null,
  calendarADR: null,
});

export const calendarMetricsForMonth = (input: {
  propertyId: string;
  period: string;
  stays: CalendarStayInput[];
  today: string;
  updatedAt: string;
}): CalendarMonthResult => {
  const groups = new Map<string, CalendarStayInput[]>();
  for (const stay of input.stays) {
    const current = groups.get(stay.reservationId) ?? [];
    current.push(stay);
    groups.set(stay.reservationId, current);
  }
  const prepared = [...groups.values()]
    .map((group) => prepareStay(group, input.today))
    .filter((stay): stay is PreparedStay => stay !== null);

  type NightRow = {
    reservationId: string;
    unitId: string;
    date: string;
    paidCents: number | null;
    accommodationCents: number | null;
    complimentary: boolean;
    method: PreparedStay['method'];
    issues: string[];
  };
  const rows: NightRow[] = [];
  for (const stay of prepared) {
    stay.nights.forEach((date, index) => {
      if (!date.startsWith(input.period)) return;
      rows.push({
        reservationId: stay.reservationId,
        unitId: stay.unitId,
        date,
        paidCents: stay.issues.includes('contradictory')
          ? null
          : stay.paidByNight[index],
        accommodationCents: stay.issues.includes('contradictory')
          ? null
          : stay.accommodationByNight[index],
        complimentary: stay.complimentary,
        method: stay.method,
        issues: stay.issues,
      });
    });
  }
  const byUnitDate = new Map<string, NightRow[]>();
  for (const row of rows) {
    const key = `${row.unitId}|${row.date}`;
    const current = byUnitDate.get(key) ?? [];
    current.push(row);
    byUnitDate.set(key, current);
  }
  const overlapKeys = new Set(
    [...byUnitDate.entries()]
      .filter(([, grouped]) => new Set(grouped.map((row) => row.reservationId)).size > 1)
      .map(([key]) => key),
  );

  let paidCoveredNights = 0;
  let accommodationCoveredNights = 0;
  let adrNights = 0;
  let paidTotal = 0;
  let accommodationTotal = 0;
  let paidComplete = true;
  let accommodationComplete = true;
  let adrComplete = true;
  const reservationTotals = new Map<
    string,
    CalendarReservationTrace & { methodSet: Set<CalendarReservationTrace['method']> }
  >();

  for (const [key, grouped] of byUnitDate) {
    const overlap = overlapKeys.has(key);
    const uniqueReservations = [
      ...new Map(grouped.map((row) => [row.reservationId, row])).values(),
    ];
    for (const row of uniqueReservations) {
      const paidCents = overlap ? null : row.paidCents;
      const accommodationCents = overlap ? null : row.accommodationCents;
      const complimentary = row.complimentary && !overlap;
      if (paidCents === null) paidComplete = false;
      else {
        paidCoveredNights += 1;
        paidTotal += paidCents;
      }
      if (!complimentary) {
        if (accommodationCents === null) {
          accommodationComplete = false;
          adrComplete = false;
        } else {
          accommodationCoveredNights += 1;
          accommodationTotal += accommodationCents;
          adrNights += 1;
        }
      }
      const trace = reservationTotals.get(row.reservationId) ?? {
        reservationId: row.reservationId,
        unitId: row.unitId,
        nights: 0,
        paidCents: 0,
        accommodationCents: 0,
        method: row.method,
        issues: [...row.issues],
        methodSet: new Set<CalendarReservationTrace['method']>([row.method]),
      };
      trace.nights += 1;
      if (overlap && !trace.issues.includes('overlap')) trace.issues.push('overlap');
      if (paidCents === null) trace.paidCents = null;
      else if (trace.paidCents !== null) trace.paidCents += paidCents;
      if (accommodationCents === null) trace.accommodationCents = null;
      else if (trace.accommodationCents !== null) {
        trace.accommodationCents += accommodationCents;
      }
      trace.methodSet.add(row.method);
      reservationTotals.set(row.reservationId, trace);
    }
  }

  const occupiedNights = byUnitDate.size;
  const metrics = emptyMetrics();
  metrics.calendarOccupiedNights = String(occupiedNights);
  if (occupiedNights > 0 && paidComplete) {
    metrics.calendarPaidByGuest = centsToDecimal(paidTotal);
    metrics.calendarAveragePaidPerNight = centsToDecimal(
      Math.round(paidTotal / occupiedNights),
    );
  }
  const nonComplimentaryNights = [...byUnitDate.values()].filter((grouped) => {
    const overlap = overlapKeys.has(`${grouped[0].unitId}|${grouped[0].date}`);
    return overlap || !grouped[0].complimentary;
  }).length;
  if (nonComplimentaryNights > 0 && accommodationComplete) {
    metrics.calendarAccommodationRevenue = centsToDecimal(accommodationTotal);
  }
  if (adrNights > 0 && adrComplete && accommodationComplete) {
    metrics.calendarADR = centsToDecimal(
      Math.round(accommodationTotal / adrNights),
    );
  }

  const reservations = [...reservationTotals.values()]
    .map((trace) => ({
      reservationId: trace.reservationId,
      unitId: trace.unitId,
      nights: trace.nights,
      paidCents: trace.paidCents,
      accommodationCents: trace.accommodationCents,
      method: trace.methodSet.size === 1 ? [...trace.methodSet][0] : 'mixed',
      issues: [...new Set(trace.issues)],
    }))
    .sort((left, right) => left.reservationId.localeCompare(right.reservationId));

  const issueSet = new Set<string>();
  for (const stay of prepared) {
    if (stay.flagNights.some((night) => night.startsWith(input.period))) {
      for (const issue of stay.issues) issueSet.add(issue);
    }
  }
  for (const group of groups.values()) {
    const decision = statusDecision(group[0].status);
    if (decision !== 'unknown') continue;
    if (stayNights(group[0].checkIn, group[0].checkOut).some((night) => night.startsWith(input.period) && night < input.today)) {
      issueSet.add('unknown_status');
    }
  }
  if (overlapKeys.size > 0) issueSet.add('overlap');
  const complimentaryInMonth = [...byUnitDate.values()].some(
    (grouped) => !overlapKeys.has(`${grouped[0].unitId}|${grouped[0].date}`) && grouped[0].complimentary,
  );
  if (complimentaryInMonth) issueSet.add('complimentary');

  const qualityFlags: string[] = [];
  if (issueSet.has('overlap')) qualityFlags.push('calendarOverlap');
  if (occupiedNights > 0 && !paidComplete) qualityFlags.push('calendarPriceIncomplete');
  if (nonComplimentaryNights > 0 && !accommodationComplete) {
    qualityFlags.push('calendarAccommodationIncomplete');
  }
  if (issueSet.has('contradictory') || issueSet.has('invalid_dates')) {
    qualityFlags.push('calendarContradictory');
  }
  if (issueSet.has('unknown_status')) qualityFlags.push('calendarUnknownStatus');
  if (issueSet.has('nightly_mismatch')) qualityFlags.push('calendarNightlyMismatch');
  if (issueSet.has('currency')) qualityFlags.push('calendarCurrency');
  if (issueSet.has('complimentary')) qualityFlags.push('calendarComplimentary');

  const methods = [
    ...new Set(
      reservations
        .map((reservation) => reservation.method)
        .filter(
          (method): method is 'prorated' | 'nightly' | 'mixed' =>
            method === 'prorated' || method === 'nightly' || method === 'mixed',
        ),
    ),
  ];

  return {
    version: CALENDAR_OCCUPANCY_VERSION,
    updatedAt: input.updatedAt,
    propertyId: input.propertyId,
    period: input.period,
    metrics,
    coverage: {
      occupiedNights,
      paidCoveredNights,
      accommodationCoveredNights,
      adrNights,
    },
    methods,
    reservations,
    issues: [...issueSet].sort(),
    qualityFlags,
  };
};

export const applyCalendarMetrics = (
  metrics: Record<string, string | null>,
  result: CalendarMonthResult,
) => {
  const next = { ...metrics };
  for (const id of CALENDAR_METRIC_IDS) {
    next[id] = result.metrics[id];
  }
  return next;
};
