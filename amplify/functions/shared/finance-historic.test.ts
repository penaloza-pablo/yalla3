import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  HistoricImportError,
  SOURCE_FIELD_MAP,
  annualSeries,
  assertPilotPropertyKeys,
  compareToReference,
  externalActualBlocked,
  historicPropertyIdFor,
  isExternalPeriodAllowed,
  mapSourceMetrics,
  monthIdFromCheckIn,
  overlayReviewMetrics,
  partitionBenchmarks,
  partitionSnapshots,
  legacyEditAllowed,
  normalizeEditedMetrics,
  planActualWrite,
  rescuedPercentWindow,
  resolvePropertyByNickname,
  snapshotMetricsFromNative,
  splitReadableActuals,
} from './finance-historic';
import { applyPermissionCatalog, pagePermission } from './rbac-catalog';
import {
  applyMetricResolution,
  clearMetricReviewFields,
  expenseGrossFromIncludedItems,
  fieldsNeedingReview,
  mapCombinedHistoricRecord,
  mergeCombinedHistoricMonth,
  reviewPresentation,
} from './historic-metric-review';

const almendroMetrics = {
  totalPaidByGuest: 3662.123333333333,
  cleaningPaidByGuest: 473.7333333333333,
  channelFee: 549.32,
  managementFee: 620.9580000000001,
  managementFeeIva: 144.438924,
  netEarnings: 1887.71082,
  totalExpenses: null,
  fixedRent: null,
  ourProfit: null,
};

test('admits July 2026 and rejects August and September external periods', () => {
  assert.equal(isExternalPeriodAllowed('2026-07'), true);
  assert.equal(isExternalPeriodAllowed('2026-08'), false);
  assert.equal(isExternalPeriodAllowed('2026-09'), false);
  assert.equal(externalActualBlocked('legacy_excel', '2026-08'), true);
  assert.equal(externalActualBlocked('yalla_native', '2026-08'), false);
});

test('omitting property keys does not start a global import', () => {
  assert.throws(() => assertPilotPropertyKeys(undefined), HistoricImportError);
  assert.throws(() => assertPilotPropertyKeys([]), HistoricImportError);
  assert.throws(
    () => assertPilotPropertyKeys(['owners:esperanza-9']),
    /outside the pilot allowlist/,
  );
  assert.deepEqual(assertPilotPropertyKeys(['owners:almendro']), [
    'owners:almendro',
  ]);
});

test('partitions the package without keeping excluded amounts', () => {
  const snapshots = [
    {
      propertyKey: 'owners:almendro',
      period: '2026-07',
      metrics: almendroMetrics,
    },
    {
      propertyKey: 'owners:almendro',
      period: '2026-08',
      metrics: { ...almendroMetrics, totalPaidByGuest: 9999 },
    },
    {
      propertyKey: 'owners:esperanza-9',
      period: '2026-07',
      metrics: almendroMetrics,
    },
    {
      propertyKey: 'nadlan:aguila',
      period: '2026-09',
      metrics: { ...almendroMetrics, totalPaidByGuest: 1 },
    },
  ];
  const result = partitionSnapshots(snapshots, ['owners:almendro']);
  assert.equal(result.accepted.length, 1);
  assert.equal(result.accepted[0]?.period, '2026-07');
  assert.equal(result.outsideAllowlist, 1);
  assert.deepEqual(
    result.excludedByPeriod.map((row) => ({
      propertyKey: row.propertyKey,
      period: row.period,
    })),
    [
      { propertyKey: 'owners:almendro', period: '2026-08' },
      { propertyKey: 'nadlan:aguila', period: '2026-09' },
    ],
  );
  assert.equal(
    JSON.stringify(result.excludedByPeriod).includes('9999'),
    false,
  );
});

test('maps source metrics once and keeps nulls', () => {
  const mapped = mapSourceMetrics(almendroMetrics);
  assert.equal(mapped.paidByGuest, '3662.123333333333');
  assert.equal(mapped.cleaningPaidByGuest, '473.7333333333333');
  assert.equal(mapped.managementFeeVat, '144.438924');
  assert.equal(mapped.totalExpenses, null);
  assert.equal(mapped.fixedRent, null);
  assert.equal(mapped.ourProfit, null);
  assert.equal(mapped.channelFee, '549.32');
  assert.equal(SOURCE_FIELD_MAP.cleaningPaidByGuest, 'cleaningPaidByGuest');
  assert.equal(SOURCE_FIELD_MAP.totalExpenses, 'totalExpenses');
});

