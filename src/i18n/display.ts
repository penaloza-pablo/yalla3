import type { TFunction } from 'i18next'

export const isSpanishLocale = (language?: string | null) =>
  (language || 'en').toLowerCase().startsWith('es')

export const translatePage = (t: TFunction, page: string) =>
  t(`pages.${page}`, { defaultValue: page })

export const translateSection = (t: TFunction, section: string) =>
  t(`sections.${section}`, { defaultValue: section })

export const translateStatus = (t: TFunction, status: string) =>
  t(`status.${status}`, { defaultValue: status })

export const displayInventoryName = (
  language: string | undefined,
  name: string,
  nameEs?: string | null,
) => {
  if (isSpanishLocale(language) && nameEs?.trim()) {
    return nameEs.trim()
  }
  return name
}
