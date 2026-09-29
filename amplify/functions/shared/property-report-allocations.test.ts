import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCleaningMovedToExpenses } from './property-report-allocations';

test('parses unique cleaning ids moved to other expenses', () => {
  assert.deepEqual(parseCleaningMovedToExpenses([' a ', 'b', 'a', '']), [
    'a',
    'b',
  ]);
  assert.deepEqual(parseCleaningMovedToExpenses(null), []);
  assert.deepEqual(parseCleaningMovedToExpenses({ a: true }), []);
});
