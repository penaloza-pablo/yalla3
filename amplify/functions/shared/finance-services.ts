export const IVA_MULTIPLIER = 1.21;

export const SERVICE_TYPES = ['apartment', 'ops'] as const;
export type FinanceServiceType = (typeof SERVICE_TYPES)[number];

export const RECURRENCES = [
  'monthly',
  'bimonthly',
  'quarterly',
  'semiannual',
  'annual',
  'other',
] as const;
export type FinanceRecurrence = (typeof RECURRENCES)[number];

export type FinanceServiceOccurrence = {
  id: string;
  period: string;
  billingDate: string;
  price: number;
  appliesIva: boolean;
  priceWithIva: number;
};

export const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const isDateOnly = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export const isMonthId = (value: string) => /^\d{4}-\d{2}$/.test(value);

export const normalizeServiceType = (value: string): FinanceServiceType | '' => {
  const type = value.trim().toLowerCase();
  return SERVICE_TYPES.includes(type as FinanceServiceType)
    ? (type as FinanceServiceType)
    : '';
};

export const normalizeRecurrence = (value: string): FinanceRecurrence | '' => {
  const recurrence = value.trim().toLowerCase();
  return RECURRENCES.includes(recurrence as FinanceRecurrence)
    ? (recurrence as FinanceRecurrence)
    : '';
};

export const intervalMonths = (recurrence: FinanceRecurrence) => {
  if (recurrence === 'monthly') return 1;
  if (recurrence === 'bimonthly') return 2;
  if (recurrence === 'quarterly') return 3;
  if (recurrence === 'semiannual') return 6;
  if (recurrence === 'annual') return 12;
  return 0;
};

export const addMonthsToDate = (iso: string, months: number) => {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return iso;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const total = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(total / 12);
  const nextMonth = total % 12;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth + 1, 0)).getUTCDate();
  const nextDay = Math.min(day, lastDay);
  return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
};

const occurrencePriceWithIva = (price: number, appliesIva: boolean) =>
  roundMoney(appliesIva ? price * IVA_MULTIPLIER : price);

export const normalizeOccurrence = (
  value: unknown,
  fallbackId: string,
): FinanceServiceOccurrence | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const item = value as Record<string, unknown>;
  const billingDate = asString(item.billingDate).slice(0, 10);
  const period =
    asString(item.period).slice(0, 7) ||
    (isDateOnly(billingDate) ? billingDate.slice(0, 7) : '');
  if (!isMonthId(period) && !isDateOnly(billingDate)) {
    return null;
  }
  const price = Math.max(0, asNumber(item.price) ?? 0);
  const appliesIva = Boolean(item.appliesIva);
  const date = isDateOnly(billingDate) ? billingDate : `${period}-01`;
  return {
    id: asString(item.id) || fallbackId,
    period: isMonthId(period) ? period : date.slice(0, 7),
    billingDate: date,
    price: roundMoney(price),
    appliesIva,
    priceWithIva: occurrencePriceWithIva(price, appliesIva),
  };
};

export const generateOccurrences = (
  serviceId: string,
  startDate: string,
  recurrence: FinanceRecurrence,
  horizonMonths = 24,
): FinanceServiceOccurrence[] => {
  if (!isDateOnly(startDate)) {
    return [];
  }
  const interval = intervalMonths(recurrence);
  const endDate = addMonthsToDate(startDate, horizonMonths);
  const items: FinanceServiceOccurrence[] = [];
  let current = startDate;
  while (current < endDate) {
    const period = current.slice(0, 7);
    items.push({
      id: `${serviceId}-${period}`,
      period,
      billingDate: current,
      price: 0,
      appliesIva: false,
      priceWithIva: 0,
    });
    if (interval <= 0) {
      break;
    }
    current = addMonthsToDate(current, interval);
  }
  return items;
};

export const mergeOccurrences = (
  generated: FinanceServiceOccurrence[],
  existing: FinanceServiceOccurrence[],
) => {
  const byPeriod = new Map(existing.map((item) => [item.period, item]));
  const merged = generated.map((item) => {
    const previous = byPeriod.get(item.period);
    if (!previous) {
      return item;
    }
    byPeriod.delete(item.period);
    return {
      ...item,
      id: previous.id || item.id,
      billingDate: previous.billingDate || item.billingDate,
      price: previous.price,
      appliesIva: previous.appliesIva,
      priceWithIva: occurrencePriceWithIva(previous.price, previous.appliesIva),
    };
  });
  const extras = [...byPeriod.values()].sort((left, right) =>
    left.billingDate.localeCompare(right.billingDate),
  );
  return [...merged, ...extras];
};

export const parseOccurrences = (value: unknown, serviceId: string) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry, index) =>
      normalizeOccurrence(entry, `${serviceId}-${String(index + 1).padStart(3, '0')}`),
    )
    .filter((entry): entry is FinanceServiceOccurrence => Boolean(entry))
    .sort((left, right) => left.billingDate.localeCompare(right.billingDate));
};
