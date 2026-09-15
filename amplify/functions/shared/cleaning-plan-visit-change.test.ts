import assert from 'node:assert/strict';
import test from 'node:test';
import {
  datesToReopenForVisitChange,
  describeCleaningPlanVisitChange,
} from './cleaning-plan-visit-change-format.ts';

test('datesToReopenForVisitChange keeps unique ISO dates', () => {
  assert.deepEqual(
    datesToReopenForVisitChange('2026-09-16', '2026-09-18'),
    ['2026-09-16', '2026-09-18'],
  );
  assert.deepEqual(datesToReopenForVisitChange('2026-09-16', '2026-09-16'), [
    '2026-09-16',
  ]);
  assert.deepEqual(datesToReopenForVisitChange('', '18/09'), []);
});

test('describeCleaningPlanVisitChange lists extension and guest', () => {
  const lines = describeCleaningPlanVisitChange({
    visitId: 'GST-1',
    title: 'Clean 202',
    listingLabel: '202',
    guestName: 'Timothy Robertson',
    confirmationCode: 'ABC123',
    previousDate: '2026-09-16',
    nextDate: '2026-09-18',
    previousStatus: 'SCHEDULED',
    nextStatus: 'SCHEDULED',
  });
  assert.ok(lines.some((line) => line.includes('Timothy Robertson')));
  assert.ok(lines.some((line) => line.includes('Fecha: 2026-09-16 → 2026-09-18')));
  assert.ok(lines.some((line) => line.includes('Reserva ABC123')));
});
