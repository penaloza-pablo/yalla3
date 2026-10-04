import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addClockMinutes,
  clockMinutesDiff,
  formatSnoozeDuration,
  isAllowedSnoozeTime,
  isPastOverdueGrace,
  isPastStartGrace,
  notStartedResolvedInYallaText,
  overdueCompletedInYallaText,
  overdueLookbackDates,
  overdueNotifyKey,
  snoozeTimeOptions,
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

test('start warning waits 15 minutes after scheduled start', () => {
  const base = {
    scheduledDate: '2026-09-22',
    startTime: '09:00',
    today: '2026-09-22',
  };
  assert.equal(isPastStartGrace({ ...base, nowTime: '09:14' }), false);
  assert.equal(isPastStartGrace({ ...base, nowTime: '09:15' }), true);
  assert.equal(
    notStartedResolvedInYallaText('Clean Fe'),
    'Clean Fe: esta visita fue iniciada en Yalla.',
  );
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

test('postpone duration accumulates from the original scheduled time', () => {
  assert.equal(clockMinutesDiff('11:00', '11:15'), 15);
  assert.equal(clockMinutesDiff('11:00', '11:45'), 45);
  assert.equal(clockMinutesDiff('11:00', '12:15'), 75);
  assert.equal(formatSnoozeDuration(15), '15 minutos');
  assert.equal(formatSnoozeDuration(60), '1 hora');
  assert.equal(formatSnoozeDuration(75), '1 hora 15 minutos');
  assert.equal(formatSnoozeDuration(120), '2 horas');
});

test('postpone options start at the Slack fire time and stop at one hour', () => {
  assert.equal(addClockMinutes('11:00', 15), '11:15');
  assert.deepEqual(snoozeTimeOptions('11:15'), [
    '11:15',
    '11:30',
    '11:45',
    '12:00',
    '12:15',
  ]);
  assert.equal(isAllowedSnoozeTime('11:15', '12:15'), true);
  assert.equal(isAllowedSnoozeTime('11:15', '12:30'), false);
  assert.equal(isAllowedSnoozeTime('11:15', '11:00'), false);
  assert.deepEqual(snoozeTimeOptions('23:45'), ['23:45']);
});
