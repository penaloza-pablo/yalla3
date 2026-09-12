import { useTranslation } from 'react-i18next'
import { translatePage } from '../i18n/display'
import { fieldMobileTabs } from './workspace'

type FieldBottomNavProps = {
  roleId: string | null
  activePage: string
  canPage: (page: string) => boolean
  onNavigate: (page: string) => void
  onMore: () => void
  moreOpen: boolean
}

const TabIcon = ({ name }: { name: string }) => {
  if (name === 'more') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" width="22" height="22">
        <path
          d="M4 10.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"
          fill="currentColor"
        />
      </svg>
    )
  }
  if (name === 'Daily Operations') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" width="22" height="22">
        <path
          d="M6 3h2v2h4V3h2v2h1.5A1.5 1.5 0 0 1 17 6.5v10A1.5 1.5 0 0 1 15.5 18h-11A1.5 1.5 0 0 1 3 16.5v-10A1.5 1.5 0 0 1 4.5 5H6V3zm9 6H5v7h10V9z"
          fill="currentColor"
        />
      </svg>
    )
  }
  if (name === 'Inventory') {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" width="22" height="22">
        <path
          d="M3 6.5 10 3l7 3.5v7L10 17 3 13.5v-7zM10 5.2 5 7.6v4.8l5 2.4 5-2.4V7.6l-5-2.4z"
          fill="currentColor"
        />
      </svg>
    )
  }
  if (name.includes('Incidents')) {
    return (
      <svg aria-hidden="true" viewBox="0 0 20 20" width="22" height="22">
        <path
          d="M10 2 18 16H2L10 2zm0 5.2-.9 5h1.8L10 7.2zM10 14a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"
          fill="currentColor"
        />
      </svg>
    )
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="22" height="22">
      <path
        d="M4 5h12v2H4V5zm0 4h12v2H4V9zm0 4h8v2H4v-2z"
        fill="currentColor"
      />
    </svg>
  )
}

export function FieldBottomNav({
  roleId,
  activePage,
  canPage,
  onNavigate,
  onMore,
  moreOpen,
}: FieldBottomNavProps) {
  const { t } = useTranslation()
  const tabs = fieldMobileTabs(roleId).filter((page) => canPage(page))

  return (
    <nav className="field-tabbar" aria-label={t('common.fieldNav')}>
      {tabs.map((page) => {
        const isActive = activePage === page && !moreOpen
        return (
          <button
            key={page}
            type="button"
            className={`field-tab ${isActive ? 'is-active' : ''}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onNavigate(page)}
          >
            <TabIcon name={page} />
            <span>
              {t(`navPages.${page}`, {
                defaultValue: translatePage(t, page),
              })}
            </span>
          </button>
        )
      })}
      <button
        type="button"
        className={`field-tab ${moreOpen ? 'is-active' : ''}`}
        aria-expanded={moreOpen}
        onClick={onMore}
      >
        <TabIcon name="more" />
        <span>{t('common.moreNav')}</span>
      </button>
    </nav>
  )
}
