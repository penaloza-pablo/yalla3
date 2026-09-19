import type { TFunction } from 'i18next'

export const isSpanishLocale = (language?: string | null) =>
  (language || 'en').toLowerCase().startsWith('es')

export const translatePage = (t: TFunction, page: string) =>
  t(`pages.${page}`, { defaultValue: page })

export const translateSection = (t: TFunction, section: string) =>
  t(`sections.${section}`, { defaultValue: section })

export const translateStatus = (t: TFunction, status: string) =>
  t(`status.${status}`, { defaultValue: status })

export const translateVisitStatus = (t: TFunction, status: string) => {
  const normalized = status.trim().toUpperCase()
  if (!normalized) {
    return status
  }
  return t(`operations.visitStatuses.${normalized}`, { defaultValue: status })
}

export const displayLocalizedText = (
  language: string | undefined,
  english: string,
  localized?: string | null,
) => {
  if (isSpanishLocale(language) && localized?.trim()) {
    return localized.trim()
  }
  return english
}

export const displayInventoryName = (
  language: string | undefined,
  name: string,
  nameEs?: string | null,
) => displayLocalizedText(language, name, nameEs)

export const displayStorageLocation = (
  language: string | undefined,
  value: string,
) => {
  if (!value || !isSpanishLocale(language)) {
    return value
  }
  return value
    .replace(/\bJCL Storage\b/gi, 'JCL Almacén')
    .replace(/\bP2 Storage\b/gi, 'P2 Almacén')
}

const INVENTORY_CATEGORY_I18N: Record<string, string> = {
  keys: 'inventory.categoryLabels.keys',
  cleaning: 'inventory.categoryLabels.cleaning',
  'welcome kit': 'inventory.categoryLabels.welcomeKit',
  maintenance: 'inventory.categoryLabels.maintenance',
  linens: 'inventory.categoryLabels.linens',
  consumables: 'inventory.categoryLabels.consumables',
  amenities: 'inventory.categoryLabels.amenities',
  hardware: 'inventory.categoryLabels.hardware',
  tools: 'inventory.categoryLabels.tools',
  gifts: 'inventory.categoryLabels.gifts',
  gift: 'inventory.categoryLabels.gifts',
  'back up items': 'inventory.categoryLabels.backupItems',
  'backup items': 'inventory.categoryLabels.backupItems',
  other: 'inventory.categoryLabels.other',
}

export const displayInventoryCategory = (
  t: TFunction,
  category: string,
) => {
  const normalized = category.trim().toLowerCase().replace(/\s+/g, ' ')
  const key = INVENTORY_CATEGORY_I18N[normalized]
  if (!key) {
    return category
  }
  return t(key, { defaultValue: category })
}
