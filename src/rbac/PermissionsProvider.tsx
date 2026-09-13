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
  allPermissionKeys,
  pagePermission,
} from '../../amplify/functions/shared/rbac-catalog'
import { DEFAULT_DASHBOARD_LAYOUT_ID } from '../../amplify/functions/shared/dashboard-layout'
import {
  DEFAULT_NAV_MODE,
  parseNavMode,
  type NavMode,
} from '../../amplify/functions/shared/nav-mode'
import {
  DEFAULT_TODAY_VIEWS,
  isTodayViewMode,
  resolveTodayViews,
  type TodayViewMode,
} from '../../amplify/functions/shared/today-views'
import { resolveRoleLayoutId } from '../dashboard/layout-store'
import { authFetch } from '../lib/auth-fetch'
import { getAmplifyEndpoint } from '../lib/amplify-endpoint'

type PermissionsResponse = {
  roleId?: string | null
  roleName?: string | null
  permissions?: string[]
  bootstrap?: boolean
  dashboardLayoutId?: string | null
  navMode?: NavMode | null
  todayViews?: TodayViewMode[] | null
}

type PermissionsContextValue = {
  ready: boolean
  roleId: string | null
  roleName: string | null
  dashboardLayoutId: string
  navMode: NavMode
  todayViews: TodayViewMode[]
  bootstrap: boolean
  loadError: string | null
  can: (key: string) => boolean
  canPage: (page: string) => boolean
  canTodayView: (view: TodayViewMode) => boolean
  refresh: () => Promise<void>
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null)

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [roleId, setRoleId] = useState<string | null>(null)
  const [roleName, setRoleName] = useState<string | null>(null)
  const [dashboardLayoutId, setDashboardLayoutId] = useState(
    DEFAULT_DASHBOARD_LAYOUT_ID,
  )
  const [navMode, setNavMode] = useState<NavMode>(DEFAULT_NAV_MODE)
  const [todayViews, setTodayViews] = useState<TodayViewMode[]>(
    () => [...DEFAULT_TODAY_VIEWS],
  )
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
      setDashboardLayoutId(resolveRoleLayoutId('admin'))
      setNavMode(DEFAULT_NAV_MODE)
      setTodayViews([...DEFAULT_TODAY_VIEWS])
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
        setDashboardLayoutId(
          resolveRoleLayoutId(nextRoleId, payload.dashboardLayoutId),
        )
        setNavMode(parseNavMode(payload.navMode))
        setTodayViews(
          isBootstrap
            ? [...DEFAULT_TODAY_VIEWS]
            : resolveTodayViews(payload.todayViews),
        )
        setBootstrap(isBootstrap)
        setPermissions(
          new Set(
            isBootstrap
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
      setDashboardLayoutId(DEFAULT_DASHBOARD_LAYOUT_ID)
      setNavMode(DEFAULT_NAV_MODE)
      setTodayViews([...DEFAULT_TODAY_VIEWS])
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
      dashboardLayoutId,
      navMode,
      todayViews,
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
      canTodayView: (view: TodayViewMode) =>
        isTodayViewMode(view) && todayViews.includes(view),
      refresh: () => load(),
    }),
    [
      bootstrap,
      dashboardLayoutId,
      load,
      loadError,
      navMode,
      permissions,
      ready,
      roleId,
      roleName,
      todayViews,
    ],
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
