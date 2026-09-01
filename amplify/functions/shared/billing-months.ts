export const HIDDEN_BILLING_MONTH_IDS = ['2026-06'] as const

export const isHiddenBillingMonth = (monthId: string) =>
  (HIDDEN_BILLING_MONTH_IDS as readonly string[]).includes(monthId)
