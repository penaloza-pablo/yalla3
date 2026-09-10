import { parseIvaRate, type IvaRate } from './iva';
import {
  DEFAULT_AIRBNB_FEE_PERCENT,
  DEFAULT_PAYOUT_VAT,
} from './property-report-payouts';
import {
  DEFAULT_PROPERTY_CONTRIBUTION_FORMULA,
  VISIBILITY_METRIC_IDS,
  validateFormula,
  type FormulaTarget,
} from './property-report-formula';

export const REPORT_SETTINGS_MONTH_ID = 'SETTINGS';
export const GLOBAL_REPORT_SETTINGS_PROPERTY_ID = '__reports_global__';

export const BUSINESS_MODELS = ['commission', 'fixedRent'] as const;
export type BusinessModel = (typeof BUSINESS_MODELS)[number];

export const REPORT_TABS = ['property', 'management', 'owner'] as const;
export type ReportTabId = (typeof REPORT_TABS)[number];

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

export type ReportTabVisibility = {
  visible: boolean;
  primary: string;
  metrics: string[];
};

export type ReportVisibility = Record<ReportTabId, ReportTabVisibility>;

export type PropertyReportSettings = {
  businessModel: BusinessModel | '';
  commissionPercent: number | null;
  fixedRent: number | null;
  formula: string;
  propertyContributionFormula: string;
  ourProfitFormula: string;
  netEarningsFormula: string;
  cleaningVat: IvaRate | null;
  accommodationVat: IvaRate | null;
  airbnbFeePercent: number | null;
  visibility: ReportVisibility | null;
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

const VISIBILITY_SET = new Set<string>(VISIBILITY_METRIC_IDS);

export const defaultReportVisibility = (): ReportVisibility => ({
  property: {
    visible: true,
    primary: 'propertyContribution',
    metrics: [
      'propertyContribution',
      'income',
      'cleaningMargin',
      'managementFee',
      'maintenance',
      'maintenanceCoverByOwner',
      'maintenanceCoverByUs',
      'markup',
      'iva',
      'expensesAndServices',
      'bookingCount',
    ],
  },
  management: {
    visible: true,
    primary: 'ourProfit',
    metrics: [
      'ourProfit',
      'managementFee',
      'markup',
      'income',
      'expensesAndServices',
      'iva',
    ],
  },
  owner: {
    visible: true,
    primary: 'netEarnings',
    metrics: [
      'netEarnings',
      'income',
      'maintenanceCoverByOwner',
      'iva',
      'bookingCount',
    ],
  },
});

const parseTabVisibility = (
  value: unknown,
  fallback: ReportTabVisibility,
): ReportTabVisibility => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }
  const row = value as Record<string, unknown>;
  const metrics = Array.isArray(row.metrics)
    ? row.metrics
        .map((item) => asString(item))
        .filter((item) => VISIBILITY_SET.has(item))
    : fallback.metrics;
  const unique = [...new Set(metrics.length ? metrics : fallback.metrics)];
  const primary = asString(row.primary);
  return {
    visible: row.visible !== false,
    primary: unique.includes(primary) ? primary : unique[0] ?? fallback.primary,
    metrics: unique,
  };
};

export const parseVisibility = (
  value: unknown,
): ReportVisibility | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const defaults = defaultReportVisibility();
  return {
    property: parseTabVisibility(row.property, defaults.property),
    management: parseTabVisibility(row.management, defaults.management),
    owner: parseTabVisibility(row.owner, defaults.owner),
  };
};

export const emptyReportSettings = (): PropertyReportSettings => ({
  businessModel: '',
  commissionPercent: null,
  fixedRent: null,
  formula: '',
  propertyContributionFormula: '',
  ourProfitFormula: '',
  netEarningsFormula: '',
  cleaningVat: null,
  accommodationVat: null,
  airbnbFeePercent: null,
  visibility: null,
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
    formula: asString(stored.managementFeeFormula) || asString(stored.formula),
    propertyContributionFormula:
      asString(stored.propertyContributionFormula) ||
      asString(stored.propertyNetProfitFormula),
    ourProfitFormula: asString(stored.ourProfitFormula),
    netEarningsFormula: asString(stored.netEarningsFormula),
    cleaningVat: parseIvaRate(
      stored.cleaningVat ?? stored.cleaningFeeVat,
    ),
    accommodationVat: parseIvaRate(stored.accommodationVat),
    airbnbFeePercent:
      asNumber(stored.airbnbFeePercent) ?? asNumber(stored.airbnbFee),
    visibility: parseVisibility(stored.visibility),
    conditions,
  };
};

