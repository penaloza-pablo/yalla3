export const HIDDEN_BILLING_MONTH_IDS = new Set(['2026-06'])

export const isHiddenBillingMonth = (monthId: string) =>
  HIDDEN_BILLING_MONTH_IDS.has(monthId)
