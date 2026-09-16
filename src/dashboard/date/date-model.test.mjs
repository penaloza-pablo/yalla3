import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseDate, dateParts, dateAllowed } from './date-model.mjs'

test('compact date includes correct day, month, year and weekday', () => {
  const p = dateParts('2026-09-16')
  assert.equal(p.day, '16')
  assert.equal(p.month, 'Sept')
  assert.equal(p.year, '2026')
  assert.equal(p.weekday, 'miércoles')
})

test('English locale uses English weekday names', () => {
  const p = dateParts('2026-09-16', 'en')
  assert.equal(p.month, 'Sept')
  assert.equal(p.weekday, 'Wednesday')
})

test('leap years, impossible days and incomplete dates', () => {
  assert.equal(parseDate('2024-02-29').day, 29)
  for (const d of [
    '2026-02-29',
    '2026-04-31',
    '2026-13-01',
    '0000-01-01',
    '',
    '2026-9-16',
    '2026-09-16T00:00:00Z',
  ]) {
    assert.throws(() => parseDate(d))
  }
})

test('calendar day does not shift with environment timezone', () => {
  const original = process.env.TZ
  try {
    for (const zone of ['Pacific/Honolulu', 'Asia/Tokyo', 'Europe/Madrid']) {
      process.env.TZ = zone
      assert.equal(dateParts('2026-01-01').day, '01')
      assert.equal(dateParts('2026-01-01').year, '2026')
    }
  } finally {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
})

test('optional bounds include their endpoints and reject inverted bounds', () => {
  assert.equal(dateAllowed('2026-09-16', '2026-09-16', '2026-09-30'), true)
  assert.equal(dateAllowed('2026-09-30', '2026-09-16', '2026-09-30'), true)
  assert.equal(dateAllowed('2026-10-01', '2026-09-16', '2026-09-30'), false)
  assert.throws(() => dateAllowed('2026-09-16', '2026-10-01', '2026-09-01'))
})
