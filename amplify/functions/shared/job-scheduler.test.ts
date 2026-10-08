import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isOpenVisitScheduledInWindow,
  statusForRule,
  visitMatchesRule,
  type JobSchedulerRule,
  type VisitTemplateRef,
} from './job-scheduler'

const today = '2026-10-08'
const horizon = '2026-11-07'

const rule = (overrides?: Partial<JobSchedulerRule>): JobSchedulerRule => ({
  id: 'JSR-204',
  propertyId: 'p2-204',
  name: '204, PC every 30',
  intervalDays: 30,
  templateIds: ['tpl-p2-pc-204'],
  createTemplateId: 'tpl-p2-pc-204',
  enabled: true,
  ...overrides,
})

const templates = new Map<string, VisitTemplateRef>([
  [
    'tpl-p2-pc-204',
    { id: 'tpl-p2-pc-204', name: 'P2 PC - 204', title: 'P2 PC - 204' },
  ],
])

test('an open visit scheduled today counts as in the schedule window', () => {
  assert.equal(
    isOpenVisitScheduledInWindow(today, 'TODO', today, horizon),
    true,
  )
  assert.equal(
    isOpenVisitScheduledInWindow(today, 'IN_PROGRESS', today, horizon),
    true,
  )
  assert.equal(
    isOpenVisitScheduledInWindow('2026-10-09', 'TODO', today, horizon),
    true,
  )
  assert.equal(
    isOpenVisitScheduledInWindow('2026-10-07', 'TODO', today, horizon),
    false,
  )
  assert.equal(
    isOpenVisitScheduledInWindow(today, 'COMPLETED', today, horizon),
    false,
  )
  assert.equal(
    isOpenVisitScheduledInWindow(today, 'CANCELLED', today, horizon),
    false,
  )
})

test('a due rule with a matching visit today is scheduled, not overdue-only', () => {
  const lastVisit = {
    id: 'VIS-old',
    title: 'P2 PC - 204',
    scheduledDate: '2026-09-01',
    closedAt: '2026-09-01T18:00:00.000Z',
    status: 'COMPLETED',
  }
  const todayVisit = {
    id: 'VIS-today',
    title: 'P2 PC - 204',
    sourceTemplateId: 'tpl-p2-pc-204',
    scheduledDate: today,
    status: 'TODO',
  }
  assert.equal(visitMatchesRule(todayVisit, rule(), templates), true)
  const status = statusForRule(rule(), lastVisit, today, today)
  assert.equal(status.isOverdue, true)
  assert.equal(status.daysSince, 37)
  assert.equal(status.isScheduled, true)
  assert.equal(status.nextScheduledDate, today)
})
