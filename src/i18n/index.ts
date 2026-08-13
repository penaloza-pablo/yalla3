import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import es from './locales/es.json'

export const LOCALE_STORAGE_KEY = 'yalla.locale'
export const SUPPORTED_LOCALES = ['en', 'es'] as const
export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

const isAppLocale = (value: string): value is AppLocale =>
  SUPPORTED_LOCALES.includes(value as AppLocale)

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
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch {
    // Ignore storage write errors.
  }
})

if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language
}

export default i18n
