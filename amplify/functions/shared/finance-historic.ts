export const HISTORIC_ACCOUNT_ID = 'yalla';
export const EXTERNAL_PERIOD_EXCLUSIVE_END = '2026-08';
export const NATIVE_PERIOD_START = '2026-08';
export const PILOT_PROPERTY_KEYS = ['owners:almendro'] as const;
export const PILOT_SNAPSHOT_NICKNAME = 'Almendro';
export const HISTORIC_SCHEMA_VERSION = 1;

export const REVIEW_METRIC_IDS = [
  'fiveStarReviewCount',
  'underFiveStarReviewCount',
  'rescuedUnderFiveStarReviewPercent',
] as const;

export type ReviewMetricId = (typeof REVIEW_METRIC_IDS)[number];

export const SOURCE_FIELD_MAP = {
  totalPaidByGuest: 'paidByGuest',
  cleaningPaidByGuest: 'cleaningPaidByGuest',
  channelFee: 'channelFee',
  managementFee: 'managementFee',
  managementFeeIva: 'managementFeeVat',
  netEarnings: 'netEarnings',
  totalExpenses: 'totalExpenses',
  fixedRent: 'fixedRent',
  ourProfit: 'ourProfit',
} as const;

export type SourceMetricKey = keyof typeof SOURCE_FIELD_MAP;

export type MetricPolarity = 'benefit' | 'cost' | 'neutral';
export type MetricAggregation = 'sum' | 'derived';

const BENEFIT_IDS = new Set<string>([
  'paidByGuest',
  'netEarnings',
  'ourProfit',
  'propertyContribution',
  'income',
  'cleaningMargin',
  'amountTransferred',
  'fiveStarReviewCount',
  'rescuedUnderFiveStarReviewPercent',
  'calendarOccupiedNights',
  'calendarPaidByGuest',
  'calendarAccommodationRevenue',
]);

const COST_IDS = new Set<string>([
  'cleaningPaidByGuest',
  'channelFee',
  'managementFee',
  'managementFeeVat',
  'totalExpenses',
  'fixedRent',
  'cleaningNet',
  'cleaningKit',
  'maintenance',
  'maintenanceNet',
  'expensesAndServices',
  'iva',
  'underFiveStarReviewCount',
]);

const DERIVED_IDS = new Set<string>([
  'rescuedUnderFiveStarReviewPercent',
  'averageRatePerNight',
  'calendarAveragePaidPerNight',
  'calendarAveragePaidPerNightAfterCleaning',
  'calendarADR',
  'marketManagementFee',
]);

export class HistoricImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HistoricImportError';
  }
}

export const isMonthId = (value: string) => /^\d{4}-\d{2}$/.test(value);

export const isExternalPeriodAllowed = (period: string) =>
  isMonthId(period) && period < EXTERNAL_PERIOD_EXCLUSIVE_END;

export const externalActualBlocked = (dataOrigin: string, period: string) =>
  dataOrigin === 'legacy_excel' &&
  isMonthId(period) &&
  period >= EXTERNAL_PERIOD_EXCLUSIVE_END;

export const isPilotSnapshotNickname = (nickname: string) =>
  nickname === PILOT_SNAPSHOT_NICKNAME;

export const historicPropertyIdFor = (propertyKey: string) =>
  `historic:${propertyKey}`;

export const assertPilotPropertyKeys = (
  keys: readonly string[] | undefined | null,
) => {
  if (!keys || keys.length === 0) {
    throw new HistoricImportError(
      'A property key list is required. Omitting it does not import every property.',
    );
  }
  const unique = [...new Set(keys.map((key) => key.trim()).filter(Boolean))];
  if (unique.length === 0) {
    throw new HistoricImportError(
      'A property key list is required. Omitting it does not import every property.',
    );
  }
  const allowed = new Set<string>(PILOT_PROPERTY_KEYS);
  const rejected = unique.filter((key) => !allowed.has(key));
  if (rejected.length > 0) {
    throw new HistoricImportError(
      `Property keys are outside the pilot allowlist: ${rejected.join(', ')}`,
    );
  }
  return unique;
};

export const metricPolarity = (metricId: string): MetricPolarity => {
  if (BENEFIT_IDS.has(metricId)) return 'benefit';
  if (COST_IDS.has(metricId)) return 'cost';
  return 'neutral';
};

