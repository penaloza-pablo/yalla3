import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PURCHASE_COMPLETED,
  PURCHASE_OVERDUE,
  PURCHASE_WAITING_DELIVERY,
  PURCHASE_WAITING_INVOICE,
  computePurchaseLifecycleStatus,
  decoratePurchaseRecord,
  resolveInvoiceFromPayload,
  resolveReceivedFromPayload,
} from './purchase-status';

const today = '2026-09-14';

test('waiting delivery when the date is today or later and not received', () => {
  assert.equal(
    computePurchaseLifecycleStatus({
      deliveryDate: '14/09/2026',
      today,
    }),
    PURCHASE_WAITING_DELIVERY,
  );
  assert.equal(
    computePurchaseLifecycleStatus({
      deliveryDate: '2026-09-20',
      today,
    }),
    PURCHASE_WAITING_DELIVERY,
  );
});

test('overdue when the delivery date is yesterday or earlier and not received', () => {
  assert.equal(
    computePurchaseLifecycleStatus({
      deliveryDate: '13/09/2026',
      today,
    }),
    PURCHASE_OVERDUE,
  );
});

test('waiting invoice when received and invoice is off', () => {
  assert.equal(
    computePurchaseLifecycleStatus({
      received: true,
      invoice: false,
      deliveryDate: '13/09/2026',
      today,
    }),
    PURCHASE_WAITING_INVOICE,
  );
});

test('completed when received and invoice is on', () => {
  assert.equal(
    computePurchaseLifecycleStatus({
      received: true,
      invoice: true,
      deliveryDate: '13/09/2026',
      today,
    }),
    PURCHASE_COMPLETED,
  );
});

test('legacy confirmed records map to completed with invoice on', () => {
  const decorated = decoratePurchaseRecord(
    {
      Status: 'Confirmed',
      'Delivery date': '01/09/2026',
    },
    today,
  );
  assert.equal(decorated.Status, PURCHASE_COMPLETED);
  assert.equal(decorated.Invoice, true);
  assert.equal(decorated.Received, true);
});

test('legacy to be confirmed in the past becomes overdue', () => {
  const decorated = decoratePurchaseRecord(
    {
      Status: 'To be confirmed',
      'Delivery date': '13/09/2026',
    },
    today,
  );
  assert.equal(decorated.Status, PURCHASE_OVERDUE);
  assert.equal(decorated.Invoice, false);
  assert.equal(decorated.Received, false);
});

test('payload flags win over stored status', () => {
  assert.equal(
    resolveReceivedFromPayload({ Received: true }, { Status: 'Waiting Delivery' }),
    true,
  );
  assert.equal(
    resolveInvoiceFromPayload({ Invoice: false }, { Status: 'Confirmed' }),
    false,
  );
});
