import {
  HistoricImportError,
  amountToDecimalString,
  isExternalPeriodAllowed,
} from './finance-historic';

/** Source keys from yalla-historic-combined-v2. checkInBookingCount stays off bookingCount. */
export const COMBINED_V2_FIELD_MAP = {
  totalPaidByGuests: 'paidByGuest',
  cleaningFee: 'cleaningPaidByGuest',
  channelFee: 'channelFee',
  managementFee: 'managementFee',
  managementFeeVAT: 'managementFeeVat',
  checkInBookingCount: 'checkInBookingCount',
  netEarnings: 'netEarnings',
  calendarOccupiedNights: 'calendarOccupiedNights',
  calendarAveragePaidPerNight: 'calendarAveragePaidPerNight',
  calendarAverageGuestPaymentPerNightAfterCleaningFee:
    'calendarAveragePaidPerNightAfterCleaning',
  expensesAndServicesGross: 'expensesAndServicesGross',
} as const;

export type CombinedSourceKey = keyof typeof COMBINED_V2_FIELD_MAP;

export type MetricReviewStatus = 'ok' | 'estimated' | 'needs_review';

export type MetricReviewReason = {
  code: string;
  message: string;
  suggestedAction: string;
};

export type MetricReviewEntry = {
  status: MetricReviewStatus;
  needsReview: boolean;
  highlight: 'red' | 'none';
  reasons: MetricReviewReason[];
};

export type MetricReviewMap = Record<string, MetricReviewEntry>;

export type MetricCorrection = {
  value: string | null;
  previousValue: string | null;
  validatedAt: string;
  validatedBy: string;
  evidence: string;
  sourceVersion: string;
};

export type CombinedImportConflict = {
  fieldId: string;
  kept: string | null;
  incoming: string | null;
  sourceVersion: string;
};

const STATUSES = new Set<MetricReviewStatus>(['ok', 'estimated', 'needs_review']);

const schemaRank = (version: string) => {
  const match = /v(\d+)$/.exec(version.trim());
  return match ? Number(match[1]) : 0;
};

const asReason = (value: unknown): MetricReviewReason | null => {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const code = typeof row.code === 'string' ? row.code.trim() : '';
  const message = typeof row.message === 'string' ? row.message.trim() : '';
  const suggestedAction =
    typeof row.suggestedAction === 'string' ? row.suggestedAction.trim() : '';
  if (!code || !message) return null;
  return { code, message, suggestedAction };
};

export const parseMetricReviewMap = (value: unknown): MetricReviewMap => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const review: MetricReviewMap = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,80}$/.test(key)) continue;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const row = entry as Record<string, unknown>;
    const status = row.status;
    if (typeof status !== 'string' || !STATUSES.has(status as MetricReviewStatus)) {
      continue;
    }
    const reasons = Array.isArray(row.reasons)
      ? row.reasons.flatMap((reason) => {
          const parsed = asReason(reason);
          return parsed ? [parsed] : [];
        })
      : [];
    const needsReview = status === 'needs_review' || row.needsReview === true;
    review[key] = {
      status: status as MetricReviewStatus,
      needsReview,
      highlight: needsReview ? 'red' : 'none',
      reasons,
    };
  }
  return review;
};

export const fieldsNeedingReview = (review: MetricReviewMap) =>
  Object.entries(review)
    .filter(([, entry]) => entry.needsReview)
    .map(([fieldId]) => fieldId);

export const reviewPresentation = (
  value: string | null | undefined,
  review: { needsReview?: boolean } | null | undefined,
) => {
  if (review?.needsReview !== true) {
    return { marked: false, pending: false };
  }
  return { marked: true, pending: value == null || value === '' };
};

export const metricReviewsEqual = (
  left: MetricReviewMap | null | undefined,
  right: MetricReviewMap | null | undefined,
) => JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});

export const clearMetricReviewFields = (
  review: MetricReviewMap,
  fieldIds: readonly string[],
) => {
  const next = { ...review };
  for (const fieldId of fieldIds) delete next[fieldId];
  return next;
};

