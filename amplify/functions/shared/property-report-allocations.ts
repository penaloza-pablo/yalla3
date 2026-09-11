export const COST_ALLOCATIONS = ['bear', 'ownerPlus12', 'owner'] as const;
export const INCOME_ALLOCATIONS = [
  'directToOwner',
  'applyMarkup',
  'doNotSend',
] as const;
export const LINE_ALLOCATIONS = [
  ...COST_ALLOCATIONS,
  ...INCOME_ALLOCATIONS,
] as const;

export type CostAllocation = (typeof COST_ALLOCATIONS)[number];
export type IncomeAllocation = (typeof INCOME_ALLOCATIONS)[number];
export type LineAllocation = (typeof LINE_ALLOCATIONS)[number];

export const isCostAllocation = (value: unknown): value is CostAllocation =>
  COST_ALLOCATIONS.includes(String(value) as CostAllocation);

export const isIncomeAllocation = (value: unknown): value is IncomeAllocation =>
  INCOME_ALLOCATIONS.includes(String(value) as IncomeAllocation);

export const isLineAllocation = (value: unknown): value is LineAllocation =>
  LINE_ALLOCATIONS.includes(String(value) as LineAllocation);

export const toIncomeAllocation = (
  value: unknown,
): IncomeAllocation | '' => {
  if (isIncomeAllocation(value)) {
    return value;
  }
  if (value === 'owner') {
    return 'directToOwner';
  }
  if (value === 'ownerPlus12') {
    return 'applyMarkup';
  }
  if (value === 'bear') {
    return 'doNotSend';
  }
  return '';
};

export const parseLineAllocations = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, LineAllocation>;
  }
  const next: Record<string, LineAllocation> = {};
  for (const [key, allocation] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const id = key.trim();
    if (!id || !isLineAllocation(allocation)) {
      continue;
    }
    next[id] = allocation;
  }
  return next;
};
