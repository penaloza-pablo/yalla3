import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { Hub } from 'aws-amplify/utils'
import {
  ADMIN_ROLE_ID,
  allPermissionKeys,
  pagePermission,
} from '../../amplify/functions/shared/rbac-catalog'
import { authFetch } from '../lib/auth-fetch'
import { getAmplifyEndpoint } from '../lib/amplify-endpoint'

type PermissionsResponse = {
  roleId?: string | null
  roleName?: string | null
  permissions?: string[]
  bootstrap?: boolean
}

type PermissionsContextValue = {
  ready: boolean
  roleId: string | null
  roleName: string | null
  bootstrap: boolean
  loadError: string | null
  can: (key: string) => boolean
  canPage: (page: string) => boolean
  refresh: () => Promise<void>
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null)

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [roleId, setRoleId] = useState<string | null>(null)
  const [roleName, setRoleName] = useState<string | null>(null)
  const [bootstrap, setBootstrap] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<Set<string>>(new Set())

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent)
    const endpoint = getAmplifyEndpoint(
      'getMyPermissionsUrl',
      import.meta.env.VITE_GET_MY_PERMISSIONS_URL,
    )
    if (!endpoint) {
      setRoleId('admin')
      setRoleName('admin')
      setBootstrap(true)
      setLoadError(null)
      setPermissions(new Set(allPermissionKeys()))
      setReady(true)
      return
    }

    if (!silent) {
      setReady(false)
    }

    let lastError: unknown
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const response = await authFetch(endpoint)
        if (!response.ok) {
          throw new Error(await response.text())
        }
        const payload = (await response.json()) as PermissionsResponse
        const nextRoleId = payload.roleId ?? null
        const isBootstrap = Boolean(payload.bootstrap)
        setRoleId(nextRoleId)
        setRoleName(payload.roleName ?? null)
        setBootstrap(isBootstrap)
        setPermissions(
          new Set(
            nextRoleId === ADMIN_ROLE_ID || isBootstrap
              ? allPermissionKeys()
              : (payload.permissions ?? []),
          ),
        )
        setLoadError(null)
        setReady(true)
        return
      } catch (error) {
        lastError = error
        await wait(300 * (attempt + 1))
      }
    }

    if (!silent) {
      setRoleId(null)
      setRoleName(null)
      setBootstrap(false)
      setPermissions(new Set())
      setLoadError(
        lastError instanceof Error
          ? lastError.message
          : 'Failed to load permissions.',
      )
    }
    setReady(true)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    return Hub.listen('auth', ({ payload }) => {
      if (
        payload.event === 'signedIn' ||
        payload.event === 'tokenRefresh' ||
        payload.event === 'tokenRefresh_failure'
      ) {
        void load({ silent: payload.event !== 'signedIn' })
      }
    })
  }, [load])

  const value = useMemo<PermissionsContextValue>(
    () => ({
      ready,
      roleId,
      roleName,
      bootstrap,
      loadError,
      can: (key: string) => permissions.has(key),
      canPage: (page: string) =>
        permissions.has(pagePermission(page)) ||
        (page === 'Property Reports' &&
          permissions.has(pagePermission('Finance solution 1'))) ||
        (page === 'Reports Settings' &&
          (permissions.has(pagePermission('Property Reports')) ||
            permissions.has(pagePermission('Finance solution 1')))) ||
        (page === 'Property Groups' &&
          (permissions.has(pagePermission('Property Reports')) ||
            permissions.has(pagePermission('Finance solution 1')))) ||
        (page === 'Movements' &&
          permissions.has(pagePermission('Finance solution 2'))) ||
        (page === 'Services & Subscriptions' &&
          permissions.has(pagePermission('Finance solution 3'))),
      refresh: () => load(),
    }),
    [bootstrap, load, loadError, permissions, ready, roleId, roleName],
  )

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  const context = useContext(PermissionsContext)
  if (!context) {
    throw new Error('usePermissions must be used within PermissionsProvider')
  }
  return context
}
