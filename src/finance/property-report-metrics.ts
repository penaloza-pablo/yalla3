import {
  DEFAULT_COMMISSION_FORMULA,
  DEFAULT_PROPERTY_CONTRIBUTION_FORMULA,
  evaluateFormula,
  type VisibilityMetricId,
} from '../../amplify/functions/shared/property-report-formula'
import type {
  BusinessModel,
  PropertyReportSettings,
} from '../../amplify/functions/shared/property-report-settings'

export type CostAllocation = 'bear' | 'ownerPlus12' | 'owner'

export type PropertyReportMetricUnit = 'money' | 'count'

export type PropertyReportFieldRole = 'source' | 'indicator'

export type AllocatedReportLine = {
  section: 'cleaning' | 'maintenance' | 'service' | 'expense' | 'income'
  net: number
  allocation: CostAllocation | ''
}

export type PropertyReportMetricInputs = {
  paidByGuest: number
  otherIncomesNet: number
  payoutCleaningNet: number
  payoutCleaningGross: number
  cleaningFee: number
  cleaningPayoutVat: number
  accommodationGross: number
  accommodationPayoutVat: number
  accommodationNet: number
  cleaningNet: number
  cleaningKit: number
  cleaningIva: number
  maintenanceNet: number
  maintenanceIva: number
  servicesNet: number
  servicesIva: number
  otherExpensesNet: number
  otherExpensesIva: number
  otherIncomesIva: number
  bookingCount: number
  allocatedLines: AllocatedReportLine[]
}

export const MARKUP_RATE = 0.12

const roundMoney = (value: number) => Math.round(value * 100) / 100

/**
 * Named fields that a future business-model formula designer can list
 * without depending on computed values. `formula` is the extractable
 * definition; values are produced separately by `computePropertyReportMetrics`.
 */
export const PROPERTY_REPORT_FIELD_CATALOG = [
  {
    id: 'paidByGuest',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'otherIncomesNet',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'payoutCleaningNet',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'payoutCleaningGross',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'cleaningFee',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'cleaningPayoutVat',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'accommodationGross',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'accommodationPayoutVat',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'accommodationNet',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'cleaningNet',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'cleaningKit',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'cleaningIva',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'maintenanceNet',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'maintenanceIva',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'servicesNet',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'servicesIva',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'otherExpensesNet',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'otherExpensesIva',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'otherIncomesIva',
    unit: 'money',
    role: 'source',
  },
  {
    id: 'bookingCount',
    unit: 'count',
    role: 'source',
  },
  {
    id: 'managementFee',
    unit: 'money',
    role: 'source',
    formula: 'settings.managementFeeFormula',
  },
  {
    id: 'propertyContribution',
    unit: 'money',
    role: 'indicator',
    formula: DEFAULT_PROPERTY_CONTRIBUTION_FORMULA,
  },
  {
    id: 'ourProfit',
    unit: 'money',
    role: 'indicator',
    formula: 'settings.ourProfitFormula',
  },
  {
    id: 'netEarnings',
    unit: 'money',
    role: 'indicator',
    formula: 'settings.netEarningsFormula',
  },
  {
    id: 'income',
    unit: 'money',
    role: 'indicator',
    formula: 'paidByGuest + otherIncomesNet',
  },
  {
    id: 'cleaningMargin',
    unit: 'money',
    role: 'indicator',
    formula: 'payoutCleaningGross - (cleaningNet + cleaningKit)',
  },
  {
    id: 'maintenance',
    unit: 'money',
    role: 'indicator',
    formula: 'maintenanceNet',
  },
  {
    id: 'maintenanceCoverByOwner',
    unit: 'money',
    role: 'indicator',
    formula:
      'sum(maintenance.net where allocation in [owner, ownerPlus12])',
  },
  {
    id: 'maintenanceCoverByUs',
    unit: 'money',
    role: 'indicator',
    formula: 'sum(maintenance.net where allocation = bear)',
  },
  {
    id: 'markup',
    unit: 'money',
    role: 'indicator',
    formula: '0.12 * sum(net where allocation = bear and section != income)',
  },
  {
    id: 'iva',
    unit: 'money',
    role: 'indicator',
    formula:
      'cleaningIva + maintenanceIva + servicesIva + otherExpensesIva - otherIncomesIva',
  },
  {
    id: 'expensesAndServices',
    unit: 'money',
    role: 'indicator',
    formula: 'servicesNet + otherExpensesNet',
  },
] as const

