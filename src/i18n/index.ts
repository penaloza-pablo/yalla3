import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { I18n } from 'aws-amplify/utils'
import { translations } from '@aws-amplify/ui'
import en from './locales/en.json'
import es from './locales/es.json'

export const LOCALE_STORAGE_KEY = 'yalla.locale'
export const SUPPORTED_LOCALES = ['en', 'es'] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]
export const RTL_LOCALES = new Set(['he', 'ar'])

I18n.putVocabularies(translations)

const isAppLocale = (value: string): value is AppLocale =>
  SUPPORTED_LOCALES.includes(value as AppLocale)

export const isRtlLocale = (value: string) =>
  RTL_LOCALES.has(value.slice(0, 2).toLowerCase())

const applyDocumentLocale = (locale: string) => {
  if (typeof document === 'undefined') {
    return
  }
  const language = isAppLocale(locale) ? locale : locale.slice(0, 2)
  document.documentElement.lang = language
  document.documentElement.dir = isRtlLocale(locale) ? 'rtl' : 'ltr'
  I18n.setLanguage(isAppLocale(locale) ? locale : 'en')
}

export const resolveInitialLocale = (): AppLocale => {
  if (typeof window === 'undefined') {
    return 'en'
  }

  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored && isAppLocale(stored)) {
      return stored
    }
  } catch {
    // Ignore storage access errors (private mode, blocked storage, etc.).
  }

  const browser = window.navigator.language?.slice(0, 2).toLowerCase()
  if (browser && isAppLocale(browser)) {
    return browser
  }

  return 'en'
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: resolveInitialLocale(),
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
})

i18n.on('languageChanged', (lng) => {
  const locale = isAppLocale(lng) ? lng : 'en'
  applyDocumentLocale(locale)
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Ignore storage write errors.
  }
})

applyDocumentLocale(i18n.language)

export default i18n
