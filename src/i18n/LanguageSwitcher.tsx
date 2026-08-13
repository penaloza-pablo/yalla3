import { useTranslation } from 'react-i18next'
import type { AppLocale } from './index'

type LanguageSwitcherProps = {
  compact?: boolean
}

export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation()
  const current = (i18n.resolvedLanguage || i18n.language || 'en').slice(
    0,
    2,
  ) as AppLocale

  const setLocale = (locale: AppLocale) => {
    void i18n.changeLanguage(locale)
  }

  if (compact) {
    return (
      <div className="language-switcher language-switcher-compact" role="group" aria-label={t('language.label')}>
        <button
          type="button"
          className={`language-option ${current === 'en' ? 'is-active' : ''}`}
          aria-pressed={current === 'en'}
          onClick={() => setLocale('en')}
        >
          EN
        </button>
        <button
          type="button"
          className={`language-option ${current === 'es' ? 'is-active' : ''}`}
          aria-pressed={current === 'es'}
          onClick={() => setLocale('es')}
        >
          ES
        </button>
      </div>
    )
  }

  return (
    <label className="language-switcher">
      <span className="language-switcher-label">{t('language.label')}</span>
      <select
        className="language-switcher-select"
        value={current === 'es' ? 'es' : 'en'}
        aria-label={t('language.label')}
        onChange={(event) => setLocale(event.target.value as AppLocale)}
      >
        <option value="en">{t('language.en')}</option>
        <option value="es">{t('language.es')}</option>
      </select>
    </label>
  )
}
