export type KitCategory =
  | 'buttons'
  | 'messages'
  | 'action-bars'
  | 'cards'
  | 'inputs'
  | 'tokens'
  | 'icons'

export type CustomKitElement = {
  id: string
  name: string
  category: KitCategory
  notes: string
  hasMobileVariant: boolean
  createdAt: string
}

const STORAGE_KEY = 'yalla.visualKit.custom.v1'

const CATEGORIES: KitCategory[] = [
  'buttons',
  'messages',
  'action-bars',
  'cards',
  'inputs',
  'tokens',
  'icons',
]

export const isKitCategory = (value: string): value is KitCategory =>
  CATEGORIES.includes(value as KitCategory)

export const readCustomKitElements = (): CustomKitElement[] => {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }
    const parsed = JSON.parse(raw) as CustomKitElement[]
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(
      (entry) =>
        typeof entry?.id === 'string' &&
        typeof entry?.name === 'string' &&
        isKitCategory(entry.category),
    )
  } catch {
    return []
  }
}

export const writeCustomKitElements = (entries: CustomKitElement[]) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

export const KIT_REF_PATTERN = /^yl\.[a-z0-9]+(?:\.[a-z0-9]+)*$/

export const upsertCustomKitElement = (entry: CustomKitElement) => {
  const current = readCustomKitElements()
  const next = current.some((item) => item.id === entry.id)
    ? current.map((item) => (item.id === entry.id ? entry : item))
    : [...current, entry]
  writeCustomKitElements(next)
  return next
}

export const removeCustomKitElement = (id: string) => {
  const next = readCustomKitElements().filter((item) => item.id !== id)
  writeCustomKitElements(next)
  return next
}

export const KIT_CATEGORIES: KitCategory[] = CATEGORIES
