import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ACTION_DEFINITIONS,
  ADMIN_ROLE_ID,
  CORE_PAGES,
  DASHBOARD_CARD_DEFINITIONS,
  NAVIGATION,
  pagePermission,
  withDefaultDashboardCardPermissions,
} from '../../amplify/functions/shared/rbac-catalog'
import { translatePage, translateSection } from '../i18n/display'
import { authFetch } from '../lib/auth-fetch'
import { getAmplifyEndpoint } from '../lib/amplify-endpoint'
import { MobileBodyPortal } from '../MobileBodyPortal'

type RoleRow = {
  id: string
  name: string
  permissions: string[]
}

type RolesPanelProps = {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  isMobileSearchOpen: boolean
  onToggleMobileSearch: () => void
}

const toggleValue = (list: string[], value: string) =>
  list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]

export function RolesPanel({
  searchQuery,
  onSearchQueryChange,
  isMobileSearchOpen,
  onToggleMobileSearch,
}: RolesPanelProps) {
  const { t } = useTranslation()
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [roleNameDrafts, setRoleNameDrafts] = useState<Record<string, string>>(
    {},
  )

  const fetchRoles = useCallback(async () => {
    const endpoint = getAmplifyEndpoint(
      'getRolesUrl',
      import.meta.env.VITE_GET_ROLES_URL,
    )
    if (!endpoint) {
      setError(t('rbac.missingRolesEndpoint'))
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const response = await authFetch(endpoint)
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const payload = (await response.json()) as { items?: RoleRow[] }
      const items = payload.items ?? []
      setRoles(items)
      setRoleNameDrafts(
        Object.fromEntries(items.map((item) => [item.id, item.name])),
      )
    } catch {
      setError(t('rbac.loadRolesError'))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void fetchRoles()
  }, [fetchRoles])

  const selected = roles.find((role) => role.id === selectedId) ?? null
  const isAdmin = selected?.id === ADMIN_ROLE_ID
  const query = searchQuery.trim().toLowerCase()
  const visibleRoles = query
    ? roles.filter((role) =>
        (roleNameDrafts[role.id] ?? role.name).toLowerCase().includes(query),
      )
    : roles

  const persistRole = async (role: RoleRow, name: string, permissions: string[]) => {
    const nextName = name.trim()
    if (!nextName) {
      setError(t('rbac.nameRequired'))
      setRoleNameDrafts((current) => ({ ...current, [role.id]: role.name }))
      if (selectedId === role.id) {
        setNameDraft(role.name)
      }
      return
    }
    const endpoint = getAmplifyEndpoint(
      'upsertRoleUrl',
      import.meta.env.VITE_UPSERT_ROLE_URL,
    )
    if (!endpoint) {
      setError(t('rbac.missingSaveRoleEndpoint'))
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: role.id,
          name: nextName,
          permissions,
        }),
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      await fetchRoles()
      if (selectedId === role.id) {
        setNameDraft(nextName)
      }
    } catch {
      setError(t('rbac.saveRoleError'))
    } finally {
      setIsSaving(false)
    }
  }

  const openRole = (role: RoleRow) => {
    setSelectedId(role.id)
    setDraft(withDefaultDashboardCardPermissions([...role.permissions]))
    setNameDraft(roleNameDrafts[role.id] ?? role.name)
    setError(null)
  }

  const saveRoleName = (role: RoleRow, name: string) => {
    if (name.trim() === role.name.trim()) {
      return
    }
    void persistRole(role, name, role.permissions)
  }

  const saveRole = async () => {
    if (!selected) {
      return
    }
    await persistRole(selected, nameDraft, draft)
  }

  const renderPageRows = (sectionLabel: string, items: readonly string[]) =>
    items.map((page) => {
      const key = pagePermission(page)
      const checked = isAdmin || draft.includes(key)
      return (
        <tr key={key}>
          <td>{sectionLabel}</td>
          <td>{translatePage(t, page)}</td>
          <td>
            <label className="filter-option">
              <input
                type="checkbox"
                checked={checked}
                disabled={isAdmin}
                onChange={() =>
                  setDraft((current) => toggleValue(current, key))
                }
              />
              <span>{t('rbac.visible')}</span>
            </label>
          </td>
        </tr>
      )
    })

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">
            {selected
              ? t('rbac.roleEyebrow', { name: nameDraft || selected.name })
              : t('rbac.rolesEyebrow')}
          </p>
          <div className="page-title-row">
            <h1 className="page-title">
              {selected ? nameDraft || selected.name : t('pages.Roles')}
            </h1>
          </div>
          <p className="subtitle">
            {selected ? t('rbac.roleSubtitle') : t('rbac.rolesSubtitle')}
          </p>
        </div>
        <MobileBodyPortal>
          <div
            className={`page-action-bar ${
              isMobileSearchOpen ? 'is-search-open' : ''
            }`}
          >
            {!selected ? (
              <input
                className="search-input"
                placeholder={t('rbac.searchRoles')}
                type="search"
                aria-label={t('rbac.searchRoles')}
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
              />
            ) : null}
            <div className="header-actions">
              {selected ? (
                <>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => {
                      setSelectedId(null)
                      onSearchQueryChange('')
                    }}
                  >
                    {t('common.back')}
                  </button>
                  <button
                    className="btn-primary"
                    type="button"
                    disabled={isSaving || !nameDraft.trim()}
                    onClick={() => void saveRole()}
                  >
                    {t('common.save')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className={`btn-ghost btn-search-toggle ${
                      isMobileSearchOpen ? 'is-active' : ''
                    }`}
                    type="button"
                    aria-label={
                      isMobileSearchOpen
                        ? t('common.hideSearch')
                        : t('common.showSearch')
                    }
                    aria-expanded={isMobileSearchOpen}
                    onClick={onToggleMobileSearch}
                  >
                    {isMobileSearchOpen ? (
                      <span aria-hidden="true">✕</span>
                    ) : (
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        width="16"
                        height="16"
                      >
                        <path
                          d="M8.5 3a5.5 5.5 0 0 1 4.38 8.82l3.65 3.65-1.41 1.41-3.65-3.65A5.5 5.5 0 1 1 8.5 3zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"
                          fill="currentColor"
                        />
                      </svg>
                    )}
                  </button>
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={() => void fetchRoles()}
                    disabled={isLoading}
                    aria-label={t('common.refresh')}
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      width="16"
                      height="16"
                    >
                      <path
                        d="M16 4v5h-5l1.8-1.8a4.5 4.5 0 1 0 1.3 4.3h1.9a6.5 6.5 0 1 1-1.9-4.6L16 4z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {error ? <div className="alert">{error}</div> : null}

      {!selected ? (
        <section className="card">
          {isLoading ? <p>{t('rbac.loadingRoles')}</p> : null}
          {!isLoading && visibleRoles.length === 0 ? (
            <p>{t('rbac.emptyRoles')}</p>
          ) : null}
          {visibleRoles.length > 0 ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('rbac.permissionsCount')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRoles.map((role) => (
                    <tr key={role.id}>
                      <td>
                        <input
                          className="table-text-input"
                          value={roleNameDrafts[role.id] ?? role.name}
                          disabled={isSaving}
                          aria-label={t('common.name')}
                          onChange={(event) => {
                            const value = event.target.value
                            setRoleNameDrafts((current) => ({
                              ...current,
                              [role.id]: value,
                            }))
                          }}
                          onBlur={(event) =>
                            saveRoleName(role, event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.currentTarget.blur()
                            }
                          }}
                        />
                      </td>
                      <td>{role.permissions.length}</td>
                      <td>
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() => openRole(role)}
                        >
                          {t('rbac.configure')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : (
        <section className="card">
          <label className="form-field" style={{ marginBottom: 16, maxWidth: '22rem' }}>
            {t('common.name')}
            <input
              value={nameDraft}
              disabled={isSaving}
              aria-label={t('common.name')}
              onChange={(event) => setNameDraft(event.target.value)}
            />
          </label>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('rbac.section')}</th>
                  <th>{t('rbac.feature')}</th>
                  <th>{t('rbac.visible')}</th>
                </tr>
              </thead>
              <tbody>
                {renderPageRows(t('rbac.coreSection'), CORE_PAGES)}
                {NAVIGATION.map((group) =>
                  renderPageRows(translateSection(t, group.section), group.items),
                )}
              </tbody>
            </table>
          </div>
          <h2 className="card-title" style={{ marginTop: 24 }}>
            {t('rbac.dashboardCards')}
          </h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('rbac.feature')}</th>
                  <th>{t('rbac.visible')}</th>
                </tr>
              </thead>
              <tbody>
                {DASHBOARD_CARD_DEFINITIONS.map((card) => {
                  const checked = isAdmin || draft.includes(card.key)
                  return (
                    <tr key={card.key}>
                      <td>{t(card.i18nKey)}</td>
                      <td>
                        <label className="filter-option">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isAdmin}
                            onChange={() =>
                              setDraft((current) =>
                                toggleValue(current, card.key),
                              )
                            }
                          />
                          <span>{t('rbac.visible')}</span>
                        </label>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <h2 className="card-title" style={{ marginTop: 24 }}>
            {t('rbac.specificActions')}
          </h2>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('rbac.feature')}</th>
                  <th>{t('rbac.visible')}</th>
                </tr>
              </thead>
              <tbody>
                {ACTION_DEFINITIONS.map((action) => {
                  const checked = isAdmin || draft.includes(action.key)
                  return (
                    <tr key={action.key}>
                      <td>{t(action.i18nKey)}</td>
                      <td>
                        <label className="filter-option">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isAdmin}
                            onChange={() =>
                              setDraft((current) =>
                                toggleValue(current, action.key),
                              )
                            }
                          />
                          <span>{t('rbac.visible')}</span>
                        </label>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