export type PropertyReportFieldId =
  (typeof PROPERTY_REPORT_FIELD_CATALOG)[number]['id']

export const PROPERTY_TAB_METRIC_KEYS = [
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
] as const

export type PropertyTabMetricKey = (typeof PROPERTY_TAB_METRIC_KEYS)[number]

export type ReportDisplayMetricKey =
  | PropertyTabMetricKey
  | 'ourProfit'
  | 'netEarnings'

export type PropertyReportMetricValues = Record<VisibilityMetricId, number> & {
  netProfit: number
}

const evaluateNamedFormula = (
  source: string,
  values: Record<string, number>,
) => {
  if (!source.trim()) {
    return 0
  }
  const result = evaluateFormula(source, values)
  return result.ok ? roundMoney(result.value) : 0
}

const sumAllocated = (
  lines: AllocatedReportLine[],
  match: (line: AllocatedReportLine) => boolean,
) =>
  roundMoney(
    lines.reduce((sum, line) => (match(line) ? sum + line.net : sum), 0),
  )

const resolveManagementFee = (
  values: Record<string, number>,
  settings?: PropertyReportSettings | null,
) => {
  const model = settings?.businessModel as BusinessModel | ''
  if (model === 'fixedRent') {
    return 0
  }
  if (model !== 'commission') {
    return 0
  }
  const formula = settings?.formula?.trim() || DEFAULT_COMMISSION_FORMULA
  return evaluateNamedFormula(formula, {
    ...values,
    commission: settings?.commissionPercent ?? 0,
    fixedRent: settings?.fixedRent ?? 0,
  })
}

