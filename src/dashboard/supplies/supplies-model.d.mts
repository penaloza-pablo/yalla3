import type { SuppliesData } from './SuppliesWidget'
export const SUPPLY_FIELDS: (keyof SuppliesData)[]
export function suppliesLocale(lang?: string): 'en' | 'es'
export function suppliesCopy(lang?: string): {
  title: string
  loading: string
  invalid: string
  ariaLabel: string
  allSet: string
  allClear: [string, string]
  stockClear: [string, string]
  noStockAlerts: string
  restockOne: string
  restockMany: string
  stockCaption: string
}
export function suppliesState(
  data: SuppliesData | null,
):
  | { kind: 'loading' }
  | { kind: 'clear' | 'active'; stockReady: boolean; data: SuppliesData }
export function countStockAlerts(
  items: { id: string; reorder: boolean; lowStock: boolean }[],
): number
export function countInventoryStockAlerts(
  items: Array<Record<string, unknown>>,
): number
export const SUPPLY_ICONS: Record<
  'box' | 'delivery' | 'clock' | 'invoice' | 'check',
  string
>
export const SUPPLY_ROWS: {
  key: keyof SuppliesData
  label: string
  detail: string
  icon: keyof typeof SUPPLY_ICONS
}[]
