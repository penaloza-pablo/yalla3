import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../i18n/LanguageSwitcher'
import { BrandMark } from './Brand'

export function AuthHeader() {
  return (
    <div className="auth-brand">
      <BrandMark className="auth-logo" />
    </div>
  )
}

export function AuthFooter() {
  const { t } = useTranslation()
  return (
    <div className="auth-footer">
      <LanguageSwitcher embedded />
      <p className="auth-association">{t('auth.association')}</p>
    </div>
  )
}
