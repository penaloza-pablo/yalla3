import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  foldCompanyName,
  mapInvoiceDescription,
  moneyEquals,
} from './cleaning-invoice-equivalences';
import {
  entityMatchesGroup,
  invoiceMonthMatches,
  parseCleaningInvoicePdf,
  parseCleaningInvoiceText,
} from './cleaning-invoice-parse';
import { billingPropertyGroupOf } from './cleaning-property-groups';
import { reconcileInvoiceAgainstYalla } from './cleaning-invoice-reconcile';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const pdf = (name: string) => readFileSync(join(root, name));

test('parse apartments September invoice', () => {
  const invoice = parseCleaningInvoicePdf(
    pdf('FACTURA LIMPIEZA SEPTIEMBRE  2026.pdf'),
  );
  assert.equal(invoice.invoiceNumber, '26-237');
  assert.equal(invoice.cif, 'B70671284');
  assert.equal(foldCompanyName(invoice.billedTo), foldCompanyName('DILIGENTE RE MANAGEMENT SL'));
  assert.equal(invoice.conceptMonthId, '2026-09');
  assert.equal(invoice.subtotal, 7871.32);
  assert.ok(invoice.lines.some((line) => /trastero/i.test(line.description) && line.subtotal === 474));
  assert.ok(
    invoice.lines.some((line) =>
      /concepcion arenal/i.test(line.description),
    ),
  );
  const entity = entityMatchesGroup(invoice, 'apartments');
  assert.equal(entity.entityOk, true);
  assert.equal(invoiceMonthMatches('2026-09', invoice), true);
});

test('parse planta2 September invoice including grouped rooms and discount', () => {
  const invoice = parseCleaningInvoicePdf(
    pdf('FACTURA LIMPIEZA PLANTA2 SEPTIEMBRE 2026.pdf'),
  );
  assert.equal(invoice.invoiceNumber, '26-238');
  assert.equal(invoice.cif, 'B75731356');
  assert.equal(entityMatchesGroup(invoice, 'p2').entityOk, true);
  assert.equal(invoice.subtotal, 2466);
  const grouped = invoice.lines.find((line) =>
    /211 y 212/i.test(line.description),
  );
  assert.ok(grouped);
  assert.equal(grouped?.subtotal, 378);
  assert.deepEqual(
    mapInvoiceDescription(grouped?.description ?? '', 'p2').map((target) => target.propertyKey),
    ['211', '212'],
  );
  assert.ok(invoice.lines.some((line) => /descuento/i.test(line.description)));
});

test('parse August invoices and month slack', () => {
  const apartments = parseCleaningInvoicePdf(
    pdf('FACTURA LIMPIEZA AGOSTO  2026.pdf'),
  );
  const p2 = parseCleaningInvoicePdf(
    pdf('FACTURA LIMPIEZA PLANTA2 AGOSTO 2026.pdf'),
  );
  assert.equal(apartments.invoiceNumber, '26-192');
  assert.equal(p2.invoiceNumber, '26-193');
  assert.equal(apartments.conceptMonthId, '2026-08');
  assert.equal(p2.issueDateIso, '2026-08-31');
  assert.equal(invoiceMonthMatches('2026-08', apartments), true);
  assert.equal(invoiceMonthMatches('2026-09', apartments), false);
  assert.ok(apartments.lines.some((line) => /hora extras/i.test(line.description)));
  assert.ok(
    p2.lines.some((line) => /repaso habitaci[oó]n 203/i.test(line.description)),
  );
  assert.deepEqual(
    mapInvoiceDescription('Repaso habitación 203', 'p2'),
    [{ propertyKey: '203', typeKey: 'room_refresh' }],
  );
});

test('entity fold treats NADLAN SL and S as the same company', () => {
  assert.equal(
    foldCompanyName('NADLAN ROSENFELD SL'),
    foldCompanyName('NADLAN ROSENFELD S'),
  );
  const invoice = parseCleaningInvoiceText(`
FACTURA
Número: 26-001
Fecha: 07/10/2026
NADLAN ROSENFELD SL
B75731356
Limpieza Septiembre 2026
articulo Unidad Precio un. subtotal %IVA Total con IVA
Forma de pago Subtotal 10,00 €
TOTAL FACTURA 12,10 €
`);
  assert.equal(invoiceMonthMatches('2026-09', { ...invoice, issueDateIso: '2026-10-07' }), true);
});

test('netting +X/-X and price fallback for Trastero', () => {
  const result = reconcileInvoiceAgainstYalla(
    [
      { description: 'Limpieza Trastero', units: 1, unitPrice: 474, subtotal: 474 },
      { description: 'Cargo extra', units: 1, unitPrice: 55, subtotal: 55 },
      { description: 'Descuento', units: 1, unitPrice: -55, subtotal: -55 },
    ],
    [
      {
        id: 'storage-1',
        propertyId: 'storage',
        property: 'Storage and WK assembling',
        cleaningTypeName: 'Storage and WK assembling',
        price: 474,
      },
      {
        id: 'apt-1',
        propertyId: 'verdejo',
        property: 'Verdejo',
        cleaningTypeName: '1 bedroom',
        price: 44.5,
      },
    ],
    'apartments',
    474,
  );
  assert.equal(result.matched.some((entry) => entry.mode === 'price' || entry.mode === 'map'), true);
  assert.ok(result.netted.length >= 1);
  assert.equal(result.yallaOnly.some((line) => line.id === 'apt-1'), true);
  assert.ok(moneyEquals(result.totals.invoiceExVat, 474));
});

test('pair netting without a discount label is presentation not a discrepancy', () => {
  const result = reconcileInvoiceAgainstYalla(
    [
      { description: 'Ajuste positivo', units: 1, unitPrice: 40, subtotal: 40 },
      { description: 'Ajuste negativo', units: 1, unitPrice: -40, subtotal: -40 },
    ],
    [],
    'p2',
    0,
  );
  assert.equal(result.netted.length, 1);
  assert.equal(result.invoiceOnly.length, 0);
  assert.equal(result.totals.favor, 'even');
});

test('P2 fallback maps Salidas grouped rooms to Room Regular', () => {
  const targets = mapInvoiceDescription(
    'Salidas habitacion 205,207,208 y 209',
    'p2',
  );
  assert.deepEqual(
    targets.map((target) => target.propertyKey),
    ['205', '207', '208', '209'],
  );
  assert.ok(targets.every((target) => target.typeKey === 'room_regular'));
});

test('apartments equivalences map studios, sofa bed and trastero', () => {
  assert.deepEqual(
    mapInvoiceDescription('Limpieza estudio concepcion arenal', 'apartments'),
    [{ propertyKey: 'concepcion arenal', typeKey: 'studio' }],
  );
  assert.equal(
    mapInvoiceDescription('Limpiezas 1 habitación sofá cama', 'apartments')[0]?.typeKey,
    'one_bedroom_sofa',
  );
  assert.equal(
    mapInvoiceDescription('Trastero', 'apartments')[0]?.typeKey,
    'storage',
  );
});

test('billing filter keeps p2 rooms out of apartments', () => {
  assert.equal(billingPropertyGroupOf('211', '693c3ad20c4f0500133cd017'), 'p2');
  assert.equal(billingPropertyGroupOf('Concepcion Arenal', 'apt-1'), 'apartments');
});
