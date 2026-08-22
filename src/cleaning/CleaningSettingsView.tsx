import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchJson } from '../operations/api'
import type { CleanerRecord } from './types'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
}

const emptyForm = () => ({
  id: '',
  name: '',
  active: true,
})

const mapCleaner = (item: Record<string, unknown>): CleanerRecord => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? item.id ?? ''),
  active: item.active !== false,
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
  updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
})

export function CleaningSettingsView({ getEndpoint }: Props) {
  const { t } = useTranslation()
  const endpoints = useMemo(
    () => ({
      getCleaners: getEndpoint(
        'getCleanersUrl',
        import.meta.env.VITE_GET_CLEANERS_URL,
      ),
      upsertCleaner: getEndpoint(
        'upsertCleanerUrl',
        import.meta.env.VITE_UPSERT_CLEANER_URL,
      ),
    }),
    [getEndpoint],
  )

  const [cleaners, setCleaners] = useState<CleanerRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm())
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadCleaners = useCallback(async () => {
    if (!endpoints.getCleaners) {
      setError(t('cleaningSettings.missingEndpoint'))
      return
    }
    setIsLoading(true)
    setError('')
    try {
      const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
        `${endpoints.getCleaners}?includeInactive=true`,
      )
      setCleaners((payload.items ?? []).map(mapCleaner))
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningSettings.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [endpoints.getCleaners, t])

  useEffect(() => {
    void loadCleaners()
  }, [loadCleaners])

  const openCreate = () => {
    setForm(emptyForm())
    setIsFormOpen(true)
    setMessage('')
    setError('')
  }

  const openEdit = (cleaner: CleanerRecord) => {
    setForm({
      id: cleaner.id,
      name: cleaner.name,
      active: cleaner.active,
    })
    setIsFormOpen(true)
    setMessage('')
    setError('')
  }

  const saveCleaner = async () => {
    if (!endpoints.upsertCleaner) {
      setError(t('cleaningSettings.missingWrite'))
      return
    }
    if (!form.name.trim()) {
      setError(t('cleaningSettings.nameRequired'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertCleaner, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: form.id || undefined,
          name: form.name.trim(),
          active: form.active,
        }),
      })
      setIsFormOpen(false)
      setMessage(
        form.id
          ? t('cleaningSettings.updated')
          : t('cleaningSettings.created'),
      )
      await loadCleaners()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningSettings.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const toggleActive = async (cleaner: CleanerRecord) => {
    if (!endpoints.upsertCleaner) {
      setError(t('cleaningSettings.missingWrite'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertCleaner, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: cleaner.id,
          name: cleaner.name,
          active: !cleaner.active,
        }),
      })
      setMessage(
        cleaner.active
          ? t('cleaningSettings.deactivated')
          : t('cleaningSettings.activated'),
      )
      await loadCleaners()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('cleaningSettings.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <section className="card">
        <div className="page-header">
          <div className="page-header-leading">
            <h1 className="page-title">{t('cleaningSettings.title')}</h1>
            <p className="subtitle">{t('cleaningSettings.subtitle')}</p>
          </div>
          <div className="page-action-bar">
            <button className="btn-secondary" type="button" onClick={openCreate}>
              {t('cleaningSettings.addCleaner')}
            </button>
            <button className="btn-primary" type="button" onClick={() => void loadCleaners()}>
              {t('common.refresh')}
            </button>
          </div>
        </div>
        {message ? <p className="notice success">{message}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}
      </section>

      {isFormOpen ? (
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                {form.id
                  ? t('cleaningSettings.editCleaner')
                  : t('cleaningSettings.addCleaner')}
              </h2>
            </div>
            <button
              className="btn-secondary"
              type="button"
              onClick={() => setIsFormOpen(false)}
            >
              {t('common.cancel')}
            </button>
          </div>
          <div className="filters-grid">
            <label>
              {t('cleaningSettings.name')}
              <input
                type="text"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    active: event.target.checked,
                  }))
                }
              />
              {t('cleaningSettings.active')}
            </label>
          </div>
          <div className="page-action-bar" style={{ marginTop: 16 }}>
            <button
              className="btn-primary"
              type="button"
              disabled={isSaving}
              onClick={() => void saveCleaner()}
            >
              {isSaving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </section>
      ) : null}

      <section className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('cleaningSettings.name')}</th>
                <th>{t('cleaningSettings.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={3}>{t('common.loading')}</td>
                </tr>
              ) : cleaners.length === 0 ? (
                <tr>
                  <td colSpan={3}>{t('cleaningSettings.empty')}</td>
                </tr>
              ) : (
                cleaners.map((cleaner) => (
                  <tr key={cleaner.id}>
                    <td>{cleaner.name}</td>
                    <td>
                      <span className={`tag ${cleaner.active ? '' : 'muted'}`}>
                        {cleaner.active
                          ? t('cleaningSettings.active')
                          : t('cleaningSettings.inactive')}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() => openEdit(cleaner)}
                        >
                          {t('cleaningSettings.edit')}
                        </button>
                        <button
                          className="btn-secondary"
                          type="button"
                          disabled={isSaving}
                          onClick={() => void toggleActive(cleaner)}
                        >
                          {cleaner.active
                            ? t('cleaningSettings.deactivate')
                            : t('cleaningSettings.activate')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
