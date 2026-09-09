export const REPORT_SETTINGS_MONTH_ID = 'SETTINGS';

export const BUSINESS_MODELS = ['commission', 'fixedRent'] as const;
export type BusinessModel = (typeof BUSINESS_MODELS)[number];

export const CONDITION_RULES = [
  'bear',
  'ownerPlus12',
  'owner',
  'bearFirst',
] as const;
export type ConditionRule = (typeof CONDITION_RULES)[number];

export type ReportCondition = {
  id: string;
  name: string;
  rule: ConditionRule;
  bearFirstAmount: number | null;
};

export type PropertyReportSettings = {
  businessModel: BusinessModel | '';
  commissionPercent: number | null;
  fixedRent: number | null;
  conditions: ReportCondition[];
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const isBusinessModel = (value: unknown): value is BusinessModel =>
  BUSINESS_MODELS.includes(String(value) as BusinessModel);

export const isConditionRule = (value: unknown): value is ConditionRule =>
  CONDITION_RULES.includes(String(value) as ConditionRule);

export const emptyReportSettings = (): PropertyReportSettings => ({
  businessModel: '',
  commissionPercent: null,
  fixedRent: null,
  conditions: [],
});

const newConditionId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `cond-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

export const parseCondition = (value: unknown): ReportCondition | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const rule = asString(row.rule);
  if (!isConditionRule(rule)) {
    return null;
  }
  const amount = asNumber(row.bearFirstAmount);
  return {
    id: asString(row.id) || newConditionId(),
    name: asString(row.name),
    rule,
    bearFirstAmount:
      rule === 'bearFirst' && amount !== null ? roundMoney(amount) : null,
  };
};

export const parseReportSettings = (
  stored?: Record<string, unknown> | null,
): PropertyReportSettings => {
  if (!stored || typeof stored !== 'object') {
    return emptyReportSettings();
  }
  const model = asString(stored.businessModel);
  const conditions = Array.isArray(stored.conditions)
    ? stored.conditions
        .map(parseCondition)
        .filter((row): row is ReportCondition => Boolean(row))
    : [];
  return {
    businessModel: isBusinessModel(model) ? model : '',
    commissionPercent: asNumber(stored.commissionPercent),
    fixedRent: asNumber(stored.fixedRent),
    conditions,
  };
};

export const validateReportSettings = (
  value: PropertyReportSettings,
): { ok: true; settings: PropertyReportSettings } | { ok: false; message: string } => {
  if (!isBusinessModel(value.businessModel)) {
    return { ok: false, message: 'businessModel is required.' };
  }

  let commissionPercent: number | null = null;
  let fixedRent: number | null = null;
  if (value.businessModel === 'commission') {
    const percent = value.commissionPercent;
    if (percent === null || !Number.isFinite(percent) || percent < 0 || percent > 100) {
      return {
        ok: false,
        message: 'commissionPercent must be between 0 and 100.',
      };
    }
    commissionPercent = roundMoney(percent);
  } else {
    const amount = value.fixedRent;
    if (amount === null || !Number.isFinite(amount) || amount < 0) {
      return { ok: false, message: 'fixedRent must be 0 or greater.' };
    }
    fixedRent = roundMoney(amount);
  }

  const conditions: ReportCondition[] = [];
  for (const row of value.conditions) {
    const name = row.name.trim();
    if (!name) {
      continue;
    }
    if (!isConditionRule(row.rule)) {
      return { ok: false, message: 'Each condition needs a valid rule.' };
    }
    let bearFirstAmount: number | null = null;
    if (row.rule === 'bearFirst') {
      if (
        row.bearFirstAmount === null ||
        !Number.isFinite(row.bearFirstAmount) ||
        row.bearFirstAmount < 0
      ) {
        return {
          ok: false,
          message: 'We bear the first requires an amount of 0 or greater.',
        };
      }
      bearFirstAmount = roundMoney(row.bearFirstAmount);
    }
    conditions.push({
      id: row.id.trim() || newConditionId(),
      name,
      rule: row.rule,
      bearFirstAmount,
    });
  }

  return {
    ok: true,
    settings: {
      businessModel: value.businessModel,
      commissionPercent,
      fixedRent,
      conditions,
    },
  };
};
