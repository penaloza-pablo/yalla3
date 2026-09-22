import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPastOverdueGrace,
  overdueCompletedInYallaText,
  overdueLookbackDates,
  overdueNotifyKey,
} from './slack-overdue';

test('overdue waits 15 minutes after scheduled end on the same day', () => {
  const base = {
    scheduledDate: '2026-09-22',
    endTime: '12:00',
    today: '2026-09-22',
  };
  assert.equal(isPastOverdueGrace({ ...base, nowTime: '12:00' }), false);
  assert.equal(isPastOverdueGrace({ ...base, nowTime: '12:14' }), false);
  assert.equal(isPastOverdueGrace({ ...base, nowTime: '12:15' }), true);
  assert.equal(isPastOverdueGrace({ ...base, nowTime: '12:16' }), true);
});

test('overdue after midnight uses yesterday visits in the grace window', () => {
  assert.equal(
    isPastOverdueGrace({
      scheduledDate: '2026-09-21',
      endTime: '23:50',
      today: '2026-09-22',
      nowTime: '00:04',
    }),
    false,
  );
  assert.equal(
    isPastOverdueGrace({
      scheduledDate: '2026-09-21',
      endTime: '23:50',
      today: '2026-09-22',
      nowTime: '00:05',
    }),
    true,
  );
  assert.deepEqual(overdueLookbackDates('2026-09-22'), [
    '2026-09-22',
    '2026-09-21',
  ]);
});

test('notify key stays unique per visit schedule', () => {
  assert.equal(
    overdueNotifyKey('2026-09-22', '12:00'),
    '2026-09-22|12:00',
  );
  assert.equal(
    overdueCompletedInYallaText('Clean Fe'),
    'Clean Fe: esta visita fue completada en Yalla.',
  );
});
