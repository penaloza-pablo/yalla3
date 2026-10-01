import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { nowIso } from './dynamo-http';
import { docClient } from './visit-task-utils';
import { foldInvoiceText, moneyEquals, type InvoicePropertyGroup } from './cleaning-invoice-equivalences';
import { isCoreOccupancyType } from './cleaning-invoice-interpret';

export const CLEANING_INVOICE_MEMORY_ID = 'memory::cleaning-invoice-equivalences';

const MAX_LEARNED_RULES = 200;

export type LearnedInvoiceEquivalence = {
  group: InvoicePropertyGroup;
  invoiceFolded: string;
  yallaTypeFolded: string;
  unitPrice?: number;
  hits: number;
  lastSeenAt: string;
  lastInvoiceNumber?: string;
  source?: 'auto' | 'user_feedback' | 'interpreted';
};

const asGroup = (value: unknown): InvoicePropertyGroup | null =>
  value === 'apartments' || value === 'p2' ? value : null;

const asRule = (value: unknown): LearnedInvoiceEquivalence | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const entry = value as Record<string, unknown>;
  const group = asGroup(entry.group);
  const invoiceFolded = foldInvoiceText(String(entry.invoiceFolded ?? ''));
  const yallaTypeFolded = foldInvoiceText(String(entry.yallaTypeFolded ?? ''));
  if (!group || !invoiceFolded || !yallaTypeFolded) {
    return null;
  }
  const unitPrice = Number(entry.unitPrice);
  return {
    group,
    invoiceFolded,
    yallaTypeFolded,
    unitPrice: Number.isFinite(unitPrice) ? unitPrice : undefined,
    hits: Math.max(1, Number(entry.hits) || 1),
    lastSeenAt: typeof entry.lastSeenAt === 'string' ? entry.lastSeenAt : nowIso(),
    lastInvoiceNumber:
      typeof entry.lastInvoiceNumber === 'string'
        ? entry.lastInvoiceNumber
        : undefined,
    source:
      entry.source === 'user_feedback'
        ? 'user_feedback'
        : entry.source === 'interpreted'
          ? 'interpreted'
          : 'auto',
  };
};

const ruleKey = (rule: LearnedInvoiceEquivalence) =>
  `${rule.group}|${rule.invoiceFolded}|${rule.yallaTypeFolded}|${
    rule.unitPrice == null ? '' : rule.unitPrice.toFixed(2)
  }`;

export const mergeInvoiceEquivalenceMemory = (
  existing: LearnedInvoiceEquivalence[],
  incoming: LearnedInvoiceEquivalence[],
) => {
  const merged = new Map<string, LearnedInvoiceEquivalence>();
  for (const rule of [...existing, ...incoming]) {
    const key = ruleKey(rule);
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, { ...rule });
      continue;
    }
    merged.set(key, {
      ...previous,
      hits: previous.hits + (rule.hits || 1),
      lastSeenAt: rule.lastSeenAt || previous.lastSeenAt,
      lastInvoiceNumber: rule.lastInvoiceNumber || previous.lastInvoiceNumber,
      unitPrice: rule.unitPrice ?? previous.unitPrice,
      source: rule.source || previous.source,
    });
  }
  return [...merged.values()]
    .sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))
    .slice(0, MAX_LEARNED_RULES);
};

export const collectLearnedFromMatches = (
  group: InvoicePropertyGroup,
  invoiceNumber: string,
  matched: Array<{
    mode?: string;
    invoiceDescription: string;
    invoiceSubtotal: number;
    yallaTotal: number;
    yallaLines: Array<{ cleaningTypeName: string; price: number }>;
  }>,
): LearnedInvoiceEquivalence[] => {
  const lastSeenAt = nowIso();
  const incoming: LearnedInvoiceEquivalence[] = [];
  for (const entry of matched) {
    if (!moneyEquals(entry.invoiceSubtotal, entry.yallaTotal)) {
      continue;
    }
    const invoiceFolded = foldInvoiceText(entry.invoiceDescription);
    if (!invoiceFolded) {
      continue;
    }
    const interpreted = entry.mode === 'interpreted';
    const byType = new Map<string, number[]>();
    for (const line of entry.yallaLines) {
      if (interpreted && isCoreOccupancyType(line.cleaningTypeName)) {
        continue;
      }
      const yallaTypeFolded = foldInvoiceText(line.cleaningTypeName);
      if (!yallaTypeFolded) {
        continue;
      }
      const prices = byType.get(yallaTypeFolded) ?? [];
      prices.push(line.price);
      byType.set(yallaTypeFolded, prices);
    }
    for (const [yallaTypeFolded, prices] of byType) {
      const samePrice = prices.every((price) => moneyEquals(price, prices[0]));
      incoming.push({
        group,
        invoiceFolded,
        yallaTypeFolded,
        unitPrice: samePrice ? prices[0] : undefined,
        hits: 1,
        lastSeenAt,
        lastInvoiceNumber: invoiceNumber || undefined,
        source: interpreted ? 'interpreted' : 'auto',
      });
    }
  }
  return incoming;
};