export const metricAggregation = (metricId: string): MetricAggregation =>
  DERIVED_IDS.has(metricId) || metricId.endsWith('Percent')
    ? 'derived'
    : 'sum';

export const amountToDecimalString = (value: number) => {
  if (!Number.isFinite(value)) {
    throw new HistoricImportError('Amount is not a finite number.');
  }
  if (Object.is(value, -0)) return '0';
  const text = value.toString();
  if (!/[eE]/.test(text)) return text;
  return value.toFixed(20).replace(/\.?0+$/, '');
};

export const parseDecimal = (value: string | null | undefined): number | null => {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const metricsEqual = (
  left: Record<string, string | null>,
  right: Record<string, string | null>,
) => {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if ((left[key] ?? null) !== (right[key] ?? null)) return false;
  }
  return true;
};

export type ActualWritePlan = 'insert' | 'skip' | 'revise';

export const planActualWrite = (
  existing: {
    dataOrigin: string;
    metrics: Record<string, string | null>;
  } | null,
  incoming: {
    dataOrigin: string;
    metrics: Record<string, string | null>;
  },
): ActualWritePlan => {
  if (!existing) return 'insert';
  if (
    existing.dataOrigin === 'yalla_native' &&
    incoming.dataOrigin === 'legacy_excel'
  ) {
    return 'skip';
  }
  if (
    existing.dataOrigin === incoming.dataOrigin &&
    metricsEqual(existing.metrics, incoming.metrics)
  ) {
    return 'skip';
  }
  return 'revise';
};

export class HistoricEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HistoricEditError';
  }
}

/** Manual edits stay on imported months. Yalla months come from Reports. */
export const legacyEditAllowed = (period: string, dataOrigin: string) =>
  isMonthId(period) &&
  period < EXTERNAL_PERIOD_EXCLUSIVE_END &&
  dataOrigin === 'legacy_excel';

const EDITABLE_METRIC_KEY = /^[A-Za-z][A-Za-z0-9]{0,80}$/;

export const normalizeEditedMetrics = (
  incoming: Record<string, unknown>,
) => {
  const next: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (!EDITABLE_METRIC_KEY.test(key)) {
      throw new HistoricEditError(`Unknown metric ${key}.`);
    }
    if ((REVIEW_METRIC_IDS as readonly string[]).includes(key)) {
      throw new HistoricEditError('Review metrics stay live and cannot be edited.');
    }
    if (value == null || value === '') {
      next[key] = null;
      continue;
    }
    const text =
      typeof value === 'number'
        ? String(value)
        : String(value).trim().replace(',', '.');
    const parsed = parseDecimal(text);
    if (parsed == null) {
      throw new HistoricEditError(`Invalid amount for ${key}.`);
    }
    next[key] = amountToDecimalString(parsed);
  }
  if (Object.keys(next).length === 0) {
    throw new HistoricEditError('At least one metric is required.');
  }
  return next;
};

export const mapSourceMetrics = (
  metrics: Record<string, number | null | undefined>,
) => {
  const mapped: Record<string, string | null> = {};
  for (const [sourceKey, fieldId] of Object.entries(SOURCE_FIELD_MAP)) {
    const value = metrics[sourceKey];
    if (value == null) {
      mapped[fieldId] = null;
      continue;
    }
    if (typeof value !== 'number') {
      throw new HistoricImportError(`Invalid amount for ${sourceKey}.`);
    }
    mapped[fieldId] = amountToDecimalString(value);
  }
  return mapped;
};

export const stripReviewMetrics = (metrics: Record<string, string | null>) => {
  const next = { ...metrics };
  for (const id of REVIEW_METRIC_IDS) {
    delete next[id];
  }
  return next;
};

export const snapshotMetricsFromNative = (metrics: Record<string, unknown>) => {
  const next: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(metrics)) {
    if ((REVIEW_METRIC_IDS as readonly string[]).includes(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value)) {
      next[key] = amountToDecimalString(value);
    }
  }
  return next;
};

export type SourceSnapshot = {
  propertyKey: string;
  propertyName?: string;
  period: string;
  metrics: Record<string, number | null>;
  qualityFlags?: string[];
  source?: {
    sheet?: string;
    file?: string;
    cells?: Record<string, { cell?: string } | undefined>;
  };
};

export type SourceBenchmark = {
  benchmarkKey: string;
  propertyKey: string;
  benchmarkLabel?: string;
  asOfDateLabel?: string | null;
  metrics: Record<string, number | null>;
  metricsDependentOnActuals?: string[];
  qualityFlags?: string[];
  source?: SourceSnapshot['source'];
};

