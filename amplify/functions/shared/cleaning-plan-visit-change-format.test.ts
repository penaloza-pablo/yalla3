import assert from 'node:assert/strict';
import test from 'node:test';
import {
  datesToReopenForVisitChange,
  toCleaningPlanDateOnly,
} from './cleaning-plan-visit-change-format';

test('visit change dates keep YYYY-MM-DD and strip ISO timestamps', () => {
  assert.equal(toCleaningPlanDateOnly('2026-10-02'), '2026-10-02');
  assert.equal(
    toCleaningPlanDateOnly('2026-10-02T09:00:00.000Z'),
    '2026-10-02',
  );
  assert.deepEqual(
    datesToReopenForVisitChange('', '2026-10-02T09:00:00.000Z'),
    ['2026-10-02'],
  );
});