test('manual edits stay on imported months before August 2026', () => {
  assert.equal(legacyEditAllowed('2025-01', 'legacy_excel'), true);
  assert.equal(legacyEditAllowed('2026-07', 'legacy_excel'), true);
  assert.equal(legacyEditAllowed('2026-08', 'legacy_excel'), false);
  assert.equal(legacyEditAllowed('2025-01', 'yalla_native'), false);
  assert.deepEqual(normalizeEditedMetrics({ paidByGuest: '1,5', totalExpenses: null }), {
    paidByGuest: '1.5',
    totalExpenses: null,
  });
  assert.throws(
    () => normalizeEditedMetrics({ fiveStarReviewCount: '2' }),
    /cannot be edited/,
  );
});

test('a second identical actual is skipped and a native month blocks legacy', () => {
  const metrics = mapSourceMetrics(almendroMetrics);
  assert.equal(
    planActualWrite(null, { dataOrigin: 'legacy_excel', metrics }),
    'insert',
  );
  assert.equal(
    planActualWrite(
      { dataOrigin: 'legacy_excel', metrics },
      { dataOrigin: 'legacy_excel', metrics },
    ),
    'skip',
  );
  assert.equal(
    planActualWrite(
      { dataOrigin: 'yalla_native', metrics: { paidByGuest: '10' } },
      { dataOrigin: 'legacy_excel', metrics },
    ),
    'skip',
  );
  assert.equal(
    planActualWrite(
      { dataOrigin: 'legacy_excel', metrics: { paidByGuest: '1' } },
      { dataOrigin: 'legacy_excel', metrics },
    ),
    'revise',
  );
});

test('resolves nicknames without partial or colliding matches', () => {
  const candidates = [
    { id: 'a', nickname: 'Almendro', active: true },
    { id: 'b', nickname: 'SN A', active: true },
    { id: 'c', nickname: 'SN B', active: false },
    { id: 'd', nickname: 'SE 1.3', active: true },
    { id: 'e', nickname: 'SE 1.4', active: true },
  ];
  assert.equal(
    resolvePropertyByNickname('Almendro', candidates).resolution,
    'exact',
  );
  assert.equal(
    resolvePropertyByNickname('  almendro  ', [
      { id: 'a', nickname: 'Almendro', active: true },
    ]).resolution,
    'normalized',
  );
  assert.equal(
    resolvePropertyByNickname('Almendró', [
      { id: 'a', nickname: 'Almendro', active: true },
    ]).resolution,
    'accent',
  );
  assert.equal(
    resolvePropertyByNickname('Almendro', [
      { id: 'a', nickname: 'Almendro', active: true },
      { id: 'b', nickname: 'Almendro', active: false },
    ]).resolution,
    'ambiguous',
  );
  assert.equal(
    resolvePropertyByNickname('SN A', candidates).resolution,
    'exact',
  );
  assert.notEqual(
    resolvePropertyByNickname('SN A', candidates).resolution === 'exact'
      ? (resolvePropertyByNickname('SN A', candidates) as { property: { id: string } })
          .property.id
      : '',
    'c',
  );
  assert.equal(
    resolvePropertyByNickname('SE 1.3', candidates).resolution,
    'exact',
  );
  assert.equal(
    resolvePropertyByNickname('Almendro Norte', candidates).resolution,
    'missing',
  );
  assert.equal(historicPropertyIdFor('owners:almendro'), 'historic:owners:almendro');
});

test('a review received in August counts in the July check-in month', () => {
  assert.equal(monthIdFromCheckIn('2026-07-28'), '2026-07');
  assert.notEqual(monthIdFromCheckIn('2026-07-28'), '2026-08');
  const july = overlayReviewMetrics(
    { paidByGuest: '10', fiveStarReviewCount: '99' },
    {
      fiveStarReviewCount: 1,
      underFiveStarReviewCount: 0,
      rescuedUnderFiveStarReviewCount: 0,
      rescuedUnderFiveStarReviewPercent: 0,
    },
  );
  assert.equal(july.metrics.paidByGuest, '10');
  assert.equal(july.metrics.fiveStarReviewCount, '1');
  assert.equal(july.reviewsLive, true);
  const august = overlayReviewMetrics(
    {},
    null,
  );
  assert.equal(august.metrics.fiveStarReviewCount, null);
  assert.equal(august.reviewsLive, false);
});

test('native snapshots omit review metrics', () => {
  const snapshot = snapshotMetricsFromNative({
    paidByGuest: 100,
    fiveStarReviewCount: 4,
    underFiveStarReviewCount: 1,
    rescuedUnderFiveStarReviewPercent: 0,
    nights: 3,
  });
  assert.equal(snapshot.paidByGuest, '100');
  assert.equal(snapshot.nights, '3');
  assert.equal('fiveStarReviewCount' in snapshot, false);
});