export const partitionSnapshots = (
  snapshots: SourceSnapshot[],
  propertyKeys: readonly string[] | undefined | null,
) => {
  const allowed = new Set(assertPilotPropertyKeys(propertyKeys));
  const accepted: SourceSnapshot[] = [];
  const excludedByPeriod: {
    propertyKey: string;
    period: string;
    reason: 'period_on_or_after_cutoff';
  }[] = [];
  let outsideAllowlist = 0;
  for (const row of snapshots) {
    if (!isExternalPeriodAllowed(row.period)) {
      excludedByPeriod.push({
        propertyKey: row.propertyKey,
        period: row.period,
        reason: 'period_on_or_after_cutoff',
      });
      continue;
    }
    if (!allowed.has(row.propertyKey)) {
      outsideAllowlist += 1;
      continue;
    }
    accepted.push(row);
  }
  return { accepted, excludedByPeriod, outsideAllowlist };
};

export const partitionBenchmarks = (
  benchmarks: SourceBenchmark[],
  propertyKeys: readonly string[] | undefined | null,
) => {
  const allowed = new Set(assertPilotPropertyKeys(propertyKeys));
  const accepted: SourceBenchmark[] = [];
  let outsideAllowlist = 0;
  let dependentSkipped = 0;
  for (const row of benchmarks) {
    if (!allowed.has(row.propertyKey)) {
      outsideAllowlist += 1;
      continue;
    }
    if ((row.metricsDependentOnActuals ?? []).length > 0) {
      dependentSkipped += 1;
      continue;
    }
    accepted.push(row);
  }
  return { accepted, outsideAllowlist, dependentSkipped };
};

export const provenanceFromSource = (source: SourceSnapshot['source']) => {
  const cells: Record<string, string> = {};
  for (const [sourceKey, fieldId] of Object.entries(SOURCE_FIELD_MAP)) {
    const cell = source?.cells?.[sourceKey]?.cell;
    if (cell) cells[fieldId] = cell;
  }
  return {
    sheet: source?.sheet ?? null,
    file: source?.file ?? null,
    cells,
  };
};

export type NicknameCandidate = {
  id: string;
  nickname: string;
  active: boolean;
};

const normalizeNickname = (value: string) =>
  value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');

const foldNickname = (value: string) =>
  normalizeNickname(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

export const resolvePropertyByNickname = (
  target: string,
  candidates: NicknameCandidate[],
) => {
  const named = candidates.filter(
    (candidate) => candidate.id.trim() && candidate.nickname.trim(),
  );
  const exact = named.filter((candidate) => candidate.nickname === target);
  if (exact.length === 1) {
    return { resolution: 'exact' as const, property: exact[0] };
  }
  if (exact.length > 1) {
    return { resolution: 'ambiguous' as const, candidates: exact };
  }
  const normalizedTarget = normalizeNickname(target);
  const normalized = named.filter(
    (candidate) => normalizeNickname(candidate.nickname) === normalizedTarget,
  );
  if (normalized.length === 1) {
    return { resolution: 'normalized' as const, property: normalized[0] };
  }
  if (normalized.length > 1) {
    return { resolution: 'ambiguous' as const, candidates: normalized };
  }
  const foldedTarget = foldNickname(target);
  const folded = named.filter(
    (candidate) => foldNickname(candidate.nickname) === foldedTarget,
  );
  if (folded.length === 1) {
    return { resolution: 'accent' as const, property: folded[0] };
  }
  if (folded.length > 1) {
    return { resolution: 'ambiguous' as const, candidates: folded };
  }
  return { resolution: 'missing' as const };
};

export const monthIdFromCheckIn = (checkInDate: string) => {
  const match = /^(\d{4}-\d{2})-\d{2}$/.exec(checkInDate.trim());
  return match ? match[1] : null;
};

export const addMonths = (period: string, offset: number) => {
  const [year, month] = period.split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const eachMonth = (from: string, to: string) => {
  if (!isMonthId(from) || !isMonthId(to) || from > to) return [];
  const months: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
};

export const compareToReference = (
  actual: number | null,
  reference: number | null,
  polarity: MetricPolarity,
) => {
  if (actual == null || reference == null) {
    return { amount: null, percent: null, favorable: null as boolean | null };
  }
  const amount = actual - reference;
  const percent = reference > 0 ? (amount / reference) * 100 : null;
  let favorable: boolean | null = null;
  if (amount !== 0 && polarity === 'benefit') favorable = amount > 0;
  if (amount !== 0 && polarity === 'cost') favorable = amount < 0;
  return { amount, percent, favorable };
};

export const sumWindow = (values: (number | null)[]) => {
  const present = values.filter((value): value is number => value != null);
  const total = present.reduce((sum, value) => sum + value, 0);
  return {
    monthsInWindow: values.length,
    monthsAvailable: present.length,
    total: present.length > 0 ? total : null,
    average: present.length > 0 ? total / present.length : null,
  };
};

export const rescuedPercentWindow = (
  rescuedCounts: (number | null)[],
  underCounts: (number | null)[],
) => {
  let rescued = 0;
  let under = 0;
  let monthsAvailable = 0;
  const length = Math.max(rescuedCounts.length, underCounts.length);
  for (let index = 0; index < length; index += 1) {
    const rescuedValue = rescuedCounts[index] ?? null;
    const underValue = underCounts[index] ?? null;
    if (rescuedValue == null && underValue == null) continue;
    monthsAvailable += 1;
    rescued += rescuedValue ?? 0;
    under += underValue ?? 0;
  }
  return {
    monthsAvailable,
    percent:
      under > 0 ? (rescued / under) * 100 : monthsAvailable > 0 ? 0 : null,
  };
};

export const annualSeries = (
  points: { period: string; value: number | null }[],
) => {
  const years = [
    ...new Set(points.map((point) => point.period.slice(0, 4))),
  ].sort();
  const byPeriod = new Map(points.map((point) => [point.period, point.value]));
  const rows = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    const row: Record<string, string | number | null> = { month };
    for (const year of years) {
      const period = `${year}-${month}`;
      row[year] = byPeriod.has(period) ? (byPeriod.get(period) ?? null) : null;
    }
    return row;
  });
  return { years, rows };
};

