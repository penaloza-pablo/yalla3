import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePermissions } from '../rbac/PermissionsProvider'
import { DashboardGrid } from './DashboardGrid'
import {
  DASHBOARD_IDLE_MS,
  DASHBOARD_REFRESH_MS,
  refreshDashboardSnapshots,
} from './dashboard-refresh'
import { useDashboardLayout } from './layout-store'
import { wait } from './live-retry'
import './dashboard.css'

let panelHasBooted = false

type RefreshControls = {
  startRefresh: () => void
  armIdle: () => void
}

export function TodayDashboardView() {
  const { t } = useTranslation()
  const { ready, dashboardLayoutId } = usePermissions()
  const layout = useDashboardLayout(dashboardLayoutId)
  const [booted, setBooted] = useState(panelHasBooted)
  const [stillThere, setStillThere] = useState(false)
  const pausedRef = useRef(false)
  const controlsRef = useRef<RefreshControls | null>(null)

  const resumeLiveRefresh = useCallback(() => {
    pausedRef.current = false
    setStillThere(false)
    void refreshDashboardSnapshots({ force: true, silent: true })
    controlsRef.current?.startRefresh()
    controlsRef.current?.armIdle()
  }, [])

  useEffect(() => {
    if (!ready) {
      return
    }
    let cancelled = false
    let refreshTimer: number | undefined
    let idleTimer: number | undefined

    const clearRefresh = () => {
      if (refreshTimer !== undefined) {
        window.clearInterval(refreshTimer)
        refreshTimer = undefined
      }
    }

    const clearIdle = () => {
      if (idleTimer !== undefined) {
        window.clearTimeout(idleTimer)
        idleTimer = undefined
      }
    }

    const startRefresh = () => {
      clearRefresh()
      refreshTimer = window.setInterval(() => {
        if (pausedRef.current || document.visibilityState !== 'visible') {
          return
        }
        void refreshDashboardSnapshots({ force: true, silent: true })
      }, DASHBOARD_REFRESH_MS)
    }

    const armIdle = () => {
      if (pausedRef.current) {
        return
      }
      clearIdle()
      idleTimer = window.setTimeout(() => {
        if (cancelled) {
          return
        }
        if (document.visibilityState !== 'visible') {
          armIdle()
          return
        }
        pausedRef.current = true
        clearRefresh()
        setStillThere(true)
      }, DASHBOARD_IDLE_MS)
    }

    controlsRef.current = { startRefresh, armIdle }

    const onActivity = () => {
      if (pausedRef.current) {
        return
      }
      armIdle()
    }

    const onVisibility = () => {
      if (document.visibilityState !== 'visible' || pausedRef.current) {
        return
      }
      void refreshDashboardSnapshots({ force: true, silent: true })
      armIdle()
    }

    void (async () => {
      if (!panelHasBooted) {
        await wait(280)
      }
      try {
        await refreshDashboardSnapshots({
          force: true,
          silent: panelHasBooted,
        })
      } finally {
        if (!cancelled) {
          panelHasBooted = true
          setBooted(true)
          startRefresh()
          armIdle()
        }
      }
    })()

    document.addEventListener('pointerdown', onActivity)
    document.addEventListener('keydown', onActivity)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      pausedRef.current = false
      controlsRef.current = null
      clearRefresh()
      clearIdle()
      document.removeEventListener('pointerdown', onActivity)
      document.removeEventListener('keydown', onActivity)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [ready])

  return (
    <section className="yl-dashboard is-board" aria-label={t('today.dashboard')}>
      {!booted ? (
        <div className="yl-dashboard-boot" role="status" aria-live="polite">
          <span className="yl-dashboard-boot-mark" aria-hidden="true" />
          <p>{t('today.loading')}</p>
        </div>
      ) : (
        <DashboardGrid layout={layout} variant="board" />
      )}
      {stillThere ? (
        <div
          className="modal-overlay yl-confirm-overlay yl-dashboard-still-there"
          role="dialog"
          aria-modal="true"
          aria-label={t('dashboard.stillThere')}
        >
          <div className="modal yl-confirm">
            <div className="modal-body">
              <p className="yl-confirm-message">{t('dashboard.stillThere')}</p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-primary"
                onClick={resumeLiveRefresh}
              >
                {t('common.yes')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
