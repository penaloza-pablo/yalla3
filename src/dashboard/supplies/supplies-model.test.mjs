import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  suppliesState,
  countStockAlerts,
  countInventoryStockAlerts,
  supplyRows,
} from './supplies-model.mjs'

const zero = {
  stockAlerts: 0,
  waitingDelivery: 0,
  overdue: 0,
  waitingInvoice: 0,
}

test('zero, loading and incomplete data are distinct', () => {
  assert.equal(suppliesState(zero).kind, 'clear')
  assert.equal(suppliesState(null).kind, 'loading')
  assert.throws(() => suppliesState({ stockAlerts: 0 }))
})

test('stock ready does not mean all purchases ready', () => {
  const state = suppliesState({ ...zero, overdue: 2 })
  assert.equal(state.kind, 'active')
  assert.equal(state.stockReady, true)
})

test('independent counts do not impose undocumented overlap rules', () => {
  const state = suppliesState({
    ...zero,
    waitingDelivery: 1,
    overdue: 2,
    waitingInvoice: 3,
  })
  assert.equal(state.data.overdue, 2)
})

test('union of low stock and reorder counts one item once', () =>
  assert.equal(
    countStockAlerts([
      { id: 'a', reorder: true, lowStock: true },
      { id: 'b', reorder: false, lowStock: true },
      { id: 'c', reorder: false, lowStock: false },
    ]),
    2,
  ))

test('invalid totals and ambiguous item records fail', () => {
  for (const value of [-1, 1.5, NaN, Infinity]) {
    assert.throws(() => suppliesState({ ...zero, stockAlerts: value }))
  }
  assert.throws(() => countStockAlerts([{ id: 'a', reorder: true }]))
})

test('grid labels follow the UI language', () => {
  assert.deepEqual(
    supplyRows('en').map((row) => row.label),
    ['Inventory', 'Delivery', 'Overdue', 'Invoice'],
  )
  assert.deepEqual(
    supplyRows('es').map((row) => row.label),
    ['Inventario', 'Por recibir', 'Atrasados', 'Sin factura'],
  )
})

test('inventory Reorder or Low Stock counts unique items', () => {
  assert.equal(
    countInventoryStockAlerts([
      { ItemID: 'a', Status: 'Reorder' },
      { id: 'b', status: 'Low Stock' },
      { id: 'c', Status: 'Waiting Delivery' },
      { id: 'd', Status: 'In Stock' },
      { id: 'a', Status: 'Low Stock' },
    ]),
    2,
  )
})