test('reader drops an external August actual without exposing its amounts', () => {
  const split = splitReadableActuals([
    {
      period: '2026-07',
      dataOrigin: 'legacy_excel',
      metrics: { paidByGuest: '10' },
    },
    {
      period: '2026-08',
      dataOrigin: 'legacy_excel',
      metrics: { paidByGuest: '9999' },
    },
    {
      period: '2026-08',
      dataOrigin: 'yalla_native',
      metrics: { paidByGuest: '20' },
    },
  ]);
  assert.deepEqual(
    split.visible.map((row) => row.period),
    ['2026-07', '2026-08'],
  );
  assert.equal(split.visible[1]?.dataOrigin, 'yalla_native');
  assert.deepEqual(split.blockedPeriods, ['2026-08']);
  assert.equal(JSON.stringify(split.blockedPeriods).includes('9999'), false);
});

test('annual alignment keeps missing months as gaps', () => {
  const series = annualSeries([
    { period: '2025-01', value: 10 },
    { period: '2025-03', value: 30 },
    { period: '2026-01', value: 11 },
  ]);
  assert.deepEqual(series.years, ['2025', '2026']);
  assert.equal(series.rows[0]?.['2025'], 10);
  assert.equal(series.rows[1]?.['2025'], null);
  assert.equal(series.rows[0]?.['2026'], 11);
  assert.equal(series.rows[7]?.['2026'], null);
});

test('deviation percent is unavailable for a zero or missing reference and costs invert favorable', () => {
  assert.equal(compareToReference(10, 0, 'benefit').percent, null);
  assert.equal(compareToReference(10, null, 'benefit').percent, null);
  assert.equal(compareToReference(8, -2, 'benefit').percent, null);
  const benefit = compareToReference(120, 100, 'benefit');
  assert.equal(benefit.amount, 20);
  assert.equal(benefit.percent, 20);
  assert.equal(benefit.favorable, true);
  const cost = compareToReference(120, 100, 'cost');
  assert.equal(cost.favorable, false);
  const costDown = compareToReference(80, 100, 'cost');
  assert.equal(costDown.favorable, true);
});

test('rescued percent of a window uses components instead of averaging percents', () => {
  const window = rescuedPercentWindow([1, 0], [2, 10]);
  assert.equal(window.percent, (1 / 12) * 100);
  assert.notEqual(window.percent, 25);
});

test('property report readers receive the historic pages', () => {
  const granted = applyPermissionCatalog([pagePermission('Property Reports')]);
  assert.equal(granted.includes(pagePermission('Historic table')), true);
  assert.equal(granted.includes(pagePermission('Historic Charts')), true);
  const other = applyPermissionCatalog([pagePermission('Daily Operations')]);
  assert.equal(other.includes(pagePermission('Historic table')), false);
});

test('only the Almendro benchmark is accepted in the pilot', () => {
  const result = partitionBenchmarks(
    [
      {
        benchmarkKey: 'legacy:owners:almendro:airdna-02-12-25',
        propertyKey: 'owners:almendro',
        metrics: almendroMetrics,
        metricsDependentOnActuals: [],
      },
      {
        benchmarkKey: 'legacy:diligente:arenal:airdna',
        propertyKey: 'diligente:arenal-verdejo',
        metrics: almendroMetrics,
        metricsDependentOnActuals: ['fixedRent'],
      },
    ],
    ['owners:almendro'],
  );
  assert.equal(result.accepted.length, 1);
  assert.equal(result.outsideAllowlist, 1);
  assert.equal(result.dependentSkipped, 0);
});

