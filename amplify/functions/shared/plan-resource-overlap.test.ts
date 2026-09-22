import assert from 'node:assert/strict'
import test from 'node:test'
import {
  findPlanResourceOverlaps,
  minutesToTime,
  overlapErrorMessage,
  timeToMinutes,
} from './plan-resource-overlap'

test('same cleaner at the same time overlaps by cleaning duration', () => {
  const overlaps = findPlanResourceOverlaps([
    {
      id: 'lopez',
      title: 'Clean Lopez Silva',
      resourceId: 'marilin',
      startMinutes: timeToMinutes('11:00') ?? 0,
      durationMinutes: 90,
    },
    {
      id: '212',
      title: 'Clean 212',
      resourceId: 'marilin',
      startMinutes: timeToMinutes('11:00') ?? 0,
      durationMinutes: 90,
    },
  ])
  assert.equal(overlaps.length, 1)
  assert.equal(overlaps[0]?.second.title, 'Clean Lopez Silva')
  assert.equal(
    overlapErrorMessage(overlaps[0]!, 'Marilin').includes('12:30'),
    true,
  )
})

test('a later visit is valid once the previous duration has elapsed', () => {
  const overlaps = findPlanResourceOverlaps([
    {
      id: 'lopez',
      title: 'Clean Lopez Silva',
      resourceId: 'marilin',
      startMinutes: timeToMinutes('11:00') ?? 0,
      durationMinutes: 90,
    },
    {
      id: '212',
      title: 'Clean 212',
      resourceId: 'marilin',
      startMinutes: timeToMinutes('12:30') ?? 0,
      durationMinutes: 90,
    },
  ])
  assert.equal(overlaps.length, 0)
})

test('non-adjacent visits still overlap if the first duration covers them', () => {
  const overlaps = findPlanResourceOverlaps([
    {
      id: 'a',
      title: 'A',
      resourceId: 'marilin',
      startMinutes: timeToMinutes('11:00') ?? 0,
      durationMinutes: 180,
    },
    {
      id: 'b',
      title: 'B',
      resourceId: 'marilin',
      startMinutes: timeToMinutes('12:00') ?? 0,
      durationMinutes: 30,
    },
    {
      id: 'c',
      title: 'C',
      resourceId: 'marilin',
      startMinutes: timeToMinutes('12:45') ?? 0,
      durationMinutes: 30,
    },
  ])
  assert.equal(overlaps.length, 2)
})

test('different resources can share the same start time', () => {
  const overlaps = findPlanResourceOverlaps([
    {
      id: 'a',
      title: 'A',
      resourceId: 'marilin',
      startMinutes: timeToMinutes('11:00') ?? 0,
      durationMinutes: 90,
    },
    {
      id: 'b',
      title: 'B',
      resourceId: 'ana',
      startMinutes: timeToMinutes('11:00') ?? 0,
      durationMinutes: 90,
    },
  ])
  assert.equal(overlaps.length, 0)
})

test('formats minutes as HH:mm', () => {
  assert.equal(minutesToTime(690), '11:30')
  assert.equal(timeToMinutes('11:30'), 690)
})