export const ltmPeriods = (endPeriod: string) => {
  if (!isMonthId(endPeriod)) return [];
  return eachMonth(addMonths(endPeriod, -11), endPeriod);
};

export type StoredActual = {
  period: string;
  dataOrigin: string;
  metrics: Record<string, string | null>;
  qualityFlags?: string[];
};

export const splitReadableActuals = (items: StoredActual[]) => {
  const visible: StoredActual[] = [];
  const blockedPeriods: string[] = [];
  for (const item of items) {
    if (externalActualBlocked(item.dataOrigin, item.period)) {
      blockedPeriods.push(item.period);
      continue;
    }
    visible.push(item);
  }
  return { visible, blockedPeriods };
};

export type ReviewMonthSummary = {
  fiveStarReviewCount: number;
  underFiveStarReviewCount: number;
  rescuedUnderFiveStarReviewCount: number;
  rescuedUnderFiveStarReviewPercent: number;
};

export const overlayReviewMetrics = (
  metrics: Record<string, string | null>,
  reviews: ReviewMonthSummary | null,
) => {
  const next = stripReviewMetrics(metrics);
  if (!reviews) {
    for (const id of REVIEW_METRIC_IDS) next[id] = null;
    return { metrics: next, reviewsLive: false as const };
  }
  next.fiveStarReviewCount = amountToDecimalString(reviews.fiveStarReviewCount);
  next.underFiveStarReviewCount = amountToDecimalString(
    reviews.underFiveStarReviewCount,
  );
  next.rescuedUnderFiveStarReviewPercent = amountToDecimalString(
    reviews.rescuedUnderFiveStarReviewPercent,
  );
  return {
    metrics: next,
    reviewsLive: true as const,
    rescuedUnderFiveStarReviewCount: reviews.rescuedUnderFiveStarReviewCount,
  };
};

export const actualSortKey = (period: string) => `ACTUAL#${period}`;
export const revisionSortKey = (period: string, updatedAt: string) =>
  `REV#${period}#${updatedAt}`;
export const benchmarkSortKey = (benchmarkKey: string) =>
  `BENCH#${benchmarkKey}`;
export const eventSortKey = (date: string, eventId: string) =>
  `EVENT#${date}#${eventId}`;
export const sourcePartitionKey = (propertyKey: string) =>
  `SOURCE#${propertyKey}`;
export const MAP_SORT_KEY = 'MAP';

export const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
