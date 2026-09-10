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

export const MANAGEMENT_FEE_EUR = 1000
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
    formula: '1000',
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
  {
    id: 'netProfit',
    unit: 'money',
    role: 'indicator',
    formula:
      '(income - payoutCleaningNet) - (cleaningNet + cleaningKit) - maintenanceNet - managementFee - markup - expensesAndServices',
  },
] as const

export type PropertyReportFieldId =
  (typeof PROPERTY_REPORT_FIELD_CATALOG)[number]['id']

export const PROPERTY_TAB_METRIC_KEYS = [
  'netProfit',
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

export type PropertyReportMetricValues = Record<PropertyTabMetricKey, number> & {
  paidByGuest: number
  otherIncomesNet: number
  payoutCleaningNet: number
  payoutCleaningGross: number
  cleaningNet: number
  cleaningKit: number
}

const sumAllocated = (
  lines: AllocatedReportLine[],
  match: (line: AllocatedReportLine) => boolean,
) =>
  roundMoney(
    lines.reduce((sum, line) => (match(line) ? sum + line.net : sum), 0),
  )

export const computePropertyReportMetrics = (
  inputs: PropertyReportMetricInputs,
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
  const managementFee = MANAGEMENT_FEE_EUR
  const netProfit = roundMoney(
    income -
      inputs.payoutCleaningNet -
      (inputs.cleaningNet + inputs.cleaningKit) -
      inputs.maintenanceNet -
      managementFee -
      markup -
      expensesAndServices,
  )

  return {
    paidByGuest: roundMoney(inputs.paidByGuest),
    otherIncomesNet: roundMoney(inputs.otherIncomesNet),
    payoutCleaningNet: roundMoney(inputs.payoutCleaningNet),
    payoutCleaningGross: roundMoney(inputs.payoutCleaningGross),
    cleaningNet: roundMoney(inputs.cleaningNet),
    cleaningKit: roundMoney(inputs.cleaningKit),
    netProfit,
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
