import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { fetchJson } from '../operations/api'
import type { UserRecord } from '../operations/types'
import type {
  MaintenanceAgentRecord,
  MaintenanceSettings,
  ProviderRecord,
  VisitTypeHours,
  VisitTypeOption,
} from './types'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
}

type SettingsSection = 'agents' | 'providers' | 'billingDetails'

type HoursDraft = {
  visitTypeId: string
  hours: string
}

const emptyAgentForm = () => ({
  id: '',
  userId: '',
  name: '',
  active: true,
})

const emptyProviderForm = () => ({
  id: '',
  name: '',
  active: true,
})

const mapAgent = (item: Record<string, unknown>): MaintenanceAgentRecord => ({
  id: String(item.id ?? item.userId ?? ''),
  userId: String(item.userId ?? item.id ?? ''),
  name: String(item.name ?? item.id ?? ''),
  active: item.active !== false,
})

const mapUser = (item: Record<string, unknown>): UserRecord => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? item.email ?? item.id ?? ''),
  email: typeof item.email === 'string' ? item.email : undefined,
  teamId: typeof item.teamId === 'string' ? item.teamId : undefined,
})

const toNumber = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const mapProvider = (item: Record<string, unknown>): ProviderRecord => ({
  id: String(item.id ?? ''),
  name: String(item.name ?? item.id ?? ''),
  active: item.active !== false,
  jobsCount: toNumber(item.jobsCount),
  incidentsCount: toNumber(item.incidentsCount),
  createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
  updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
})

const mapSettings = (item: Record<string, unknown>): MaintenanceSettings => ({
  id: String(item.id ?? 'GLOBAL'),
  monthlyHoursPool: toNumber(item.monthlyHoursPool),
  hourlyCost: toNumber(item.hourlyCost),
  defaultProviderId: String(item.defaultProviderId ?? ''),
  defaultProviderName: String(item.defaultProviderName ?? ''),
  visitTypeHours: Array.isArray(item.visitTypeHours)
    ? (item.visitTypeHours as Record<string, unknown>[]).map((entry) => ({
        visitTypeId: String(entry.visitTypeId ?? ''),
        visitTypeName: String(entry.visitTypeName ?? entry.visitTypeId ?? ''),
        hours: toNumber(entry.hours),
      }))
    : [],
})

