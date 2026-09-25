import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isPastCleaningPlanEditCutoff,
  isStartTimeWithinRestrictedWindow,
} from './cleaning-plan-edit-policy'
import {
  ACTION_KEYS,
  ADMIN_ROLE_ID,
  KNOCK_KNOCK_SUPERVISOR_ROLE_ID,
  PERMISSIONS_CATALOG_VERSION,
  ROLE_SEEDS,
  allPermissionKeys,
  withDefaultCleaningPlanOverride,
} from './rbac-catalog'

const key = ACTION_KEYS.cleaningPlanOverrideSchedule

test('locks a ready plan from 10:30 on the plan day onward', () => {
  assert.equal(isPastCleaningPlanEditCutoff('2026-09-25', '2026-09-25', '10:29'), false)
  assert.equal(isPastCleaningPlanEditCutoff('2026-09-25', '2026-09-25', '10:30'), true)
  assert.equal(isPastCleaningPlanEditCutoff('2026-09-25', '2026-09-25', '18:00'), true)
  assert.equal(isPastCleaningPlanEditCutoff('2026-09-24', '2026-09-25', '09:00'), true)
  assert.equal(isPastCleaningPlanEditCutoff('2026-09-26', '2026-09-25', '18:00'), false)
})

test('restricted start times stay between 11:00 and 16:00', () => {
  assert.equal(isStartTimeWithinRestrictedWindow(''), true)
  assert.equal(isStartTimeWithinRestrictedWindow('11:00'), true)
  assert.equal(isStartTimeWithinRestrictedWindow('16:00'), true)
  assert.equal(isStartTimeWithinRestrictedWindow('10:59'), false)
  assert.equal(isStartTimeWithinRestrictedWindow('16:01'), false)
  assert.equal(isStartTimeWithinRestrictedWindow('09:00'), false)
})

test('catalog v8 grants the override only to admin and Knock-Knock supervisor by default', () => {
  assert.equal(PERMISSIONS_CATALOG_VERSION, 8)
  assert.equal(allPermissionKeys().includes(key), true)
  assert.equal(
    withDefaultCleaningPlanOverride(ADMIN_ROLE_ID, ['page:Cleaning Plan'], 7).includes(key),
    true,
  )
  assert.equal(
    withDefaultCleaningPlanOverride(
      KNOCK_KNOCK_SUPERVISOR_ROLE_ID,
      ['page:Cleaning Plan'],
      7,
    ).includes(key),
    true,
  )
  assert.equal(
    withDefaultCleaningPlanOverride('cleaner', ['page:Cleaning Plan'], 7).includes(key),
    false,
  )
  assert.equal(
    withDefaultCleaningPlanOverride('cleaning-supervisor', ['page:Cleaning Plan'], 7).includes(
      key,
    ),
    false,
  )
  assert.equal(
    withDefaultCleaningPlanOverride(ADMIN_ROLE_ID, ['page:Cleaning Plan'], 8).includes(key),
    false,
  )

  const supervisor = ROLE_SEEDS.find((role) => role.id === KNOCK_KNOCK_SUPERVISOR_ROLE_ID)
  const cleaner = ROLE_SEEDS.find((role) => role.id === 'cleaner')
  const cleaningSupervisor = ROLE_SEEDS.find((role) => role.id === 'cleaning-supervisor')
  assert.equal(supervisor?.permissions.includes(key), true)
  assert.equal(cleaner?.permissions.includes(key), false)
  assert.equal(cleaningSupervisor?.permissions.includes(key), false)
})