export const clearMetricCorrections = (
  corrections: Record<string, MetricCorrection>,
  fieldIds: readonly string[],
) => {
  const next = { ...corrections };
  for (const fieldId of fieldIds) delete next[fieldId];
  return next;
};

const signedCents = (value: unknown) => {
  const amount =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(amount)) {
    throw new HistoricImportError('Included expense item has no amount.');
  }
  return Math.round(amount * 100);
};

/** Absolute value after summing the signed included lines. Debts stay out of this list. */
export const expenseGrossFromIncludedItems = (
  items: readonly { value?: unknown }[],
) => Math.abs(items.reduce((sum, item) => sum + signedCents(item.value), 0)) / 100;

export const mapCombinedHistoricRecord = (record: {
  period: string;
  metrics?: Record<string, number | null | undefined>;
  metricReview?: unknown;
}) => {
  if (!isExternalPeriodAllowed(record.period)) {
    throw new HistoricImportError(
      `External period ${record.period} is not imported.`,
    );
  }
  const sourceReview = parseMetricReviewMap(record.metricReview);
  const metrics: Record<string, string | null> = {};
  const metricReview: MetricReviewMap = {};
  for (const [sourceKey, fieldId] of Object.entries(COMBINED_V2_FIELD_MAP)) {
    const value = record.metrics?.[sourceKey];
    if (value == null) {
      metrics[fieldId] = null;
    } else if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new HistoricImportError(`Invalid amount for ${sourceKey}.`);
    } else {
      metrics[fieldId] = amountToDecimalString(value);
    }
    const review = sourceReview[sourceKey];
    if (review) metricReview[fieldId] = review;
  }
  return {
    metrics,
    metricReview,
    hasReviewIssues: fieldsNeedingReview(metricReview).length > 0,
  };
};

export const mergeCombinedHistoricMonth = (input: {
  schemaVersion: string;
  incoming: { metrics: Record<string, string | null>; metricReview: MetricReviewMap };
  corrections?: Record<string, MetricCorrection>;
}) => {
  const metrics = { ...input.incoming.metrics };
  const metricReview = { ...input.incoming.metricReview };
  const corrections = { ...(input.corrections ?? {}) };
  const conflicts: CombinedImportConflict[] = [];
  const incomingRank = schemaRank(input.schemaVersion);
  for (const [fieldId, correction] of Object.entries(corrections)) {
    if (incomingRank > schemaRank(correction.sourceVersion)) continue;
    const incomingValue = metrics[fieldId] ?? null;
    if (incomingValue === correction.value) {
      delete metricReview[fieldId];
      continue;
    }
    conflicts.push({
      fieldId,
      kept: correction.value,
      incoming: incomingValue,
      sourceVersion: input.schemaVersion,
    });
    metrics[fieldId] = correction.value;
    delete metricReview[fieldId];
  }
  return { metrics, metricReview, corrections, conflicts };
};

/** Clears the mark only after every reason on that field is resolved. Import must not call this. */
export const applyMetricResolution = (input: {
  review: MetricReviewEntry | undefined;
  value: string | null;
  previousValue: string | null;
  reasonCodes: readonly string[];
  validatedBy: string;
  validatedAt: string;
  evidence: string;
  sourceVersion: string;
}) => {
  if (!input.validatedBy.trim() || !input.validatedAt.trim() || !input.evidence.trim()) {
    throw new HistoricImportError(
      'A resolved field needs who checked it, when, and the evidence.',
    );
  }
  const resolved = new Set(input.reasonCodes);
  const reasons = (input.review?.reasons ?? []).filter(
    (reason) => !resolved.has(reason.code),
  );
  if (reasons.length > 0) {
    return {
      review: {
        status: 'needs_review' as const,
        needsReview: true,
        highlight: 'red' as const,
        reasons,
      },
      correction: null,
    };
  }
  return {
    review: null,
    correction: {
      value: input.value,
      previousValue: input.previousValue,
      validatedAt: input.validatedAt,
      validatedBy: input.validatedBy.trim(),
      evidence: input.evidence.trim(),
      sourceVersion: input.sourceVersion,
    } satisfies MetricCorrection,
  };
};
