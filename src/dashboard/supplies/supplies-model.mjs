export const SUPPLY_FIELDS = [
  'stockAlerts',
  'waitingDelivery',
  'overdue',
  'waitingInvoice',
]

const EN = {
  title: 'Inventory and purchases',
  loading: 'Loading indicators…',
  invalid: 'Unable to read the indicators.',
  ariaLabel: 'Inventory and purchases',
  allSet: 'All set ✓',
  allClear: ['All', 'set.'],
  stockClear: ['Stock', 'set.'],
  noStockAlerts: 'No inventory alerts',
  restockOne: 'item to restock',
  restockMany: 'items to restock',
  stockCaption: 'Reorder + Low stock',
}

const ES = {
  title: 'Inventario y compras',
  loading: 'Cargando indicadores…',
  invalid: 'No se pudieron leer los indicadores.',
  ariaLabel: 'Inventario y compras',
  allSet: 'Al día ✓',
  allClear: ['Todo', 'al día.'],
  stockClear: ['Stock', 'al día.'],
  noStockAlerts: 'Sin alertas de inventario',
  restockOne: 'artículo por reponer',
  restockMany: 'artículos por reponer',
  stockCaption: 'Reorder + Low stock',
}

export function suppliesLocale(lang) {
  return String(lang || 'en').toLowerCase().startsWith('es') ? 'es' : 'en'
}

export function suppliesCopy(lang) {
  return suppliesLocale(lang) === 'es' ? ES : EN
}

export function suppliesState(data) {
  if (data === null) {
    return { kind: 'loading' }
  }
  if (
    !data ||
    SUPPLY_FIELDS.some(
      (key) => !Number.isSafeInteger(data[key]) || data[key] < 0,
    )
  ) {
    throw new TypeError('Se requieren cuatro recuentos enteros no negativos.')
  }
  return {
    kind: SUPPLY_FIELDS.every((key) => data[key] === 0) ? 'clear' : 'active',
    stockReady: data.stockAlerts === 0,
    data,
  }
}

/** One stock item counts once, even if both flags are set. */
export function countStockAlerts(items) {
  const ids = new Set()
  let count = 0
  for (const item of items) {
    if (
      !item.id ||
      ids.has(item.id) ||
      typeof item.reorder !== 'boolean' ||
      typeof item.lowStock !== 'boolean'
    ) {
      throw new TypeError('Inventario incompleto o IDs repetidos.')
    }
    ids.add(item.id)
    if (item.reorder || item.lowStock) {
      count += 1
    }
  }
  return count
}

export function countInventoryStockAlerts(items) {
  const ids = new Set()
  let count = 0
  for (const item of items ?? []) {
    const id = String(item?.id ?? item?.ItemID ?? item?.itemId ?? item?.ID ?? '').trim()
    if (!id || ids.has(id)) {
      continue
    }
    ids.add(id)
    const status = String(item?.Status ?? item?.status ?? '').trim()
    if (status === 'Reorder' || status === 'Low Stock') {
      count += 1
    }
  }
  return count
}

export const SUPPLY_ROWS = [
  {
    key: 'stockAlerts',
    label: 'Inventario',
    detail: 'Reorder + Low stock',
    icon: 'box',
  },
  {
    key: 'waitingDelivery',
    label: 'Por recibir',
    detail: 'Waiting delivery',
    icon: 'delivery',
  },
  {
    key: 'overdue',
    label: 'Atrasados',
    detail: 'Overdue',
    icon: 'clock',
  },
  {
    key: 'waitingInvoice',
    label: 'Sin factura',
    detail: 'Invoice off',
    icon: 'invoice',
  },
]

export const SUPPLY_ICONS = {
  box: 'M3 7 12 3l9 4v10l-9 4-9-4ZM3 7l9 4 9-4M12 11v10M8 5l9 4',
  delivery: 'M3 5h11v12H3ZM14 9h4l3 4v4h-7M6 17a2 2 0 1 0 .01 0M17 17a2 2 0 1 0 .01 0',
  clock: 'M12 3a9 9 0 1 0 .01 0M12 7v6l4 2',
  invoice: 'M5 3h14v18l-3-2-4 2-4-2-3 2ZM8 8h8M8 12h8M8 16h4',
  check: 'm5 12 4 4L19 6',
}
