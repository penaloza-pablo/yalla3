import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { YALLA_SERVICES } from '../../amplify/functions/shared/yalla-services'
import { YlIcon } from '../design/icons'
import { fetchJson } from '../operations/api'

type ServiceStatus = 'ok' | 'error' | 'unknown' | 'proposed'

type ServiceRun = {
  at: string
  slot: string
  status: 'ok' | 'error'
  error?: string
}

type ServiceHealth = {
  serviceId: string
  status: ServiceStatus
  checkedAt?: string
  lastOkAt?: string
  error?: string
  detail?: string
  slot?: string
  consecutiveFailures: number
  lastRuns?: ServiceRun[]
}

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
}

const formatStamp = (value: string | undefined, locale: string) => {
  if (!value) {
    return '—'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString(locale.startsWith('es') ? 'es-ES' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function YallaServicesView({ getEndpoint }: Props) {
  const { t, i18n } = useTranslation()
  const [items, setItems] = useState<ServiceHealth[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDiagnosing, setIsDiagnosing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const getUrl = getEndpoint(
    'getYallaServicesUrl',
    import.meta.env.VITE_GET_YALLA_SERVICES_URL,
  )
  const diagnoseUrl = getEndpoint(
    'diagnoseYallaServicesUrl',
    import.meta.env.VITE_DIAGNOSE_YALLA_SERVICES_URL,
  )

  const load = useCallback(async () => {
    if (!getUrl) {
      setError(t('yallaServices.missingEndpoint'))
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const payload = await fetchJson<{ items?: ServiceHealth[] }>(getUrl)
      setItems(payload.items ?? [])
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t('yallaServices.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [getUrl, t])

  useEffect(() => {
    void load()
  }, [load])

  const runDiagnose = async () => {
    if (!diagnoseUrl) {
      setError(t('yallaServices.missingDiagnose'))
      return
    }
    setIsDiagnosing(true)
    setError(null)
    setMessage(null)
    try {
      await fetchJson(diagnoseUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      await load()
      setMessage(t('yallaServices.diagnosed'))
    } catch (diagnoseError) {
      setError(
        diagnoseError instanceof Error
          ? diagnoseError.message
          : t('yallaServices.diagnoseError'),
      )
    } finally {
      setIsDiagnosing(false)
    }
  }

  const catalog = useMemo(() => {
    const stored = new Map(items.map((item) => [item.serviceId, item]))
    return YALLA_SERVICES.map((service) => {
      const fromApi = stored.get(service.id)
      if (fromApi) {
        return fromApi
      }
      return {
        serviceId: service.id,
        status: (service.mode === 'proposed' ? 'proposed' : 'unknown') as ServiceStatus,
        consecutiveFailures: 0,
      }
    })
  }, [items])
  const monitored = useMemo(
    () => catalog.filter((item) => item.status !== 'proposed'),
    [catalog],
  )
  const proposed = useMemo(
    () => catalog.filter((item) => item.status === 'proposed'),
    [catalog],
  )
  const okCount = monitored.filter((item) => item.status === 'ok').length
  const errorCount = monitored.filter((item) => item.status === 'error').length

  const statusLabel = (status: ServiceStatus) => {
    if (status === 'ok') return t('yallaServices.statusOk')
    if (status === 'error') return t('yallaServices.statusError')
    if (status === 'proposed') return t('yallaServices.statusProposed')
    return t('yallaServices.statusUnknown')
  }

  const serviceName = (id: string) =>
    t(`yallaServices.items.${id}.name`, { defaultValue: id })
  const serviceValidation = (id: string) =>
    t(`yallaServices.items.${id}.validation`, { defaultValue: '' })

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('yallaServices.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Yalla Services')}</h1>
          </div>
          <p className="subtitle">{t('yallaServices.subtitle')}</p>
        </div>
        <div className="header-actions">
          <button
            className="btn-ghost"
            type="button"
            onClick={() => void load()}
            disabled={isLoading || isDiagnosing}
            aria-label={t('common.refresh')}
          >
            <YlIcon name="arrow.clockwise" size={16} />
          </button>
          <button
            className="btn-primary"
            type="button"
            onClick={() => void runDiagnose()}
            disabled={isLoading || isDiagnosing}
          >
            {isDiagnosing
              ? t('yallaServices.diagnosing')
              : t('yallaServices.diagnoseNow')}
          </button>
        </div>
      </header>

      {message ? <p className="notice success">{message}</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      <section className="summary-cards cleaning-settings-cards">
        <div className="card card-compact">
          <p className="card-label">{t('yallaServices.okCard')}</p>
          <p className="card-value">{isLoading ? '—' : okCount}</p>
          <p className="card-meta">{t('yallaServices.okCardMeta')}</p>
        </div>
        <div className="card card-compact">
          <p className="card-label">{t('yallaServices.errorCard')}</p>
          <p className="card-value">{isLoading ? '—' : errorCount}</p>
          <p className="card-meta">{t('yallaServices.errorCardMeta')}</p>
        </div>
        <div className="card card-compact">
          <p className="card-label">{t('yallaServices.scheduleCard')}</p>
          <p className="card-value">08 · 14 · 20</p>
          <p className="card-meta">{t('yallaServices.scheduleCardMeta')}</p>
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('yallaServices.monitoredTitle')}</h2>
            <p className="card-subtitle">{t('yallaServices.monitoredHelp')}</p>
          </div>
        </div>
        {isLoading ? <p>{t('yallaServices.loading')}</p> : null}
        {!isLoading && monitored.length === 0 ? (
          <p>{t('yallaServices.emptyMonitored')}</p>
        ) : null}
        {monitored.length > 0 ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('yallaServices.service')}</th>
                  <th>{t('yallaServices.validation')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('yallaServices.lastCheck')}</th>
                </tr>
              </thead>
              <tbody>
                {monitored.map((item) => (
                  <tr key={item.serviceId}>
                    <td>
                      <strong>{serviceName(item.serviceId)}</strong>
                    </td>
                    <td>
                      <p className="card-subtitle">
                        {serviceValidation(item.serviceId)}
                      </p>
                      {item.status === 'error' && item.error ? (
                        <p className="card-subtitle">{item.error}</p>
                      ) : null}
                    </td>
                    <td>
                      <span
                        className={
                          item.status === 'error' ? 'tag tag-urgent' : 'tag'
                        }
                      >
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td>
                      <p>{formatStamp(item.checkedAt, i18n.language)}</p>
                      {(item.lastRuns ?? []).slice(0, 3).map((run) => (
                        <p className="card-subtitle" key={`${run.at}-${run.slot}`}>
                          {run.slot} · {statusLabel(run.status)}
                        </p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {proposed.length > 0 ? (
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{t('yallaServices.proposedTitle')}</h2>
              <p className="card-subtitle">{t('yallaServices.proposedHelp')}</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('yallaServices.service')}</th>
                  <th>{t('yallaServices.validation')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {proposed.map((item) => (
                  <tr key={item.serviceId}>
                    <td>
                      <strong>{serviceName(item.serviceId)}</strong>
                    </td>
                    <td>
                      <p className="card-subtitle">
                        {serviceValidation(item.serviceId)}
                      </p>
                    </td>
                    <td>
                      <span className="tag">{statusLabel('proposed')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  )
}