const combinedPackage = (fileName: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../${fileName}`, import.meta.url), 'utf8'),
  ) as {
    schemaVersion: string;
    records: {
      period: string;
      metrics: Record<string, number | null>;
      metricReview: Record<string, { needsReview?: boolean; reasons?: { code: string; message: string }[] }>;
      hasReviewIssues?: boolean;
      audit?: {
        expenses?: {
          items?: { value?: string }[];
          includedItems?: { value?: string }[];
          excludedCarriedBalances?: { label?: string; value?: string }[];
        };
      };
    }[];
  };

test('los gastos v2 excluyen las tres deudas y conservan los motivos', () => {
  const cases = [
    {
      file: 'almendro_historic_2025-01_2026-07.json',
      period: '2025-05',
      gross: 587.7,
      previousGross: 1616.2,
    },
    {
      file: 'rodas_historic_2026-01_2026-07.json',
      period: '2026-02',
      gross: 9.4,
      previousGross: 346.8,
    },
    {
      file: 'mendizabal_historic_2026-05_2026-07.json',
      period: '2026-06',
      gross: 20.5,
      previousGross: 1478.6,
    },
  ];
  for (const item of cases) {
    const record = combinedPackage(item.file).records.find(
      (row) => row.period === item.period,
    );
    assert.ok(record);
    const expenses = record.audit?.expenses;
    assert.ok(expenses?.includedItems?.length);
    assert.ok(expenses.excludedCarriedBalances?.length);
    assert.equal(expenseGrossFromIncludedItems(expenses.includedItems), item.gross);
    assert.notEqual(
      expenseGrossFromIncludedItems(expenses.items ?? []),
      item.gross,
    );
    assert.equal(
      Math.round(
        (Math.abs(Number(expenses.excludedCarriedBalances[0].value)) + item.gross) * 100,
      ),
      Math.round(item.previousGross * 100),
    );
    const mapped = mapCombinedHistoricRecord(record);
    assert.equal(mapped.metrics.expensesAndServicesGross, String(item.gross));
    assert.equal('bookingCount' in mapped.metrics, false);
    assert.equal(mapped.metrics.checkInBookingCount === mapped.metrics.bookingCount, false);
    const sourceReview = record.metricReview.expensesAndServicesGross;
    assert.equal(
      mapped.metricReview.expensesAndServicesGross?.needsReview,
      sourceReview?.needsReview === true,
    );
    assert.deepEqual(
      mapped.metricReview.expensesAndServicesGross?.reasons.map((reason) => reason.code),
      (sourceReview?.reasons ?? []).map((reason) => reason.code),
    );
  }
});

test('un null de calendario no pasa a cero y solo se marcan sus campos', () => {
  const january = combinedPackage(
    'almendro_historic_2025-01_2026-07.json',
  ).records.find((row) => row.period === '2025-01');
  assert.ok(january);
  const mapped = mapCombinedHistoricRecord(january);
  assert.equal(mapped.metrics.calendarOccupiedNights, null);
  assert.equal(mapped.metrics.paidByGuest, '3662.12');
  assert.notEqual(mapped.metrics.calendarOccupiedNights, '0');
  assert.deepEqual(reviewPresentation(null, mapped.metricReview.calendarOccupiedNights), {
    marked: true,
    pending: true,
  });
  assert.deepEqual(
    reviewPresentation(mapped.metrics.paidByGuest, mapped.metricReview.paidByGuest),
    { marked: true, pending: false },
  );
  const july = combinedPackage(
    'almendro_historic_2025-01_2026-07.json',
  ).records.find((row) => row.period === '2026-07');
  assert.ok(july?.hasReviewIssues);
  const julyMapped = mapCombinedHistoricRecord(july);
  assert.deepEqual(fieldsNeedingReview(julyMapped.metricReview), [
    'expensesAndServicesGross',
  ]);
  assert.equal(
    reviewPresentation('434.87', julyMapped.metricReview.paidByGuest).marked,
    false,
  );
  assert.throws(
    () => mapCombinedHistoricRecord({ period: '2026-08', metrics: { netEarnings: 1 } }),
    /not imported/,
  );
});

test('editar un campo quita su revisión y una corrección validada no se pisa', () => {
  const may = combinedPackage(
    'almendro_historic_2025-01_2026-07.json',
  ).records.find((row) => row.period === '2025-05');
  assert.ok(may);
  const mapped = mapCombinedHistoricRecord(may);
  const cleared = clearMetricReviewFields(mapped.metricReview, [
    'expensesAndServicesGross',
  ]);
  assert.equal(cleared.expensesAndServicesGross, undefined);
  assert.equal(cleared.netEarnings, mapped.metricReview.netEarnings);
  const partial = applyMetricResolution({
    review: mapped.metricReview.expensesAndServicesGross,
    value: '587.7',
    previousValue: '587.7',
    reasonCodes: ['EXPENSE_DETAIL_TOTAL_DIFFERENCE'],
    validatedBy: 'ana',
    validatedAt: '2026-10-01T08:00:00.000Z',
    evidence: 'Reporte de mayo',
    sourceVersion: 'yalla-historic-combined-v2',
  });
  assert.equal(partial.review?.needsReview, true);
  assert.equal(partial.correction, null);
  const resolved = applyMetricResolution({
    review: partial.review ?? undefined,
    value: '587.7',
    previousValue: '1616.2',
    reasonCodes: partial.review?.reasons.map((reason) => reason.code) ?? [],
    validatedBy: 'ana',
    validatedAt: '2026-10-01T08:00:00.000Z',
    evidence: 'Reporte de mayo',
    sourceVersion: 'yalla-historic-combined-v2',
  });
  assert.equal(resolved.review, null);
  assert.ok(resolved.correction);
  const conflict = mergeCombinedHistoricMonth({
    schemaVersion: 'yalla-historic-combined-v2',
    incoming: mapped,
    corrections: {
      expensesAndServicesGross: {
        ...resolved.correction,
        value: '500',
      },
    },
  });
  assert.equal(conflict.metrics.expensesAndServicesGross, '500');
  assert.equal(conflict.metricReview.expensesAndServicesGross, undefined);
  assert.equal(conflict.conflicts.length, 1);
  assert.equal(conflict.metrics.paidByGuest, mapped.metrics.paidByGuest);
});
