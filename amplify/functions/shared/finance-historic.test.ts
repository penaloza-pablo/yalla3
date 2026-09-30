import assert from 'node:assert/strict';
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
  planActualWrite,
  rescuedPercentWindow,
  resolvePropertyByNickname,
  snapshotMetricsFromNative,
  splitReadableActuals,
} from './finance-historic';
import { applyPermissionCatalog, pagePermission } from './rbac-catalog';

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
