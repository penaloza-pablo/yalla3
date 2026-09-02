export const HIDDEN_BILLING_MONTH_IDS = new Set(['2026-06'])

export const isHiddenBillingMonth = (monthId: string) =>
  HIDDEN_BILLING_MONTH_IDS.has(monthId)

/** Drop months older than a hidden month that sits between them and the current month. */
export const isBeforeHiddenBillingGap = (
  monthId: string,
  currentMonthId: string,
) =>
  [...HIDDEN_BILLING_MONTH_IDS].some(
    (hidden) => monthId < hidden && hidden < currentMonthId,
  )