const checkOptionalFormula = (
  source: string,
  model: BusinessModel | '',
  target: FormulaTarget,
) => {
  if (!source.trim()) {
    return { ok: true as const };
  }
  return validateFormula(source, model, target);
};

export const validateReportSettings = (
  value: PropertyReportSettings,
  options?: { global?: boolean },
): { ok: true; settings: PropertyReportSettings } | { ok: false; message: string } => {
  const global = Boolean(options?.global);
  if (!global && !isBusinessModel(value.businessModel)) {
    return { ok: false, message: 'businessModel is required.' };
  }

  let commissionPercent: number | null = null;
  let fixedRent: number | null = null;
  const model = isBusinessModel(value.businessModel) ? value.businessModel : '';
  if (!global && model === 'commission') {
    const percent = value.commissionPercent;
    if (percent === null || !Number.isFinite(percent) || percent < 0 || percent > 100) {
      return {
        ok: false,
        message: 'commissionPercent must be between 0 and 100.',
      };
    }
    commissionPercent = roundMoney(percent);
  } else if (!global && model === 'fixedRent') {
    const amount = value.fixedRent;
    if (amount === null || !Number.isFinite(amount) || amount < 0) {
      return { ok: false, message: 'fixedRent must be 0 or greater.' };
    }
    fixedRent = roundMoney(amount);
  } else {
    commissionPercent = asNumber(value.commissionPercent);
    fixedRent = asNumber(value.fixedRent);
  }

  const formula = asString(value.formula);
  if ((!global && model === 'commission') || formula) {
    const checked = validateFormula(formula, model || 'commission', 'managementFee');
    if (!checked.ok) {
      return checked;
    }
  }

  const propertyContributionFormula = asString(value.propertyContributionFormula);
  const ourProfitFormula = asString(value.ourProfitFormula);
  const netEarningsFormula = asString(value.netEarningsFormula);
  for (const [source, target] of [
    [propertyContributionFormula, 'propertyContribution'],
    [ourProfitFormula, 'ourProfit'],
    [netEarningsFormula, 'netEarnings'],
  ] as const) {
    const checked = checkOptionalFormula(source, model || 'commission', target);
    if (!checked.ok) {
      return checked;
    }
  }

  const visibility = value.visibility ? parseVisibility(value.visibility) : null;

  const cleaningVat =
    parseIvaRate(value.cleaningVat) ?? DEFAULT_PAYOUT_VAT;
  const accommodationVat =
    parseIvaRate(value.accommodationVat) ?? DEFAULT_PAYOUT_VAT;
  const airbnbRaw = asNumber(value.airbnbFeePercent);
  if (
    airbnbRaw !== null &&
    (!Number.isFinite(airbnbRaw) || airbnbRaw < 0 || airbnbRaw > 100)
  ) {
    return {
      ok: false,
      message: 'airbnbFeePercent must be between 0 and 100.',
    };
  }
  const airbnbFeePercent =
    airbnbRaw === null ? DEFAULT_AIRBNB_FEE_PERCENT : roundMoney(airbnbRaw);

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
      businessModel: global ? '' : value.businessModel,
      commissionPercent,
      fixedRent,
      formula,
      propertyContributionFormula,
      ourProfitFormula,
      netEarningsFormula,
      cleaningVat,
      accommodationVat,
      airbnbFeePercent,
      visibility: global ? visibility ?? defaultReportVisibility() : visibility,
      conditions: global ? [] : conditions,
    },
  };
};

export const mergeReportSettings = (
  property: PropertyReportSettings,
  global?: PropertyReportSettings | null,
): PropertyReportSettings => {
  const fallback = global ?? emptyReportSettings();
  return {
    ...property,
    formula: property.formula || fallback.formula,
    propertyContributionFormula:
      property.propertyContributionFormula ||
      fallback.propertyContributionFormula ||
      DEFAULT_PROPERTY_CONTRIBUTION_FORMULA,
    ourProfitFormula: property.ourProfitFormula || fallback.ourProfitFormula,
    netEarningsFormula: property.netEarningsFormula || fallback.netEarningsFormula,
    cleaningVat: property.cleaningVat ?? fallback.cleaningVat ?? DEFAULT_PAYOUT_VAT,
    accommodationVat:
      property.accommodationVat ??
      fallback.accommodationVat ??
      DEFAULT_PAYOUT_VAT,
    airbnbFeePercent:
      property.airbnbFeePercent ??
      fallback.airbnbFeePercent ??
      DEFAULT_AIRBNB_FEE_PERCENT,
    visibility: property.visibility ?? fallback.visibility ?? defaultReportVisibility(),
  };
};

export const isGlobalReportSettingsId = (propertyId: string) =>
  propertyId.trim() === GLOBAL_REPORT_SETTINGS_PROPERTY_ID;
