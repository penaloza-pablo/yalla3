import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authFetch } from '../lib/auth-fetch'
import { getAmplifyEndpoint } from '../lib/amplify-endpoint'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { usePermissions } from './PermissionsProvider'

type RoleOption = {
  id: string
  name: string
}

type CognitoUserRow = {
  email: string
  name: string
  status: string
  enabled: boolean
  roleId: string | null
  roleName: string | null
}

type UsersResponse = {
  items?: CognitoUserRow[]
  roles?: RoleOption[]
}

type UsersPanelProps = {
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  isMobileSearchOpen: boolean
  onToggleMobileSearch: () => void
}

export function UsersPanel({
  searchQuery,
  onSearchQueryChange,
  isMobileSearchOpen,
  onToggleMobileSearch,
}: UsersPanelProps) {
  const { t } = useTranslation()
  const { refresh } = usePermissions()
  const [rows, setRows] = useState<CognitoUserRow[]>([])
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingEmail, setSavingEmail] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    const endpoint = getAmplifyEndpoint(
      'getCognitoUsersUrl',
      import.meta.env.VITE_GET_COGNITO_USERS_URL,
    )
    if (!endpoint) {
      setError(t('rbac.missingUsersEndpoint'))
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const response = await authFetch(endpoint)
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const payload = (await response.json()) as UsersResponse
      setRows(payload.items ?? [])
      setRoles(payload.roles ?? [])
    } catch {
      setError(t('rbac.loadUsersError'))
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    void fetchUsers()
  }, [fetchUsers])

  const visibleRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return rows
    }
    return rows.filter((row) =>
      [row.email, row.name, row.roleName, row.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    )
  }, [rows, searchQuery])

  const assignRole = async (email: string, roleId: string) => {
    const endpoint = getAmplifyEndpoint(
      'upsertUserRoleUrl',
      import.meta.env.VITE_UPSERT_USER_ROLE_URL,
    )
    if (!endpoint) {
      setError(t('rbac.missingAssignEndpoint'))
      return
    }
    setSavingEmail(email)
    setError(null)
    try {
      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, roleId: roleId || null }),
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      await fetchUsers()
      await refresh()
    } catch {
      setError(t('rbac.assignError'))
    } finally {
      setSavingEmail(null)
    }
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('rbac.usersEyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Users')}</h1>
          </div>
          <p className="subtitle">{t('rbac.usersSubtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div
            className={`page-action-bar ${
              isMobileSearchOpen ? 'is-search-open' : ''
            }`}
          >
            <input
              className="search-input"
              placeholder={t('rbac.searchUsers')}
              type="search"
              aria-label={t('rbac.searchUsers')}
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
            />
            <div className="header-actions">
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
                onClick={() => void fetchUsers()}
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
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {error ? <div className="alert">{error}</div> : null}

      <section className="card">
        {isLoading ? <p>{t('rbac.loadingUsers')}</p> : null}
        {!isLoading && visibleRows.length === 0 ? (
          <p>{t('rbac.emptyUsers')}</p>
        ) : null}
        {visibleRows.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.email')}</th>
                  <th>{t('common.name')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('rbac.role')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.email}>
                    <td>{row.email}</td>
                    <td>{row.name || '—'}</td>
                    <td>
                      <span className="tag">
                        {row.enabled ? row.status || 'ENABLED' : 'DISABLED'}
                      </span>
                    </td>
                    <td>
                      <select
                        value={row.roleId ?? ''}
                        disabled={savingEmail === row.email}
                        onChange={(event) =>
                          void assignRole(row.email, event.target.value)
                        }
                        aria-label={t('rbac.role')}
                      >
                        <option value="">{t('rbac.noRole')}</option>
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>
                            {role.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </>
  )
}
