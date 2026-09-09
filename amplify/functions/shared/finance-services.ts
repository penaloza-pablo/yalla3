import {
  occurrencePriceWithIva,
  resolveIvaRate,
  roundMoney,
  type IvaRate,
} from './iva';

export {
  IVA_MULTIPLIER,
  IVA_RATES,
  occurrencePriceWithIva,
  parseIvaRate,
  persistIvaFields,
  priceFromGross,
  resolveIvaRate,
  resolveIvaRateFromInput,
  roundMoney,
  type IvaRate,
} from './iva';

export const SERVICE_TYPES = ['apartment', 'ops'] as const;
export type FinanceServiceType = (typeof SERVICE_TYPES)[number];

export const RECURRENCES = [
  'monthly',
  'bimonthly',
  'quarterly',
  'semiannual',
  'annual',
  'other',
  'oneoff',
] as const;
export type FinanceRecurrence = (typeof RECURRENCES)[number];

export const CUSTOM_UNITS = ['days', 'weeks', 'months'] as const;
export type FinanceCustomUnit = (typeof CUSTOM_UNITS)[number];

export const PRICE_MODES = ['fixed', 'variable'] as const;
export type FinancePriceMode = (typeof PRICE_MODES)[number];

export const RECORD_TYPES = ['schedule', 'item'] as const;
export type FinanceRecordType = (typeof RECORD_TYPES)[number];

export type FinanceServiceOccurrence = {
  id: string;
  period: string;
  billingDate: string;
  price: number;
  ivaRate: IvaRate;
  appliesIva: boolean;
  priceWithIva: number;
};

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

export const normalizeCustomUnit = (value: string): FinanceCustomUnit | '' => {
  const unit = value.trim().toLowerCase();
  return CUSTOM_UNITS.includes(unit as FinanceCustomUnit)
    ? (unit as FinanceCustomUnit)
    : '';
};

export const normalizePriceMode = (value: string): FinancePriceMode | '' => {
  const mode = value.trim().toLowerCase();
  return PRICE_MODES.includes(mode as FinancePriceMode)
    ? (mode as FinancePriceMode)
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

export const addDaysToDate = (iso: string, days: number) => {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return iso;
  }
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

export const addByCustomUnit = (
  iso: string,
  interval: number,
  unit: FinanceCustomUnit,
) => {
  const step = Math.max(1, interval);
  if (unit === 'days') {
    return addDaysToDate(iso, step);
  }
  if (unit === 'weeks') {
    return addDaysToDate(iso, step * 7);
  }
  return addMonthsToDate(iso, step);
};

export const monthDateRange = (monthId: string) => {
  const [year, month] = monthId.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${monthId}-01`,
    end: `${monthId}-${String(lastDay).padStart(2, '0')}`,
  };
};

export const generatedBillingItemId = (scheduleId: string, billingDate: string) =>
  `${scheduleId}#${billingDate}`;

export const isBillingItemRecord = (item: Record<string, unknown>) =>
  asString(item.recordType) === 'item' ||
  asString(item.id).includes('#') ||
  asString(item.id).toUpperCase().startsWith('SIT-');

export const isScheduleRecord = (item: Record<string, unknown>) =>
  !isBillingItemRecord(item);

export type ScheduleDueInput = {
  startDate: string;
  recurrence: FinanceRecurrence;
  customInterval?: number;
  customUnit?: FinanceCustomUnit | '';
};

export const dueBillingDatesInMonth = (
  schedule: ScheduleDueInput,
  monthId: string,
) => {
  if (!isMonthId(monthId) || !isDateOnly(schedule.startDate)) {
    return [] as string[];
  }
  const { start: monthStart, end: monthEnd } = monthDateRange(monthId);
  if (schedule.startDate > monthEnd) {
    return [] as string[];
  }

  const dates: string[] = [];
  const pushIfDue = (date: string) => {
    if (
      isDateOnly(date) &&
      date >= schedule.startDate &&
      date >= monthStart &&
      date <= monthEnd
    ) {
      dates.push(date);
    }
  };

  if (schedule.recurrence === 'other') {
    const interval = Math.max(1, Math.floor(schedule.customInterval ?? 0));
    const unit = schedule.customUnit || 'months';
    if (!interval || !unit) {
      return [];
    }
    let current = schedule.startDate;
    for (let guard = 0; guard < 400 && current <= monthEnd; guard += 1) {
      pushIfDue(current);
      const next = addByCustomUnit(current, interval, unit);
      if (next <= current) {
        break;
      }
      current = next;
    }
    return dates;
  }

  const interval = intervalMonths(schedule.recurrence);
  if (interval <= 0) {
    return [];
  }
  let current = schedule.startDate;
  for (let guard = 0; guard < 120 && current <= monthEnd; guard += 1) {
    if (current.slice(0, 7) === monthId) {
      pushIfDue(current);
    }
    const next = addMonthsToDate(current, interval);
    if (next <= current) {
      break;
    }
    current = next;
  }
  return dates;
};

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
  const ivaRate = resolveIvaRate(item);
  const date = isDateOnly(billingDate) ? billingDate : `${period}-01`;
  const storedWithIva = asNumber(item.priceWithIva);
  return {
    id: asString(item.id) || fallbackId,
    period: isMonthId(period) ? period : date.slice(0, 7),
    billingDate: date,
    price: roundMoney(price),
    ivaRate,
    appliesIva: ivaRate > 0,
    priceWithIva:
      storedWithIva ?? occurrencePriceWithIva(price, ivaRate),
  };
};

export const parseOccurrences = (value: unknown, serviceId: string) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry, index) =>
      normalizeOccurrence(
        entry,
        `${serviceId}-${String(index + 1).padStart(3, '0')}`,
      ),
    )
    .filter((entry): entry is FinanceServiceOccurrence => Boolean(entry))
    .sort((left, right) => left.billingDate.localeCompare(right.billingDate));
};