export function MaintenanceSettingsView({ getEndpoint }: Props) {
  const { t } = useTranslation()
  const endpoints = useMemo(
    () => ({
      getProviders: getEndpoint(
        'getMaintenanceProvidersUrl',
        import.meta.env.VITE_GET_MAINTENANCE_PROVIDERS_URL,
      ),
      upsertProvider: getEndpoint(
        'upsertMaintenanceProviderUrl',
        import.meta.env.VITE_UPSERT_MAINTENANCE_PROVIDER_URL,
      ),
      getDetails: getEndpoint(
        'getMaintenanceBillingDetailsUrl',
        import.meta.env.VITE_GET_MAINTENANCE_BILLING_DETAILS_URL,
      ),
      upsertDetails: getEndpoint(
        'upsertMaintenanceBillingDetailsUrl',
        import.meta.env.VITE_UPSERT_MAINTENANCE_BILLING_DETAILS_URL,
      ),
      getAgents: getEndpoint(
        'getMaintenanceAgentsUrl',
        import.meta.env.VITE_GET_MAINTENANCE_AGENTS_URL,
      ),
      upsertAgent: getEndpoint(
        'upsertMaintenanceAgentUrl',
        import.meta.env.VITE_UPSERT_MAINTENANCE_AGENT_URL,
      ),
      getUsers: getEndpoint('getUsersUrl', import.meta.env.VITE_GET_USERS_URL),
    }),
    [getEndpoint],
  )

  const [section, setSection] = useState<SettingsSection | null>(null)
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [agents, setAgents] = useState<MaintenanceAgentRecord[]>([])
  const [users, setUsers] = useState<UserRecord[]>([])
  const [settings, setSettings] = useState<MaintenanceSettings | null>(null)
  const [visitTypes, setVisitTypes] = useState<VisitTypeOption[]>([])
  const [poolDraft, setPoolDraft] = useState('')
  const [costDraft, setCostDraft] = useState('')
  const [defaultProviderId, setDefaultProviderId] = useState('')
  const [hoursDrafts, setHoursDrafts] = useState<HoursDraft[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isProviderFormOpen, setIsProviderFormOpen] = useState(false)
  const [providerForm, setProviderForm] = useState(emptyProviderForm())
  const [isAgentFormOpen, setIsAgentFormOpen] = useState(false)
  const [agentForm, setAgentForm] = useState(emptyAgentForm())
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const activeProviders = providers.filter((provider) => provider.active)
  const activeAgents = agents.filter((agent) => agent.active)
  const visitTypeById = useMemo(
    () => new Map(visitTypes.map((item) => [item.id, item.name])),
    [visitTypes],
  )

  const loadProviders = useCallback(async () => {
    if (!endpoints.getProviders) {
      setError(t('maintenanceSettings.missingEndpoint'))
      return
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      `${endpoints.getProviders}?includeInactive=true`,
    )
    setProviders((payload.items ?? []).map(mapProvider))
  }, [endpoints.getProviders, t])

  const loadAgents = useCallback(async () => {
    if (!endpoints.getAgents) {
      return
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      `${endpoints.getAgents}?includeInactive=true`,
    )
    setAgents((payload.items ?? []).map(mapAgent))
  }, [endpoints.getAgents])

  const loadUsers = useCallback(async () => {
    if (!endpoints.getUsers) {
      return
    }
    const payload = await fetchJson<{ items?: Record<string, unknown>[] }>(
      endpoints.getUsers,
    )
    setUsers((payload.items ?? []).map(mapUser).filter((user) => user.id))
  }, [endpoints.getUsers])

  const applySettings = (item: MaintenanceSettings) => {
    setSettings(item)
    setPoolDraft(String(item.monthlyHoursPool))
    setCostDraft(String(item.hourlyCost))
    setDefaultProviderId(item.defaultProviderId)
    setHoursDrafts(
      item.visitTypeHours.map((entry) => ({
        visitTypeId: entry.visitTypeId,
        hours: String(entry.hours),
      })),
    )
  }

  const loadDetails = useCallback(async () => {
    if (!endpoints.getDetails) {
      return
    }
    const payload = await fetchJson<{
      item?: Record<string, unknown>
      visitTypes?: VisitTypeOption[]
    }>(endpoints.getDetails)
    if (payload.item) {
      applySettings(mapSettings(payload.item))
    }
    setVisitTypes(
      (payload.visitTypes ?? []).filter((entry) => entry.id && entry.active !== false),
    )
  }, [endpoints.getDetails])

  const refreshAll = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      await loadDetails()
      await Promise.all([loadProviders(), loadAgents(), loadUsers()])
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('maintenanceSettings.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [loadAgents, loadDetails, loadProviders, loadUsers, t])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  const openCreateAgent = () => {
    setAgentForm(emptyAgentForm())
    setIsAgentFormOpen(true)
    setMessage('')
    setError('')
  }

  const openEditAgent = (agent: MaintenanceAgentRecord) => {
    setAgentForm({
      id: agent.id,
      userId: agent.userId,
      name: agent.name,
      active: agent.active,
    })
    setIsAgentFormOpen(true)
    setMessage('')
    setError('')
  }

  const saveAgent = async () => {
    if (!endpoints.upsertAgent) {
      setError(t('maintenanceSettings.missingAgentsWrite'))
      return
    }
    if (!agentForm.id && !agentForm.userId.trim()) {
      setError(t('maintenanceSettings.userRequired'))
      return
    }
    const selectedUser = users.find((user) => user.id === agentForm.userId)
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertAgent, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: agentForm.id || undefined,
          userId: agentForm.userId || undefined,
          name: agentForm.name.trim() || selectedUser?.name,
          active: agentForm.active,
        }),
      })
      setIsAgentFormOpen(false)
      setMessage(
        agentForm.id
          ? t('maintenanceSettings.agentUpdated')
          : t('maintenanceSettings.agentCreated'),
      )
      await loadAgents()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('maintenanceSettings.agentSaveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const toggleAgentActive = async (agent: MaintenanceAgentRecord) => {
    if (!endpoints.upsertAgent) {
      setError(t('maintenanceSettings.missingAgentsWrite'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertAgent, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: agent.id,
          userId: agent.userId,
          name: agent.name,
          active: !agent.active,
        }),
      })
      setMessage(
        agent.active
          ? t('maintenanceSettings.agentDeactivated')
          : t('maintenanceSettings.agentActivated'),
      )
      await loadAgents()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('maintenanceSettings.agentSaveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const openCreateProvider = () => {
    setProviderForm(emptyProviderForm())
    setIsProviderFormOpen(true)
    setMessage('')
    setError('')
  }

  const openEditProvider = (provider: ProviderRecord) => {
    setProviderForm({
      id: provider.id,
      name: provider.name,
      active: provider.active,
    })
    setIsProviderFormOpen(true)
    setMessage('')
    setError('')
  }

  const saveProvider = async () => {
    if (!endpoints.upsertProvider) {
      setError(t('maintenanceSettings.missingWrite'))
      return
    }
    if (!providerForm.name.trim()) {
      setError(t('maintenanceSettings.nameRequired'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertProvider, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: providerForm.id || undefined,
          name: providerForm.name.trim(),
          active: providerForm.active,
        }),
      })
      setIsProviderFormOpen(false)
      setMessage(
        providerForm.id
          ? t('maintenanceSettings.updated')
          : t('maintenanceSettings.created'),
      )
      await loadProviders()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('maintenanceSettings.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const toggleActive = async (provider: ProviderRecord) => {
    if (!endpoints.upsertProvider) {
      setError(t('maintenanceSettings.missingWrite'))
      return
    }
    setIsSaving(true)
    setError('')
    try {
      await fetchJson(endpoints.upsertProvider, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: provider.id,
          name: provider.name,
          active: !provider.active,
        }),
      })
      setMessage(
        provider.active
          ? t('maintenanceSettings.deactivated')
          : t('maintenanceSettings.activated'),
      )
      await loadProviders()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('maintenanceSettings.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const saveDetails = async () => {
    if (!endpoints.upsertDetails) {
      setError(t('maintenanceSettings.missingDetailsWrite'))
      return
    }
    const monthlyHoursPool = Number(String(poolDraft).replace(',', '.'))
    const hourlyCost = Number(String(costDraft).replace(',', '.'))
    if (!(monthlyHoursPool >= 0)) {
      setError(t('maintenanceSettings.poolRequired'))
      return
    }
    if (!(hourlyCost >= 0)) {
      setError(t('maintenanceSettings.costRequired'))
      return
    }
    const visitTypeHours: VisitTypeHours[] = hoursDrafts
      .filter((draft) => draft.visitTypeId)
      .map((draft) => ({
        visitTypeId: draft.visitTypeId,
        visitTypeName: visitTypeById.get(draft.visitTypeId) || draft.visitTypeId,
        hours: Number(String(draft.hours).replace(',', '.')),
      }))
    if (visitTypeHours.some((entry) => !Number.isFinite(entry.hours) || entry.hours < 0)) {
      setError(t('maintenanceSettings.hoursRequired'))
      return
    }
    const selectedProvider = providers.find((item) => item.id === defaultProviderId)
    setIsSaving(true)
    setError('')
    try {
      const payload = await fetchJson<{ item?: Record<string, unknown> }>(
        endpoints.upsertDetails,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            monthlyHoursPool,
            hourlyCost,
            defaultProviderId,
            defaultProviderName: selectedProvider?.name || defaultProviderId,
            visitTypeHours,
          }),
        },
      )
      if (payload.item) {
        applySettings(mapSettings(payload.item))
      }
      setMessage(t('maintenanceSettings.detailsUpdated'))
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : t('maintenanceSettings.detailsSaveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const unusedVisitTypes = visitTypes.filter(
    (item) => !hoursDrafts.some((draft) => draft.visitTypeId === item.id),
  )
  const agentUserIds = new Set(agents.map((agent) => agent.userId || agent.id))
  const availableUsers = users.filter(
    (user) =>
      !agentUserIds.has(user.id) || user.id === agentForm.userId,
  )

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('maintenanceSettings.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Maintenance settings')}</h1>
          </div>
          <p className="subtitle">{t('maintenanceSettings.subtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <div className="header-actions">
              <button
                className="btn-primary"
                type="button"
                onClick={() => void refreshAll()}
                aria-label={t('common.refresh')}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
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

      <section className="summary-cards cleaning-settings-cards">
        <button
          type="button"
          className={`card card-compact summary-card-button ${
            section === 'agents' ? 'is-selected' : ''
          }`}
          onClick={() =>
            setSection((current) => (current === 'agents' ? null : 'agents'))
          }
        >
          <p className="card-label">{t('maintenanceSettings.agentsCard')}</p>
          <p className="card-value">{isLoading ? '—' : activeAgents.length}</p>
          <p className="card-meta">{t('maintenanceSettings.agentsCardMeta')}</p>
        </button>
        <button
          type="button"
          className={`card card-compact summary-card-button ${
            section === 'providers' ? 'is-selected' : ''
          }`}
          onClick={() =>
            setSection((current) =>
              current === 'providers' ? null : 'providers',
            )
          }
        >
          <p className="card-label">{t('maintenanceSettings.providersCard')}</p>
          <p className="card-value">{isLoading ? '—' : activeProviders.length}</p>
          <p className="card-meta">{t('maintenanceSettings.providersCardMeta')}</p>
        </button>
        <button
          type="button"
          className={`card card-compact summary-card-button ${
            section === 'billingDetails' ? 'is-selected' : ''
          }`}
          onClick={() =>
            setSection((current) =>
              current === 'billingDetails' ? null : 'billingDetails',
            )
          }
        >
          <p className="card-label">{t('maintenanceSettings.detailsCard')}</p>
          <p className="card-value">
            {isLoading || !settings ? '—' : `${settings.monthlyHoursPool} h`}
          </p>
          <p className="card-meta">{t('maintenanceSettings.detailsCardMeta')}</p>
        </button>
      </section>

      {section === 'agents' ? (
        <>
          {isAgentFormOpen ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">
                    {agentForm.id
                      ? t('maintenanceSettings.editAgent')
                      : t('maintenanceSettings.addAgent')}
                  </h2>
                </div>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setIsAgentFormOpen(false)}
                >
                  {t('common.cancel')}
                </button>
              </div>
              <div className="filters-grid">
                {agentForm.id ? (
                  <label>
                    {t('maintenanceSettings.name')}
                    <input value={agentForm.name} disabled />
                  </label>
                ) : (
                  <label>
                    {t('maintenanceSettings.selectUser')}
                    <select
                      value={agentForm.userId}
                      onChange={(event) => {
                        const userId = event.target.value
                        const user = users.find((item) => item.id === userId)
                        setAgentForm((current) => ({
                          ...current,
                          userId,
                          name: user?.name ?? '',
                        }))
                      }}
                    >
                      <option value="">
                        {t('maintenanceSettings.selectUser')}
                      </option>
                      {availableUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                          {user.email ? ` (${user.email})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={agentForm.active}
                    onChange={(event) =>
                      setAgentForm((current) => ({
                        ...current,
                        active: event.target.checked,
                      }))
                    }
                  />
                  {t('maintenanceSettings.active')}
                </label>
              </div>
              <div className="page-action-bar" style={{ marginTop: 16 }}>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveAgent()}
                >
                  {isSaving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  {t('maintenanceSettings.agentsCard')}
                </h2>
                <p className="card-subtitle">
                  {t('maintenanceSettings.agentsSubtitle')}
                </p>
              </div>
              <button
                className="btn-secondary"
                type="button"
                onClick={openCreateAgent}
              >
                {t('maintenanceSettings.addAgent')}
              </button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('maintenanceSettings.name')}</th>
                    <th>{t('maintenanceSettings.status')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={3}>{t('common.loading')}</td>
                    </tr>
                  ) : agents.length === 0 ? (
                    <tr>
                      <td colSpan={3}>{t('maintenanceSettings.emptyAgents')}</td>
                    </tr>
                  ) : (
                    agents.map((agent) => (
                      <tr key={agent.id}>
                        <td>{agent.name}</td>
                        <td>
                          {agent.active
                            ? t('maintenanceSettings.active')
                            : t('maintenanceSettings.inactive')}
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="btn-secondary"
                              type="button"
                              onClick={() => openEditAgent(agent)}
                            >
                              {t('maintenanceSettings.edit')}
                            </button>
                            <button
                              className="btn-ghost"
                              type="button"
                              disabled={isSaving}
                              onClick={() => void toggleAgentActive(agent)}
                            >
                              {agent.active
                                ? t('maintenanceSettings.deactivate')
                                : t('maintenanceSettings.activate')}
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
      ) : null}

      {section === 'providers' ? (
        <>
          {isProviderFormOpen ? (
            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">
                    {providerForm.id
                      ? t('maintenanceSettings.editProvider')
                      : t('maintenanceSettings.addProvider')}
                  </h2>
                </div>
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() => setIsProviderFormOpen(false)}
                >
                  {t('common.cancel')}
                </button>
              </div>
              <div className="filters-grid">
                <label>
                  {t('maintenanceSettings.name')}
                  <input
                    type="text"
                    value={providerForm.name}
                    onChange={(event) =>
                      setProviderForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={providerForm.active}
                    onChange={(event) =>
                      setProviderForm((current) => ({
                        ...current,
                        active: event.target.checked,
                      }))
                    }
                  />
                  {t('maintenanceSettings.active')}
                </label>
              </div>
              <div className="page-action-bar" style={{ marginTop: 16 }}>
                <button
                  className="btn-primary"
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveProvider()}
                >
                  {isSaving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </section>
          ) : null}

          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">
                  {t('maintenanceSettings.providersCard')}
                </h2>
                <p className="card-subtitle">
                  {t('maintenanceSettings.providersSubtitle')}
                </p>
              </div>
              <button
                className="btn-secondary"
                type="button"
                onClick={openCreateProvider}
              >
                {t('maintenanceSettings.addProvider')}
              </button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('maintenanceSettings.name')}</th>
                    <th>{t('maintenanceSettings.status')}</th>
                    <th>{t('maintenanceSettings.jobs')}</th>
                    <th>{t('maintenanceSettings.incidents')}</th>
                    <th>{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={5}>{t('common.loading')}</td>
                    </tr>
                  ) : providers.length === 0 ? (
                    <tr>
                      <td colSpan={5}>{t('maintenanceSettings.empty')}</td>
                    </tr>
                  ) : (
                    providers.map((provider) => (
                      <tr key={provider.id}>
                        <td>{provider.name}</td>
                        <td>
                          <span className={`tag ${provider.active ? '' : 'muted'}`}>
                            {provider.active
                              ? t('maintenanceSettings.active')
                              : t('maintenanceSettings.inactive')}
                          </span>
                        </td>
                        <td>{provider.jobsCount ?? 0}</td>
                        <td>{provider.incidentsCount ?? 0}</td>
                        <td>
                          <div className="table-actions">
                            <button
                              className="btn-secondary"
                              type="button"
                              onClick={() => openEditProvider(provider)}
                            >
                              {t('maintenanceSettings.edit')}
                            </button>
                            <button
                              className="btn-secondary"
                              type="button"
                              disabled={isSaving}
                              onClick={() => void toggleActive(provider)}
                            >
                              {provider.active
                                ? t('maintenanceSettings.deactivate')
                                : t('maintenanceSettings.activate')}
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
      ) : null}

      {section === 'billingDetails' ? (
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{t('maintenanceSettings.detailsCard')}</h2>
              <p className="card-subtitle">
                {t('maintenanceSettings.detailsSubtitle')}
              </p>
            </div>
          </div>
          <div className="filters-grid">
            <label>
              {t('maintenanceSettings.hoursPool')}
              <input
                type="number"
                min="0"
                step="1"
                value={poolDraft}
                onChange={(event) => setPoolDraft(event.target.value)}
              />
            </label>
            <label>
              {t('maintenanceSettings.hourlyCost')}
              <input
                type="number"
                min="0"
                step="0.01"
                value={costDraft}
                onChange={(event) => setCostDraft(event.target.value)}
              />
            </label>
            <label>
              {t('maintenanceSettings.defaultProvider')}
              <select
                value={defaultProviderId}
                onChange={(event) => setDefaultProviderId(event.target.value)}
              >
                <option value="">{t('maintenanceSettings.selectProvider')}</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                    {provider.active
                      ? ''
                      : ` (${t('maintenanceSettings.inactive')})`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('maintenanceSettings.visitType')}</th>
                  <th>{t('maintenanceSettings.mappedHours')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {hoursDrafts.length === 0 ? (
                  <tr>
                    <td colSpan={3}>{t('maintenanceSettings.emptyMappings')}</td>
                  </tr>
                ) : (
                  hoursDrafts.map((draft, index) => (
                    <tr key={`${draft.visitTypeId}-${index}`}>
                      <td>
                        <select
                          value={draft.visitTypeId}
                          onChange={(event) =>
                            setHoursDrafts((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, visitTypeId: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                        >
                          <option value="">
                            {t('maintenanceSettings.selectVisitType')}
                          </option>
                          {visitTypes
                            .filter(
                              (item) =>
                                item.id === draft.visitTypeId ||
                                !hoursDrafts.some(
                                  (other, otherIndex) =>
                                    otherIndex !== index &&
                                    other.visitTypeId === item.id,
                                ),
                            )
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.25"
                          value={draft.hours}
                          onChange={(event) =>
                            setHoursDrafts((current) =>
                              current.map((entry, entryIndex) =>
                                entryIndex === index
                                  ? { ...entry, hours: event.target.value }
                                  : entry,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="btn-secondary"
                          type="button"
                          onClick={() =>
                            setHoursDrafts((current) =>
                              current.filter((_, entryIndex) => entryIndex !== index),
                            )
                          }
                        >
                          {t('maintenanceSettings.removeMapping')}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="page-action-bar" style={{ marginTop: 16 }}>
            <button
              className="btn-secondary"
              type="button"
              disabled={unusedVisitTypes.length === 0}
              onClick={() =>
                setHoursDrafts((current) => [
                  ...current,
                  { visitTypeId: unusedVisitTypes[0]?.id ?? '', hours: '1' },
                ])
              }
            >
              {t('maintenanceSettings.addMapping')}
            </button>
            <button
              className="btn-primary"
              type="button"
              disabled={isSaving}
              onClick={() => void saveDetails()}
            >
              {isSaving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </section>
      ) : null}
    </>
  )
}
