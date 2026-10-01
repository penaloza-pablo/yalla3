import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  foldCompanyName,
  mapInvoiceDescription,
  moneyEquals,
  yallaPropertyMatches,
  yallaTypeMatches,
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
  assert.deepEqual(mapInvoiceDescription('Trastero', 'apartments'), [
    { propertyKey: '*', typeKey: 'storage' },
  ]);
  assert.equal(yallaTypeMatches('Regular', 'studio'), true);
  assert.equal(yallaTypeMatches('Regular', 'one_bedroom'), true);
  assert.equal(yallaTypeMatches('Refresh', 'p2_refresh'), true);
  assert.equal(
    yallaPropertyMatches('Arenal Verdejo', 'arenal-verdejo', 'concepcion arenal'),
    true,
  );
});

test('Regular visits and Trastero storage are grouped, leftovers stay compact', () => {
  const invoice = parseCleaningInvoicePdf(
    pdf('FACTURA LIMPIEZA SEPTIEMBRE  2026.pdf'),
  );
  const yalla = [
    {
      id: 'av1',
      propertyId: 'av',
      property: 'Arenal Verdejo',
      cleaningTypeName: 'Regular',
      price: 35,
    },
    {
      id: 'e9',
      propertyId: 'e9',
      property: 'Esperanza 9',
      cleaningTypeName: 'Regular',
      price: 39,
    },
    {
      id: 'r1',
      propertyId: 'r1',
      property: 'Rodas',
      cleaningTypeName: 'Regular',
      price: 39,
    },
    {
      id: 'm1',
      propertyId: 'm1',
      property: 'Mendizabal',
      cleaningTypeName: 'Regular',
      price: 71,
    },
    {
      id: 'a1',
      propertyId: 'a1',
      property: 'Aguila',
      cleaningTypeName: 'Regular',
      price: 44.5,
    },
    {
      id: 'b1',
      propertyId: 'b1',
      property: 'Baranda',
      cleaningTypeName: 'Regular',
      price: 61,
    },
    {
      id: 's1',
      propertyId: 's1',
      property: 'Aguila',
      cleaningTypeName: 'Storage and WK assembling',
      price: 20.61,
    },
    {
      id: 's2',
      propertyId: 's2',
      property: 'Almendro',
      cleaningTypeName: 'Storage and WK assembling',
      price: 20.61,
    },
    {
      id: 's3',
      propertyId: 's3',
      property: 'Fe',
      cleaningTypeName: 'Storage and WK assembling',
      price: 20.61,
    },
    {
      id: 'x1',
      propertyId: 'r1',
      property: 'Rodas',
      cleaningTypeName: 'Reparto cubrecama doble',
      price: 11,
    },
  ];
  const result = reconcileInvoiceAgainstYalla(
    invoice.lines,
    yalla,
    'apartments',
    invoice.subtotal,
  );
  const trastero = result.matched.find((entry) =>
    /trastero/i.test(entry.invoiceDescription),
  );
  assert.equal(trastero?.yallaCount, 3);
  assert.equal(trastero?.mode, 'map');
  const concepcion = result.matched.find((entry) =>
    /concepcion arenal/i.test(entry.invoiceDescription),
  );
  assert.equal(concepcion?.yallaCount, 1);
  assert.equal(result.yallaOnly.length, 1);
  assert.equal(result.yallaOnly[0]?.id, 'x1');
  const groupedStorage = result.summary.find(
    (row) =>
      row.status !== 'yalla_only' && /trastero/i.test(row.invoiceLabel ?? ''),
  );
  assert.equal(groupedStorage?.yallaLabel, '3 × Storage and WK assembling');
  const leftovers = result.summary.filter((row) => row.status === 'yalla_only');
  assert.equal(leftovers.length, 1);
  assert.equal(leftovers[0]?.yallaLabel, '1 × Reparto cubrecama doble');
});

test('P2 Refresh lines correlate with Repasos general', () => {
  const result = reconcileInvoiceAgainstYalla(
    [
      {
        description: 'Repasos general',
        units: 6,
        unitPrice: 28,
        subtotal: 168,
      },
    ],
    Array.from({ length: 7 }, (_, index) => ({
      id: `r${index}`,
      propertyId: 'p2',
      property: 'P2',
      cleaningTypeName: 'Refresh',
      price: 28,
    })),
    'p2',
    168,
  );
  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0]?.yallaCount, 7);
  assert.equal(result.invoiceOnly.length, 0);
  assert.equal(result.yallaOnly.length, 0);
  assert.equal(result.summary[0]?.status, 'mismatch');
});

test('billing filter keeps p2 rooms out of apartments', () => {
  assert.equal(billingPropertyGroupOf('211', '693c3ad20c4f0500133cd017'), 'p2');
  assert.equal(billingPropertyGroupOf('Concepcion Arenal', 'apt-1'), 'apartments');
});
