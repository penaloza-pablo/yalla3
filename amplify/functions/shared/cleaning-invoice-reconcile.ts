import { billingPropertyGroupOf } from './cleaning-property-groups';
import { buildMonthDetail, isMonthId, type BillingLine } from './cleaning-billing';
import {
  foldInvoiceText,
  mapInvoiceDescription,
  moneyEquals,
  yallaPropertyMatches,
  yallaTypeMatches,
  type InvoicePropertyGroup,
} from './cleaning-invoice-equivalences';
import { loadInvoiceBytes } from './cleaning-invoice-verify';
import {
  asInvoiceGroup,
  parseCleaningInvoicePdfWithFallback,
  type ParsedInvoiceLine,
} from './cleaning-invoice-parse';

export type YallaInvoiceLine = {
  id: string;
  propertyId: string;
  property: string;
  cleaningTypeName: string;
  price: number;
};

export type ReconcileMatch = {
  mode: 'map' | 'price';
  invoiceDescription: string;
  invoiceUnits: number;
  invoiceSubtotal: number;
  yallaLines: YallaInvoiceLine[];
  yallaCount: number;
  yallaTotal: number;
};

export type ReconcileNetted = {
  reason: 'pair' | 'discount';
  descriptions: string[];
  amount: number;
};

export type CleaningInvoiceReconcileResult = {
  monthId: string;
  group: InvoicePropertyGroup;
  s3Key: string;
  invoiceNumber: string;
  matched: ReconcileMatch[];
  netted: ReconcileNetted[];
  invoiceOnly: Array<{
    description: string;
    units: number;
    subtotal: number;
  }>;
  yallaOnly: YallaInvoiceLine[];
  totals: {
    invoiceExVat: number;
    yallaExVat: number;
    delta: number;
    favor: 'provider' | 'yalla' | 'even';
  };
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : value == null ? '' : String(value);

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const toYallaLine = (line: BillingLine): YallaInvoiceLine | null => {
  if (line.price == null || !Number.isFinite(line.price)) {
    return null;
  }
  return {
    id: line.id,
    propertyId: line.propertyId,
    property: line.property,
    cleaningTypeName: line.cleaningTypeName,
    price: line.price,
  };
};

const lineMatchesTarget = (
  line: YallaInvoiceLine,
  propertyKey: string,
  typeKey: ReturnType<typeof mapInvoiceDescription>[number]['typeKey'],
) =>
  yallaPropertyMatches(line.property, line.propertyId, propertyKey) &&
  yallaTypeMatches(line.cleaningTypeName, typeKey);

export const filterBillingLinesForGroup = (
  lines: BillingLine[],
  group: InvoicePropertyGroup,
) =>
  lines.filter(
    (line) => billingPropertyGroupOf(line.property, line.propertyId) === group,
  );

const takeMatchingYalla = (
  remaining: YallaInvoiceLine[],
  invoiceLine: ParsedInvoiceLine,
  group: InvoicePropertyGroup,
) => {
  const targets = mapInvoiceDescription(invoiceLine.description, group);
  if (targets.length === 0) {
    return [] as YallaInvoiceLine[];
  }
  const taken: YallaInvoiceLine[] = [];
  for (const target of targets) {
    const matches = remaining.filter((line) =>
      lineMatchesTarget(line, target.propertyKey, target.typeKey),
    );
    if (matches.length === 0) {
      continue;
    }
    taken.push(...matches);
  }
  const unique = new Map(taken.map((line) => [line.id, line]));
  return [...unique.values()];
};

const removeIds = (lines: YallaInvoiceLine[], taken: YallaInvoiceLine[]) => {
  const ids = new Set(taken.map((line) => line.id));
  return lines.filter((line) => !ids.has(line.id));
};

const isDiscountLine = (description: string) =>
  foldInvoiceText(description).startsWith('descuento');

export const reconcileInvoiceAgainstYalla = (
  invoiceLines: ParsedInvoiceLine[],
  yallaLines: YallaInvoiceLine[],
  group: InvoicePropertyGroup,
  invoiceSubtotal: number,
): Omit<
  CleaningInvoiceReconcileResult,
  'monthId' | 'group' | 's3Key' | 'invoiceNumber'
> => {
  let remainingYalla = [...yallaLines];
  const remainingInvoice = [...invoiceLines];
  const matched: ReconcileMatch[] = [];
  const netted: ReconcileNetted[] = [];

  for (let index = remainingInvoice.length - 1; index >= 0; index -= 1) {
    const invoiceLine = remainingInvoice[index];
    const taken = takeMatchingYalla(remainingYalla, invoiceLine, group);
    if (taken.length === 0) {
      continue;
    }
    const yallaTotal = roundMoney(taken.reduce((sum, line) => sum + line.price, 0));
    matched.push({
      mode: 'map',
      invoiceDescription: invoiceLine.description,
      invoiceUnits: invoiceLine.units,
      invoiceSubtotal: invoiceLine.subtotal,
      yallaLines: taken,
      yallaCount: taken.length,
      yallaTotal,
    });
    remainingYalla = removeIds(remainingYalla, taken);
    remainingInvoice.splice(index, 1);
  }

  for (let index = remainingInvoice.length - 1; index >= 0; index -= 1) {
    const invoiceLine = remainingInvoice[index];
    if (!isDiscountLine(invoiceLine.description)) {
      continue;
    }
    netted.push({
      reason: 'discount',
      descriptions: [invoiceLine.description],
      amount: invoiceLine.subtotal,
    });
    remainingInvoice.splice(index, 1);
  }

  const usedPair = new Set<number>();
  for (let left = 0; left < remainingInvoice.length; left += 1) {
    if (usedPair.has(left)) {
      continue;
    }
    for (let right = left + 1; right < remainingInvoice.length; right += 1) {
      if (usedPair.has(right)) {
        continue;
      }
      if (
        moneyEquals(
          remainingInvoice[left].subtotal,
          -remainingInvoice[right].subtotal,
        )
      ) {
        netted.push({
          reason: 'pair',
          descriptions: [
            remainingInvoice[left].description,
            remainingInvoice[right].description,
          ],
          amount: remainingInvoice[left].subtotal,
        });
        usedPair.add(left);
        usedPair.add(right);
        break;
      }
    }
  }
  for (let index = remainingInvoice.length - 1; index >= 0; index -= 1) {
    if (usedPair.has(index)) {
      remainingInvoice.splice(index, 1);
    }
  }

  for (let index = remainingInvoice.length - 1; index >= 0; index -= 1) {
    const invoiceLine = remainingInvoice[index];
    const byPrice = remainingYalla.filter((line) =>
      moneyEquals(line.price, invoiceLine.subtotal),
    );
    if (byPrice.length === 0) {
      continue;
    }
    const taken = byPrice.slice(0, Math.max(1, Math.round(invoiceLine.units) || 1));
    matched.push({
      mode: 'price',
      invoiceDescription: invoiceLine.description,
      invoiceUnits: invoiceLine.units,
      invoiceSubtotal: invoiceLine.subtotal,
      yallaLines: taken,
      yallaCount: taken.length,
      yallaTotal: roundMoney(taken.reduce((sum, line) => sum + line.price, 0)),
    });
    remainingYalla = removeIds(remainingYalla, taken);
    remainingInvoice.splice(index, 1);
  }

  const yallaExVat = roundMoney(
    yallaLines.reduce((sum, line) => sum + line.price, 0),
  );
  const invoiceExVat = roundMoney(invoiceSubtotal);
  const delta = roundMoney(invoiceExVat - yallaExVat);
  const favor =
    Math.abs(delta) <= 0.02 ? 'even' : delta > 0 ? 'provider' : 'yalla';

  return {
    matched,
    netted,
    invoiceOnly: remainingInvoice.map((line) => ({
      description: line.description,
      units: line.units,
      subtotal: line.subtotal,
    })),
    yallaOnly: remainingYalla,
    totals: { invoiceExVat, yallaExVat, delta, favor },
  };
};

export const reconcileCleaningInvoice = async (
  args: Record<string, unknown>,
): Promise<CleaningInvoiceReconcileResult> => {
  const monthId = asString(args.monthId);
  const group = asInvoiceGroup(args.group);
  const s3Key = asString(args.s3Key);
  if (!isMonthId(monthId) || !group || !s3Key) {
    throw new Error('monthId, group and s3Key are required.');
  }
  const billingTable = process.env.CLEANING_BILLING_TABLE || '';
  const visitsTable = process.env.VISITS_TABLE || 'yalla-visits';
  const plansTable = process.env.CLEANING_PLANS_TABLE || '';
  const detailsTable = process.env.PROPERTY_CLEANING_DETAILS_TABLE || '';
  if (!billingTable || !plansTable) {
    throw new Error('Cleaning billing tables are not configured.');
  }
  const loaded = await loadInvoiceBytes({ s3Key, fileBase64: args.fileBase64 });
  if (!loaded.bytes) {
    throw new Error('Could not read the stored invoice PDF.');
  }
  const invoice = await parseCleaningInvoicePdfWithFallback(loaded.bytes);
  const detail = await buildMonthDetail({
    monthId,
    billingTable,
    visitsTable,
    plansTable,
    detailsTable,
    persistSummary: false,
    includeKits: false,
  });
  const yallaLines = filterBillingLinesForGroup(detail.lines, group)
    .map(toYallaLine)
    .filter((line): line is YallaInvoiceLine => Boolean(line));
  const result = reconcileInvoiceAgainstYalla(
    invoice.lines,
    yallaLines,
    group,
    invoice.subtotal,
  );
  return {
    monthId,
    group,
    s3Key,
    invoiceNumber: invoice.invoiceNumber,
    ...result,
  };
};