export const computePropertyReportMetrics = (
  inputs: PropertyReportMetricInputs,
  settings?: PropertyReportSettings | null,
): PropertyReportMetricValues => {
  const income = roundMoney(inputs.paidByGuest + inputs.otherIncomesNet)
  const cleaningMargin = roundMoney(
    inputs.payoutCleaningGross - (inputs.cleaningNet + inputs.cleaningKit),
  )
  const maintenanceCoverByOwner = sumAllocated(
    inputs.allocatedLines,
    (line) =>
      line.section === 'maintenance' &&
      (line.allocation === 'owner' || line.allocation === 'ownerPlus12'),
  )
  const maintenanceCoverByUs = sumAllocated(
    inputs.allocatedLines,
    (line) => line.section === 'maintenance' && line.allocation === 'bear',
  )
  const markupBase = sumAllocated(
    inputs.allocatedLines,
    (line) => line.section !== 'income' && line.allocation === 'bear',
  )
  const markup = roundMoney(markupBase * MARKUP_RATE)
  const iva = roundMoney(
    inputs.cleaningIva +
      inputs.maintenanceIva +
      inputs.servicesIva +
      inputs.otherExpensesIva -
      inputs.otherIncomesIva,
  )
  const expensesAndServices = roundMoney(
    inputs.servicesNet + inputs.otherExpensesNet,
  )
  const formulaValues = {
    paidByGuest: roundMoney(inputs.paidByGuest),
    otherIncomesNet: roundMoney(inputs.otherIncomesNet),
    payoutCleaningNet: roundMoney(inputs.payoutCleaningNet),
    payoutCleaningGross: roundMoney(inputs.payoutCleaningGross),
    cleaningFee: roundMoney(inputs.cleaningFee),
    cleaningPayoutVat: roundMoney(inputs.cleaningPayoutVat),
    accommodationGross: roundMoney(inputs.accommodationGross),
    accommodationPayoutVat: roundMoney(inputs.accommodationPayoutVat),
    accommodationNet: roundMoney(inputs.accommodationNet),
    cleaningNet: roundMoney(inputs.cleaningNet),
    cleaningKit: roundMoney(inputs.cleaningKit),
    cleaningIva: roundMoney(inputs.cleaningIva),
    maintenanceNet: roundMoney(inputs.maintenanceNet),
    maintenanceIva: roundMoney(inputs.maintenanceIva),
    servicesNet: roundMoney(inputs.servicesNet),
    servicesIva: roundMoney(inputs.servicesIva),
    otherExpensesNet: roundMoney(inputs.otherExpensesNet),
    otherExpensesIva: roundMoney(inputs.otherExpensesIva),
    otherIncomesIva: roundMoney(inputs.otherIncomesIva),
    bookingCount: inputs.bookingCount,
    income,
    cleaningMargin,
    maintenance: roundMoney(inputs.maintenanceNet),
    maintenanceCoverByOwner,
    maintenanceCoverByUs,
    markup,
    iva,
    expensesAndServices,
  }
  const managementFee = resolveManagementFee(formulaValues, settings)
  const withFee = {
    ...formulaValues,
    managementFee,
    commission: settings?.commissionPercent ?? 0,
    fixedRent: settings?.fixedRent ?? 0,
  }
  const propertyContribution = evaluateNamedFormula(
    settings?.propertyContributionFormula?.trim() ||
      DEFAULT_PROPERTY_CONTRIBUTION_FORMULA,
    withFee,
  )
  const withContribution = { ...withFee, propertyContribution }
  const ourProfit = evaluateNamedFormula(
    settings?.ourProfitFormula ?? '',
    withContribution,
  )
  const netEarnings = evaluateNamedFormula(settings?.netEarningsFormula ?? '', {
    ...withContribution,
    ourProfit,
  })

  return {
    paidByGuest: roundMoney(inputs.paidByGuest),
    otherIncomesNet: roundMoney(inputs.otherIncomesNet),
    payoutCleaningNet: roundMoney(inputs.payoutCleaningNet),
    payoutCleaningGross: roundMoney(inputs.payoutCleaningGross),
    cleaningFee: roundMoney(inputs.cleaningFee),
    cleaningPayoutVat: roundMoney(inputs.cleaningPayoutVat),
    accommodationGross: roundMoney(inputs.accommodationGross),
    accommodationPayoutVat: roundMoney(inputs.accommodationPayoutVat),
    accommodationNet: roundMoney(inputs.accommodationNet),
    cleaningNet: roundMoney(inputs.cleaningNet),
    cleaningKit: roundMoney(inputs.cleaningKit),
    cleaningIva: roundMoney(inputs.cleaningIva),
    maintenanceNet: roundMoney(inputs.maintenanceNet),
    maintenanceIva: roundMoney(inputs.maintenanceIva),
    servicesNet: roundMoney(inputs.servicesNet),
    servicesIva: roundMoney(inputs.servicesIva),
    otherExpensesNet: roundMoney(inputs.otherExpensesNet),
    otherExpensesIva: roundMoney(inputs.otherExpensesIva),
    otherIncomesIva: roundMoney(inputs.otherIncomesIva),
    netProfit: propertyContribution,
    propertyContribution,
    ourProfit,
    netEarnings,
    income,
    cleaningMargin,
    managementFee,
    maintenance: roundMoney(inputs.maintenanceNet),
    maintenanceCoverByOwner,
    maintenanceCoverByUs,
    markup,
    iva,
    expensesAndServices,
    bookingCount: inputs.bookingCount,
  }
}

export const fieldCatalogWithoutValues = () =>
  PROPERTY_REPORT_FIELD_CATALOG.map(({ id, unit, role, ...rest }) => ({
    id,
    unit,
    role,
    ...('formula' in rest ? { formula: rest.formula } : {}),
  }))
