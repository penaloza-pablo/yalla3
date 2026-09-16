import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planningRows, planningStatus } from './planning-model.mjs'

const base = {
  maintenance: { completed: 1, total: 2 },
  cleaning: { completed: 1, total: 2 },
  bookings: { completed: 82, total: 89 },
}

test('three independent proportions, exact bookings percentage', () => {
  const rows = planningRows(base, 'es')
  assert.equal(rows[0].ratio, 0.5)
  assert.equal(rows[1].ratio, 0.5)
  assert.equal(rows[2].ratio, 82 / 89)
  assert.equal(rows[2].percent, '92,1 %')
  assert.equal(planningStatus(rows, 'es'), 'Pendiente')
})

test('English percent and status stay available', () => {
  const rows = planningRows(base, 'en')
  assert.equal(rows[2].percent, '92.1 %')
  assert.equal(planningStatus(rows, 'en'), 'Pending')
})

test('radar labels name each plan', () => {
  const english = planningRows(base, 'en')
  assert.deepEqual(
    english.map((row) => row.label),
    ['Maintenance Plan', 'Cleaning Plan', 'Bookings Plan'],
  )
  const spanish = planningRows(base, 'es')
  assert.deepEqual(
    spanish.map((row) => row.label),
    ['Plan de mantenimiento', 'Plan de limpieza', 'Plan de reservas'],
  )
})

test('ten of one hundred with a warning is ninety percent', () => {
  const rows = planningRows(
    {
      ...base,
      bookings: { completed: 90, total: 100 },
    },
    'en',
  )
  assert.equal(rows[2].ratio, 0.9)
  assert.equal(rows[2].percent, '90 %')
})

test('all areas must be complete for ready', () => {
  const data = structuredClone(base)
  Object.values(data).forEach((value) => {
    value.completed = value.total
  })
  assert.equal(planningStatus(planningRows(data, 'es'), 'es'), 'Todo listo')
  data.cleaning.completed = 1
  assert.equal(planningStatus(planningRows(data, 'es'), 'es'), 'Pendiente')
})

test('no booking records is not a complete area', () => {
  const rows = planningRows({ ...base, bookings: { total: 0, completed: 0 } }, 'es')
  assert.equal(rows[2].ratio, 0)
  assert.equal(rows[2].percent, '—')
  assert.equal(rows[2].ready, false)
  assert.equal(planningStatus(rows, 'es'), 'Sin datos')
})

test('invalid, partial or fractional inputs rejected', () => {
  for (const data of [
    null,
    {},
    { ...base, maintenance: { total: 3, completed: 1 } },
    { ...base, cleaning: { total: 2, completed: -1 } },
    { ...base, bookings: { total: 89, completed: 90 } },
    { ...base, bookings: { total: 89, completed: 82.5 } },
  ]) {
    assert.throws(() => planningRows(data, 'es'))
  }
})
