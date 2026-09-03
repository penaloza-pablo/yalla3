import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { fetchUserAttributes } from 'aws-amplify/auth'
import { LanguageSwitcher } from './i18n/LanguageSwitcher'

type SettingsPanelProps = {
  compact?: boolean
  onOpen?: () => void
}

type UserProfile = {
  name: string
  email: string
  givenName: string
}

const resolveDisplayName = (
  attributes: Record<string, string | undefined>,
) => {
  const fullName = attributes.name?.trim()
  if (fullName) {
    return fullName
  }

  const givenAndFamily = [attributes.given_name, attributes.family_name]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(' ')
  if (givenAndFamily) {
    return givenAndFamily
  }

  return (
    attributes.preferred_username?.trim() || attributes.email?.trim() || ''
  )
}

const firstNameFrom = (name: string, email: string) => {
  const token = name.trim().split(/\s+/)[0]
  if (token) {
    return token
  }
  const local = email.split('@')[0]?.split(/[._-]/)[0]?.trim()
  if (!local) {
    return ''
  }
  return local.charAt(0).toUpperCase() + local.slice(1)
}

const initialsFrom = (name: string, email: string) => {
  const source = name || email
  if (!source) {
    return '?'
  }

  const parts = source.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  }

  return source.slice(0, 2).toUpperCase()
}

export function SettingsPanel({ compact = false, onOpen }: SettingsPanelProps) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoadingProfile, setIsLoadingProfile] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoadingProfile(true)

    void (async () => {
      try {
        const attributes = await fetchUserAttributes()
        if (cancelled) {
          return
        }
        setProfile({
          name: resolveDisplayName(attributes),
          email: attributes.email?.trim() || '',
          givenName: attributes.given_name?.trim() || '',
        })
      } catch {
        if (!cancelled) {
          setProfile({ name: '', email: '', givenName: '' })
        }
      } finally {
        if (!cancelled) {
          setIsLoadingProfile(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  const openSettings = () => {
    onOpen?.()
    setIsOpen(true)
  }

  const closeSettings = () => {
    setIsOpen(false)
  }

  const displayName = profile?.name || t('settings.unknownUser')
  const triggerName =
    firstNameFrom(
      profile?.givenName || profile?.name || '',
      profile?.email || '',
    ) || t('settings.title')
  const displayEmail = profile?.email || '—'
  const initials = initialsFrom(profile?.name || '', profile?.email || '')

  const settingsModal =
    isOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="modal-overlay settings-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-modal-title"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closeSettings()
              }
            }}
          >
            <div className="modal settings-modal">
              <div className="modal-header">
                <div>
                  <h3 className="modal-title" id="settings-modal-title">
                    {t('settings.title')}
                  </h3>
                  <p className="modal-subtitle">{t('settings.subtitle')}</p>
                </div>
                <button
                  className="btn-icon"
                  type="button"
                  onClick={closeSettings}
                  aria-label={t('common.close')}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body settings-modal-body">
                <section
                  className="settings-section"
                  aria-labelledby="settings-account-title"
                >
                  <h4
                    className="settings-section-title"
                    id="settings-account-title"
                  >
                    {t('settings.account')}
                  </h4>
                  <div className="settings-account">
                    <div className="settings-avatar" aria-hidden="true">
                      {isLoadingProfile ? '…' : initials}
                    </div>
                    <div className="settings-account-details">
                      <p className="settings-account-name">
                        {isLoadingProfile ? t('common.loading') : displayName}
                      </p>
                      <p className="settings-account-email">
                        <span className="settings-field-label">
                          {t('settings.email')}
                        </span>
                        {isLoadingProfile ? '…' : displayEmail}
                      </p>
                    </div>
                  </div>
                </section>

                <section
                  className="settings-section"
                  aria-labelledby="settings-language-title"
                >
                  <h4
                    className="settings-section-title"
                    id="settings-language-title"
                  >
                    {t('language.label')}
                  </h4>
                  <LanguageSwitcher embedded />
                </section>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null

  return (
    <>
      <div className={`settings-trigger ${compact ? 'is-compact' : ''}`}>
        <button
          type="button"
          className={`settings-trigger-button ${compact ? 'is-compact' : ''}`}
          aria-label={t('settings.open')}
          onClick={openSettings}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            width="18"
            height="18"
            className="settings-trigger-icon"
          >
            <path
              fill="currentColor"
              d="M10 9a3.25 3.25 0 1 0 0-6.5A3.25 3.25 0 0 0 10 9zm-7 8.25a7 7 0 0 1 14 0 .75.75 0 0 1-.75.75H3.75a.75.75 0 0 1-.75-.75z"
            />
          </svg>
          {!compact ? (
            <span className="settings-trigger-name">{triggerName}</span>
          ) : null}
        </button>
      </div>
      {settingsModal}
    </>
  )
}
