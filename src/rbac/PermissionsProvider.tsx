import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { allPermissionKeys, pagePermission } from '../../amplify/functions/shared/rbac-catalog'
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
  can: (key: string) => boolean
  canPage: (page: string) => boolean
  refresh: () => Promise<void>
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null)

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [roleId, setRoleId] = useState<string | null>(null)
  const [roleName, setRoleName] = useState<string | null>(null)
  const [bootstrap, setBootstrap] = useState(false)
  const [permissions, setPermissions] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    const endpoint = getAmplifyEndpoint(
      'getMyPermissionsUrl',
      import.meta.env.VITE_GET_MY_PERMISSIONS_URL,
    )
    if (!endpoint) {
      setRoleId('admin')
      setRoleName('admin')
      setBootstrap(true)
      setPermissions(new Set(allPermissionKeys()))
      setReady(true)
      return
    }

    try {
      const response = await authFetch(endpoint)
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const payload = (await response.json()) as PermissionsResponse
      setRoleId(payload.roleId ?? null)
      setRoleName(payload.roleName ?? null)
      setBootstrap(Boolean(payload.bootstrap))
      setPermissions(new Set(payload.permissions ?? []))
    } catch {
      setRoleId(null)
      setRoleName(null)
      setBootstrap(false)
      setPermissions(new Set())
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const value = useMemo<PermissionsContextValue>(
    () => ({
      ready,
      roleId,
      roleName,
      bootstrap,
      can: (key: string) => permissions.has(key),
      canPage: (page: string) => permissions.has(pagePermission(page)),
      refresh: load,
    }),
    [bootstrap, load, permissions, ready, roleId, roleName],
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
