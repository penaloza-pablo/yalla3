import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseDistributionTargets,
  splitMoneyEvenly,
} from './split-money'
import {
  distributionTotal,
  groupDistributedRows,
} from '../../../src/billing/distributed-lines'

const sum = (values: number[]) =>
  Math.round(values.reduce((total, value) => total + value, 0) * 100) / 100

test('splits a total into equal cent shares that add up', () => {
  assert.deepEqual(splitMoneyEvenly(474, 3), [158, 158, 158])
  assert.deepEqual(splitMoneyEvenly(100, 3), [33.34, 33.33, 33.33])
  assert.equal(sum(splitMoneyEvenly(100, 3)), 100)
  assert.equal(sum(splitMoneyEvenly(10, 6)), 10)
  assert.deepEqual(splitMoneyEvenly(-10, 3), [-3.34, -3.33, -3.33])
  assert.equal(sum(splitMoneyEvenly(-10, 3)), -10)
  assert.deepEqual(splitMoneyEvenly(50, 0), [])
  assert.deepEqual(splitMoneyEvenly(Number.NaN, 2), [])
})

test('keeps unique properties in the order they were sent', () => {
  assert.deepEqual(
    parseDistributionTargets([
      { propertyId: 'a', property: 'Almendro' },
      { id: 'a', name: 'Duplicate' },
      { propertyId: 'b', name: 'Rodas' },
      { propertyId: '  ', property: 'Blank' },
    ]),
    [
      { propertyId: 'a', property: 'Almendro' },
      { propertyId: 'b', property: 'Rodas' },
    ],
  )
})

test('groups distributed lines into one row and keeps the other lines', () => {
  const lines = [
    { id: 'v1', propertyId: 'a', price: 40 },
    { id: 'd:a', distributionId: 'd', propertyId: 'a', price: 158 },
    { id: 'd:b', distributionId: 'd', propertyId: 'b', price: 158 },
    { id: 'd:c', distributionId: 'd', propertyId: 'c', price: 158 },
    { id: 'm1', propertyId: 'b', price: 20 },
  ]
  const visible = lines.filter((line) => line.propertyId === 'a' || line.propertyId === 'b')
  const rows = groupDistributedRows(lines, visible)
  assert.equal(rows.length, 3)
  assert.deepEqual(rows[0], { kind: 'line', line: lines[0] })
  assert.equal(rows[1]?.kind, 'distribution')
  if (rows[1]?.kind === 'distribution') {
    assert.equal(rows[1].members.length, 3)
    assert.equal(distributionTotal(rows[1].members), 474)
  }
  assert.deepEqual(rows[2], { kind: 'line', line: lines[4] })
})
