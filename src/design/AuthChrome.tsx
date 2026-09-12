import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from '../i18n/LanguageSwitcher'

export function AuthHeader() {
  return (
    <div className="auth-brand">
      <img src="/brand/yalla-mark.svg" alt="" width={56} height={56} />
      <p className="auth-wordmark">Yalla!</p>
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