export const stripYallaCountPrefix = (label: string) =>
  label.replace(/^\s*\d+\s*[×x]\s*/u, '').trim();

export type InvoiceFeedbackPair = {
  invoiceDescription: string;
  yallaTypeName: string;
  unitPrice?: number;
};

export const feedbackPairsToRules = (
  group: InvoicePropertyGroup,
  invoiceNumber: string,
  pairs: InvoiceFeedbackPair[],
): LearnedInvoiceEquivalence[] => {
  const lastSeenAt = nowIso();
  const incoming: LearnedInvoiceEquivalence[] = [];
  for (const pair of pairs) {
    const invoiceFolded = foldInvoiceText(pair.invoiceDescription);
    const yallaTypeFolded = foldInvoiceText(
      stripYallaCountPrefix(pair.yallaTypeName),
    );
    if (!invoiceFolded || !yallaTypeFolded) {
      continue;
    }
    const unitPrice = Number(pair.unitPrice);
    incoming.push({
      group,
      invoiceFolded,
      yallaTypeFolded,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : undefined,
      hits: 1,
      lastSeenAt,
      lastInvoiceNumber: invoiceNumber || undefined,
      source: 'user_feedback',
    });
  }
  return incoming;
};

const asFeedbackPairs = (value: unknown): InvoiceFeedbackPair[] => {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }
      const item = entry as Record<string, unknown>;
      const invoiceDescription = String(item.invoiceDescription ?? '').trim();
      const yallaTypeName = String(item.yallaTypeName ?? '').trim();
      if (!invoiceDescription || !yallaTypeName) {
        return [];
      }
      const unitPrice = Number(item.unitPrice);
      return [
        {
          invoiceDescription,
          yallaTypeName,
          unitPrice: Number.isFinite(unitPrice) ? unitPrice : undefined,
        },
      ];
    });
  }
  return [];
};

export const recordCleaningInvoiceFeedback = async (
  args: Record<string, unknown>,
) => {
  const group = asGroup(args.group);
  if (!group) {
    throw new Error('group is required.');
  }
  const invoiceNumber =
    typeof args.invoiceNumber === 'string' ? args.invoiceNumber.trim() : '';
  const pairs = asFeedbackPairs(args.pairs);
  if (
    typeof args.invoiceDescription === 'string' &&
    typeof args.yallaTypeName === 'string'
  ) {
    pairs.push({
      invoiceDescription: args.invoiceDescription,
      yallaTypeName: args.yallaTypeName,
      unitPrice: Number.isFinite(Number(args.unitPrice))
        ? Number(args.unitPrice)
        : undefined,
    });
  }
  const incoming = feedbackPairsToRules(group, invoiceNumber, pairs);
  if (incoming.length === 0) {
    throw new Error('At least one invoice/Yalla pair is required.');
  }
  await saveInvoiceEquivalenceMemory(incoming, { required: true });
  const stored = await loadInvoiceEquivalenceMemory();
  return {
    saved: incoming.length,
    group,
    invoiceNumber,
    rules: incoming,
    memorySize: stored.length,
  };
};

export const loadInvoiceEquivalenceMemory = async () => {
  const tableName = process.env.AGENTS_TABLE || '';
  if (!tableName) {
    return [] as LearnedInvoiceEquivalence[];
  }
  try {
    const result = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { id: CLEANING_INVOICE_MEMORY_ID },
      }),
    );
    const rules = Array.isArray(result.Item?.rules) ? result.Item.rules : [];
    return rules
      .map((entry) => asRule(entry))
      .filter((entry): entry is LearnedInvoiceEquivalence => Boolean(entry));
  } catch {
    return [] as LearnedInvoiceEquivalence[];
  }
};

export const saveInvoiceEquivalenceMemory = async (
  incoming: LearnedInvoiceEquivalence[],
  options?: { required?: boolean },
) => {
  if (incoming.length === 0) {
    return;
  }
  const tableName = process.env.AGENTS_TABLE || '';
  if (!tableName) {
    if (options?.required) {
      throw new Error('AGENTS_TABLE is not configured.');
    }
    return;
  }
  try {
    const existing = await loadInvoiceEquivalenceMemory();
    const rules = mergeInvoiceEquivalenceMemory(existing, incoming);
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          id: CLEANING_INVOICE_MEMORY_ID,
          recordType: 'invoice-memory',
          updatedAt: nowIso(),
          rules,
        },
      }),
    );
  } catch (error) {
    if (options?.required) {
      throw error;
    }
  }
};
