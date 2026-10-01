import { billingPropertyGroupOf } from './cleaning-property-groups';
import { buildMonthDetail, isMonthId, type BillingLine } from './cleaning-billing';
import {
  foldInvoiceText,
  mapInvoiceDescription,
  moneyEquals,
  yallaPropertyMatches,
  yallaTypeMatches,
  type InvoicePropertyGroup,
  type InvoiceTypeKey,
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
  mode: 'map' | 'price' | 'aggregate';
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

export type ReconcileSummaryRow = {
  status: 'matched' | 'mismatch' | 'invoice_only' | 'yalla_only' | 'netted';
  invoiceLabel?: string;
  yallaLabel?: string;
  invoiceUnits?: number;
  yallaCount?: number;
  invoiceAmount: number;
  yallaAmount: number;
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
  summary: ReconcileSummaryRow[];
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
  typeKey: InvoiceTypeKey,
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

const isDiscountLine = (description: string) =>
  foldInvoiceText(description).startsWith('descuento');

const matchRank = (invoiceLine: ParsedInvoiceLine, group: InvoicePropertyGroup) => {
  const targets = mapInvoiceDescription(invoiceLine.description, group);
  if (targets.length === 0) {
    return 100;
  }
  if (isDiscountLine(invoiceLine.description)) {
    return 90;
  }
  const specific = targets.some((target) => target.propertyKey !== '*');
  const sofa = targets.some(
    (target) =>
      target.typeKey === 'studio_sofa' || target.typeKey === 'one_bedroom_sofa',
  );
  const storage = targets.some((target) => target.typeKey === 'storage');
  const twoBedroom = targets.some((target) => target.typeKey === 'two_bedroom');
  const studio = targets.some((target) => target.typeKey === 'studio');
  const oneBedroom = targets.some((target) => target.typeKey === 'one_bedroom');
  if (specific && sofa) {
    return 0;
  }
  if (specific) {
    return 10;
  }
  if (sofa) {
    return 20;
  }
  if (twoBedroom) {
    return 30;
  }
  if (studio) {
    return 40;
  }
  if (oneBedroom) {
    return 50;
  }
  if (storage) {
    return 80;
  }
  return 60;
};

const UNIT_PRICE_TYPES = new Set<InvoiceTypeKey>([
  'studio',
  'studio_sofa',
  'one_bedroom',
  'one_bedroom_sofa',
  'two_bedroom',
  'room_regular',
  'room_refresh',
  'p2_refresh',
  'refresh',
]);

const isSofaType = (typeKey: InvoiceTypeKey) =>
  typeKey === 'studio_sofa' || typeKey === 'one_bedroom_sofa';

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
    let matches = remaining.filter((line) =>
      lineMatchesTarget(line, target.propertyKey, target.typeKey),
    );
    if (
      matches.length === 0 &&
      isSofaType(target.typeKey) &&
      invoiceLine.unitPrice
    ) {
      matches = remaining.filter(
        (line) =>
          yallaPropertyMatches(line.property, line.propertyId, target.propertyKey) &&
          yallaTypeMatches(line.cleaningTypeName, 'one_bedroom') &&
          moneyEquals(line.price, invoiceLine.unitPrice),
      );
    }
    if (
      invoiceLine.unitPrice &&
      UNIT_PRICE_TYPES.has(target.typeKey) &&
      Number.isFinite(invoiceLine.unitPrice)
    ) {
      const priced = matches.filter((line) =>
        moneyEquals(line.price, invoiceLine.unitPrice),
      );
      if (priced.length > 0) {
        matches = priced;
      }
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

const pushMatch = (
  matched: ReconcileMatch[],
  invoiceLine: ParsedInvoiceLine,
  taken: YallaInvoiceLine[],
  mode: ReconcileMatch['mode'],
) => {
  matched.push({
    mode,
    invoiceDescription: invoiceLine.description,
    invoiceUnits: invoiceLine.units,
    invoiceSubtotal: invoiceLine.subtotal,
    yallaLines: taken,
    yallaCount: taken.length,
    yallaTotal: roundMoney(taken.reduce((sum, line) => sum + line.price, 0)),
  });
};

const summarizeYallaLines = (lines: YallaInvoiceLine[]) => {
  const groups = new Map<string, { count: number; total: number }>();
  for (const line of lines) {
    const key = line.cleaningTypeName.trim() || '—';
    const current = groups.get(key) ?? { count: 0, total: 0 };
    current.count += 1;
    current.total = roundMoney(current.total + line.price);
    groups.set(key, current);
  }
  return [...groups.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([name, group]) => `${group.count} × ${name}`)
    .join(', ');
};

const groupYallaLeftovers = (lines: YallaInvoiceLine[]): ReconcileSummaryRow[] => {
  const groups = new Map<
    string,
    { type: string; count: number; total: number }
  >();
  for (const line of lines) {
    const type = line.cleaningTypeName.trim() || '—';
    const key = `${foldInvoiceText(type)}|${line.price.toFixed(2)}`;
    const current = groups.get(key) ?? { type, count: 0, total: 0 };
    current.count += 1;
    current.total = roundMoney(current.total + line.price);
    groups.set(key, current);
  }
  return [...groups.values()]
    .sort((left, right) => left.type.localeCompare(right.type) || left.total - right.total)
    .map((group) => ({
      status: 'yalla_only' as const,
      yallaLabel: `${group.count} × ${group.type}`,
      yallaCount: group.count,
      invoiceAmount: 0,
      yallaAmount: group.total,
    }));
};

export const buildReconcileSummary = (
  matched: ReconcileMatch[],
  netted: ReconcileNetted[],
  invoiceOnly: CleaningInvoiceReconcileResult['invoiceOnly'],
  yallaOnly: YallaInvoiceLine[],
): ReconcileSummaryRow[] => {
  const rows: ReconcileSummaryRow[] = [];
  for (const entry of matched) {
    const aligned = moneyEquals(entry.invoiceSubtotal, entry.yallaTotal);
    rows.push({
      status: aligned ? 'matched' : 'mismatch',
      invoiceLabel: entry.invoiceDescription,
      yallaLabel: summarizeYallaLines(entry.yallaLines),
      invoiceUnits: entry.invoiceUnits,
      yallaCount: entry.yallaCount,
      invoiceAmount: entry.invoiceSubtotal,
      yallaAmount: entry.yallaTotal,
    });
  }
  for (const entry of netted) {
    rows.push({
      status: 'netted',
      invoiceLabel: entry.descriptions.join(' / '),
      invoiceAmount: entry.amount,
      yallaAmount: 0,
    });
  }
  for (const line of invoiceOnly) {
    rows.push({
      status: 'invoice_only',
      invoiceLabel: line.description,
      invoiceUnits: line.units,
      invoiceAmount: line.subtotal,
      yallaAmount: 0,
    });
  }
  rows.push(...groupYallaLeftovers(yallaOnly));
  return rows;
};

const groupRemainingByType = (lines: YallaInvoiceLine[]) => {
  const groups = new Map<string, YallaInvoiceLine[]>();
  for (const line of lines) {
    const key = foldInvoiceText(line.cleaningTypeName) || line.id;
    const current = groups.get(key) ?? [];
    current.push(line);
    groups.set(key, current);
  }
  return [...groups.values()];
};

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
  let remainingInvoice = [...invoiceLines];
  const matched: ReconcileMatch[] = [];
  const netted: ReconcileNetted[] = [];

  const rankedIndexes = remainingInvoice
    .map((_, index) => index)
    .sort((left, right) => {
      const rankDelta =
        matchRank(remainingInvoice[left], group) -
        matchRank(remainingInvoice[right], group);
      return rankDelta !== 0 ? rankDelta : right - left;
    });
  const usedInvoice = new Set<number>();
  for (const index of rankedIndexes) {
    const invoiceLine = remainingInvoice[index];
    const taken = takeMatchingYalla(remainingYalla, invoiceLine, group);
    if (taken.length === 0) {
      continue;
    }
    pushMatch(matched, invoiceLine, taken, 'map');
    remainingYalla = removeIds(remainingYalla, taken);
    usedInvoice.add(index);
  }
  remainingInvoice = remainingInvoice.filter((_, index) => !usedInvoice.has(index));

  for (let index = remainingInvoice.length - 1; index >= 0; index -= 1) {
    const invoiceLine = remainingInvoice[index];
    const typeGroups = groupRemainingByType(remainingYalla);
    const byType = typeGroups.find((lines) =>
      moneyEquals(
        roundMoney(lines.reduce((sum, line) => sum + line.price, 0)),
        invoiceLine.subtotal,
      ),
    );
    const allSum = roundMoney(
      remainingYalla.reduce((sum, line) => sum + line.price, 0),
    );
    const taken = byType
      ? byType
      : moneyEquals(allSum, invoiceLine.subtotal)
        ? [...remainingYalla]
        : [];
    if (taken.length === 0) {
      continue;
    }
    pushMatch(matched, invoiceLine, taken, 'aggregate');
    remainingYalla = removeIds(remainingYalla, taken);
    remainingInvoice.splice(index, 1);
  }

  for (let index = remainingInvoice.length - 1; index >= 0; index -= 1) {
    const invoiceLine = remainingInvoice[index];
    const targets = mapInvoiceDescription(invoiceLine.description, group);
    if (
      !invoiceLine.unitPrice ||
      !targets.some((target) => UNIT_PRICE_TYPES.has(target.typeKey))
    ) {
      continue;
    }
    const priced = remainingYalla.filter((line) => {
      if (!moneyEquals(line.price, invoiceLine.unitPrice)) {
        return false;
      }
      return targets.some(
        (target) =>
          yallaTypeMatches(line.cleaningTypeName, target.typeKey) ||
          (isSofaType(target.typeKey) &&
            yallaTypeMatches(line.cleaningTypeName, 'one_bedroom')),
      );
    });
    if (priced.length === 0) {
      continue;
    }
    pushMatch(matched, invoiceLine, priced, 'price');
    remainingYalla = removeIds(remainingYalla, priced);
    remainingInvoice.splice(index, 1);
  }

  for (let index = remainingInvoice.length - 1; index >= 0; index -= 1) {
    const invoiceLine = remainingInvoice[index];
    const bySubtotal = remainingYalla.filter((line) =>
      moneyEquals(line.price, invoiceLine.subtotal),
    );
    if (bySubtotal.length === 0) {
      continue;
    }
    const taken = bySubtotal.slice(0, Math.max(1, Math.round(invoiceLine.units) || 1));
    pushMatch(matched, invoiceLine, taken, 'price');
    remainingYalla = removeIds(remainingYalla, taken);
    remainingInvoice.splice(index, 1);
  }

  for (let index = remainingInvoice.length - 1; index >= 0; index -= 1) {
    const invoiceLine = remainingInvoice[index];
    if (!isDiscountLine(invoiceLine.description)) {
      continue;
    }
    const negatives = remainingYalla.filter((line) =>
      moneyEquals(line.price, invoiceLine.subtotal),
    );
    if (negatives.length === 0) {
      continue;
    }
    pushMatch(matched, invoiceLine, negatives.slice(0, 1), 'price');
    remainingYalla = removeIds(remainingYalla, negatives.slice(0, 1));
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
  remainingInvoice = remainingInvoice.filter((_, index) => !usedPair.has(index));

  const invoiceOnly = remainingInvoice.map((line) => ({
    description: line.description,
    units: line.units,
    subtotal: line.subtotal,
  }));
  const yallaExVat = roundMoney(
    yallaLines.reduce((sum, line) => sum + line.price, 0),
  );
  const invoiceExVat = roundMoney(invoiceSubtotal);
  const delta = roundMoney(invoiceExVat - yallaExVat);
  const favor =
    Math.abs(delta) <= 0.02 ? 'even' : delta > 0 ? 'provider' : 'yalla';
  const summary = buildReconcileSummary(
    matched,
    netted,
    invoiceOnly,
    remainingYalla,
  );

  return {
    matched,
    netted,
    invoiceOnly,
    yallaOnly: remainingYalla,
    summary,
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
