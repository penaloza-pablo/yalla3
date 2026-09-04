import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { authFetch } from './lib/auth-fetch'
import { MobileBodyPortal } from './MobileBodyPortal'

type SlackNotificationRow = {
  id: string
  enabled: boolean
  updatedAt?: string
}

type SlackPanelProps = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
}

export function SlackPanel({ getEndpoint }: SlackPanelProps) {
  const { t } = useTranslation()
  const [items, setItems] = useState<SlackNotificationRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const fetchItems = useCallback(async () => {
    const endpoint = getEndpoint(
      'getSlackNotificationsUrl',
      import.meta.env.VITE_GET_SLACK_NOTIFICATIONS_URL,
    )
    if (!endpoint) {
      setError(t('slackSettings.missingEndpoint'))
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const response = await authFetch(endpoint)
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const payload = (await response.json()) as { items?: SlackNotificationRow[] }
      setItems(payload.items ?? [])
    } catch {
      setError(t('slackSettings.loadError'))
    } finally {
      setIsLoading(false)
    }
  }, [getEndpoint, t])

  useEffect(() => {
    void fetchItems()
  }, [fetchItems])

  const toggleEnabled = async (row: SlackNotificationRow) => {
    const endpoint = getEndpoint(
      'upsertSlackNotificationUrl',
      import.meta.env.VITE_UPSERT_SLACK_NOTIFICATION_URL,
    )
    if (!endpoint) {
      setError(t('slackSettings.missingWrite'))
      return
    }
    setSavingId(row.id)
    setError(null)
    setMessage(null)
    try {
      const response = await authFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: row.id, enabled: !row.enabled }),
      })
      if (!response.ok) {
        throw new Error(await response.text())
      }
      const payload = (await response.json()) as { item?: SlackNotificationRow }
      const saved = payload.item
      setItems((current) =>
        current.map((item) =>
          item.id === row.id
            ? {
                ...item,
                enabled: saved?.enabled ?? !row.enabled,
                updatedAt: saved?.updatedAt ?? item.updatedAt,
              }
            : item,
        ),
      )
      setMessage(
        row.enabled
          ? t('slackSettings.disabled')
          : t('slackSettings.enabled'),
      )
    } catch {
      setError(t('slackSettings.saveError'))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('slackSettings.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Slack')}</h1>
          </div>
          <p className="subtitle">{t('slackSettings.subtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <div className="header-actions">
              <button
                className="btn-primary"
                type="button"
                onClick={() => void fetchItems()}
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

      {message ? <p className="notice success">{message}</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('slackSettings.cardTitle')}</h2>
            <p className="card-subtitle">{t('slackSettings.cardSubtitle')}</p>
          </div>
        </div>
        {isLoading ? <p>{t('slackSettings.loading')}</p> : null}
        {!isLoading && items.length === 0 ? (
          <p>{t('slackSettings.empty')}</p>
        ) : null}
        {items.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('slackSettings.automation')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>
                        {t(`slackSettings.items.${row.id}.name`, {
                          defaultValue: row.id,
                        })}
                      </strong>
                      <p className="card-subtitle">
                        {t(`slackSettings.items.${row.id}.description`, {
                          defaultValue: '',
                        })}
                      </p>
                    </td>
                    <td>
                      <span className="tag">
                        {row.enabled
                          ? t('slackSettings.active')
                          : t('slackSettings.inactive')}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn-secondary"
                        type="button"
                        disabled={savingId === row.id}
                        onClick={() => void toggleEnabled(row)}
                      >
                        {row.enabled
                          ? t('slackSettings.disable')
                          : t('slackSettings.enable')}
                      </button>
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
