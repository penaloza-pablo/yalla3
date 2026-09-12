import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfirm } from '../design/ConfirmDialog'
import { YallaSwitch } from '../bookings/YallaSwitch'
import {
  fetchJson,
  getVisitTemplateAutoAssignRules,
  getVisitTemplates,
  mapVisitTemplateAutoAssign,
  saveVisitTemplateAutoAssign,
} from './api'
import {
  filterTemplateAutoAssignPropertyOptions,
  getPropertyLabel,
  sortPropertyOptions,
} from './propertyHelpers'
import {
  activeTemplatesForProperty,
  mapVisitTemplate,
  templateMatchesProperty,
} from './visitTemplateHelpers'
import type {
  PropertyOption,
  TeamRecord,
  VisitTemplateAutoAssignRule,
  VisitTemplateRecord,
  VisitTypeRecord,
} from './types'
import { YlIcon } from '../design/icons'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
}

type AutoAssignFilters = {
  propertyIds: string[]
  teamIds: string[]
}

const emptyForm = () => ({
  id: '',
  propertyId: '',
  templateId: '',
  titlePrefix: '',
  enabled: true,
})

const emptyFilters = (): AutoAssignFilters => ({
  propertyIds: [],
  teamIds: [],
})

const toggleListValue = (values: string[], value: string) =>
  values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value]

export function TemplateAutoAssignView({
  getEndpoint,
  propertyOptions,
}: Props) {
  const { t } = useTranslation()
  const confirmAction = useConfirm()
  const endpoints = useMemo(
    () => ({
      list: getEndpoint('getVisitTemplateAutoAssignUrl'),
      upsert: getEndpoint('upsertVisitTemplateAutoAssignUrl'),
      templates: getEndpoint(
        'getVisitTemplatesUrl',
        import.meta.env.VITE_GET_VISIT_TEMPLATES_URL,
      ),
      teams: getEndpoint('getTeamsUrl', import.meta.env.VITE_GET_TEAMS_URL),
      visitTypes: getEndpoint(
        'getVisitTypesUrl',
        import.meta.env.VITE_GET_VISIT_TYPES_URL,
      ),
    }),
    [getEndpoint],
  )

  const [rules, setRules] = useState<VisitTemplateAutoAssignRule[]>([])
  const [templates, setTemplates] = useState<VisitTemplateRecord[]>([])
  const [teams, setTeams] = useState<TeamRecord[]>([])
  const [visitTypes, setVisitTypes] = useState<VisitTypeRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [filters, setFilters] = useState<AutoAssignFilters>(emptyFilters)
  const [filterDraft, setFilterDraft] = useState<AutoAssignFilters>(emptyFilters)

  const properties = useMemo(
    () => filterTemplateAutoAssignPropertyOptions(propertyOptions),
    [propertyOptions],
  )
  const allProperties = useMemo(
    () => sortPropertyOptions(propertyOptions),
    [propertyOptions],
  )
  const propertyById = useMemo(
    () =>
      new Map(
        allProperties.map((property) => [property.id, getPropertyLabel(property)]),
      ),
    [allProperties],
  )
  const templateById = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates],
  )
  const visitTypeById = useMemo(
    () => new Map(visitTypes.map((type) => [type.id, type.name])),
    [visitTypes],
  )
  const teamById = useMemo(
    () => new Map(teams.map((team) => [team.id, team.name])),
    [teams],
  )
  const sortedTeams = useMemo(
    () =>
      [...teams].sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
      ),
    [teams],
  )
  const formPropertyOptions = useMemo(() => {
    if (!form.propertyId) {
      return properties
    }
    if (properties.some((property) => property.id === form.propertyId)) {
      return properties
    }
    const extra = allProperties.find((property) => property.id === form.propertyId)
    return extra ? [extra, ...properties] : properties
  }, [allProperties, form.propertyId, properties])
  const propertyTemplates = useMemo(() => {
    if (!form.propertyId) {
      return []
    }
    const active = activeTemplatesForProperty(templates, form.propertyId)
    const current = templateById.get(form.templateId)
    if (
      current &&
      templateMatchesProperty(current, form.propertyId) &&
      !active.some((template) => template.id === current.id)
    ) {
      return [current, ...active]
    }
    return active
  }, [form.propertyId, form.templateId, templateById, templates])
  const selectedTemplate = templateById.get(form.templateId)
  const sortedRules = useMemo(() => {
    return [...rules].sort((left, right) => {
      const propertyCompare = (
        propertyById.get(left.propertyId) ?? left.propertyId
      ).localeCompare(
        propertyById.get(right.propertyId) ?? right.propertyId,
        undefined,
        { sensitivity: 'base' },
      )
      if (propertyCompare !== 0) {
        return propertyCompare
      }
      return left.titlePrefix.localeCompare(right.titlePrefix, undefined, {
        sensitivity: 'base',
      })
    })
  }, [propertyById, rules])
  const filteredRules = useMemo(() => {
    return sortedRules.filter((rule) => {
      if (
        filters.propertyIds.length > 0 &&
        !filters.propertyIds.includes(rule.propertyId)
      ) {
        return false
      }
      if (filters.teamIds.length > 0) {
        const template = templateById.get(rule.templateId)
        const teamId = template?.teamId ?? ''
        if (!filters.teamIds.includes(teamId)) {
          return false
        }
      }
      return true
    })
  }, [filters.propertyIds, filters.teamIds, sortedRules, templateById])
  const activeFilterCount = filters.propertyIds.length + filters.teamIds.length
  const hasActiveFilters = activeFilterCount > 0

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(endpoints.list ? null : t('templateAutoAssign.missingEndpoint'))
    try {
      const [nextRules, templatesPayload, teamsPayload, typesPayload] =
        await Promise.all([
          endpoints.list
            ? getVisitTemplateAutoAssignRules(endpoints.list)
            : Promise.resolve([] as VisitTemplateAutoAssignRule[]),
          endpoints.templates
            ? getVisitTemplates(endpoints.templates, { includeInactive: true })
            : Promise.resolve({ items: [] as VisitTemplateRecord[] }),
          endpoints.teams
            ? fetchJson<{ items?: Record<string, unknown>[] }>(endpoints.teams)
            : Promise.resolve({ items: [] as Record<string, unknown>[] }),
          endpoints.visitTypes
            ? fetchJson<{ items?: Record<string, unknown>[] }>(
                endpoints.visitTypes,
              )
            : Promise.resolve({ items: [] as Record<string, unknown>[] }),
        ])
      setRules(nextRules)
      setTemplates(
        (templatesPayload.items ?? []).map((entry) =>
          mapVisitTemplate(entry as unknown as Record<string, unknown>),
        ),
      )
      setTeams(
        (teamsPayload.items ?? []).map((item) => ({
          id: String(item.id ?? ''),
          name: String(item.name ?? item.id ?? ''),
        })),
      )
      setVisitTypes(
        (typesPayload.items ?? []).map((item) => ({
          id: String(item.id ?? ''),
          name: String(item.name ?? item.id ?? ''),
        })),
      )
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t('templateAutoAssign.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [
    endpoints.list,
    endpoints.teams,
    endpoints.templates,
    endpoints.visitTypes,
    t,
  ])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setForm(emptyForm())
    setIsFormOpen(true)
  }

  const openEdit = (rule: VisitTemplateAutoAssignRule) => {
    setForm({
      id: rule.id,
      propertyId: rule.propertyId,
      templateId: rule.templateId,
      titlePrefix: rule.titlePrefix,
      enabled: rule.enabled,
    })
    setIsFormOpen(true)
  }

  const openFilters = () => {
    setFilterDraft({
      propertyIds: [...filters.propertyIds],
      teamIds: [...filters.teamIds],
    })
    setIsFilterOpen(true)
  }

  const saveRule = async (
    payload: Record<string, unknown>,
    successKey: string,
    options?: { closeForm?: boolean },
  ) => {
    if (!endpoints.upsert) {
      setError(t('templateAutoAssign.missingWrite'))
      return
    }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const response = await saveVisitTemplateAutoAssign(endpoints.upsert, payload)
      if (payload.action === 'delete') {
        setRules((current) =>
          current.filter((rule) => rule.id !== payload.id),
        )
      } else if (response.item) {
        const saved = mapVisitTemplateAutoAssign(response.item)
        setRules((current) => {
          const without = current.filter((rule) => rule.id !== saved.id)
          return [...without, saved]
        })
      }
      setMessage(t(successKey))
      if (options?.closeForm !== false) {
        setIsFormOpen(false)
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t('templateAutoAssign.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const submitForm = () => {
    const propertyId = form.propertyId.trim()
    const templateId = form.templateId.trim()
    const titlePrefix = form.titlePrefix.trim()
    if (!propertyId || !templateId || !titlePrefix) {
      setError(t('templateAutoAssign.required'))
      return
    }
    void saveRule(
      {
        id: form.id || undefined,
        propertyId,
        templateId,
        titlePrefix,
        enabled: form.enabled,
      },
      form.id ? 'templateAutoAssign.updated' : 'templateAutoAssign.created',
    )
  }

  const toggleRule = (rule: VisitTemplateAutoAssignRule) => {
    void saveRule(
      {
        id: rule.id,
        propertyId: rule.propertyId,
        templateId: rule.templateId,
        titlePrefix: rule.titlePrefix,
        enabled: !rule.enabled,
      },
      'templateAutoAssign.updated',
      { closeForm: false },
    )
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('templateAutoAssign.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Template Auto Assign')}</h1>
          </div>
          <p className="subtitle">{t('templateAutoAssign.subtitle')}</p>
        </div>
        <div className="header-actions">
          <button
            className={`btn-ghost btn-filter ${hasActiveFilters ? 'is-active' : ''}`}
            type="button"
            aria-label={t('common.filters')}
            title={t('common.filters')}
            onClick={openFilters}
          >
            <YlIcon name="line.3.horizontal.decrease" size={16} />
            {hasActiveFilters ? (
              <span className="filter-badge">{activeFilterCount}</span>
            ) : null}
          </button>
          <button
            className="btn-ghost"
            type="button"
            aria-label={t('templateAutoAssign.add')}
            title={t('templateAutoAssign.add')}
            onClick={openCreate}
          >
            <YlIcon name="plus" size={16} />
          </button>
        </div>
      </header>

      {error ? <p className="notice error">{error}</p> : null}
      {message ? <p className="notice success">{message}</p> : null}

      <section className="card">
        {isLoading ? <p>{t('common.loading')}</p> : null}
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('operations.property')}</th>
                <th>{t('templateAutoAssign.titlePrefix')}</th>
                <th>{t('operations.visitType')}</th>
                <th>{t('operations.team')}</th>
                <th>{t('templateAutoAssign.template')}</th>
                <th>{t('templateAutoAssign.enabled')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredRules.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={7}>
                    {rules.length > 0 && hasActiveFilters
                      ? t('templateAutoAssign.emptyFiltered')
                      : t('templateAutoAssign.empty')}
                  </td>
                </tr>
              ) : (
                filteredRules.map((rule) => {
                  const template = templateById.get(rule.templateId)
                  return (
                    <tr key={rule.id} className={rule.enabled ? '' : 'muted-row'}>
                      <td>
                        {propertyById.get(rule.propertyId) ?? rule.propertyId}
                      </td>
                      <td>{rule.titlePrefix}</td>
                      <td>
                        {template
                          ? visitTypeById.get(template.visitTypeId) ??
                            template.visitTypeId
                          : '—'}
                      </td>
                      <td>
                        {template
                          ? teamById.get(template.teamId) ?? template.teamId
                          : '—'}
                      </td>
                      <td>{template?.name ?? rule.templateId}</td>
                      <td>
                        <div className="planner-switch compact">
                          <YallaSwitch
                            on={rule.enabled}
                            disabled={isSaving}
                            label={
                              rule.enabled
                                ? t('bookingsSettings.on')
                                : t('bookingsSettings.off')
                            }
                            onToggle={() => toggleRule(rule)}
                          />
                          <span>
                            {rule.enabled
                              ? t('bookingsSettings.on')
                              : t('bookingsSettings.off')}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="btn-icon btn-icon-ghost"
                            aria-label={t('templateAutoAssign.edit')}
                            title={t('templateAutoAssign.edit')}
                            onClick={() => openEdit(rule)}
                          >
                            <YlIcon name="pencil" size={16} />
                          </button>
                          <button
                            type="button"
                            className="btn-icon btn-icon-ghost"
                            aria-label={t('common.delete')}
                            title={t('common.delete')}
                            onClick={() => {
                              void (async () => {
                                if (
                                  await confirmAction({
                                    title: t('common.delete'),
                                    message: t('templateAutoAssign.deleteConfirm'),
                                    confirmLabel: t('common.delete'),
                                    destructive: true,
                                  })
                                ) {
                                  void saveRule(
                                    { id: rule.id, action: 'delete' },
                                    'templateAutoAssign.deleted',
                                  )
                                }
                              })()
                            }}
                          >
                            <YlIcon name="xmark" size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isFilterOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal modal-scrollable">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('common.filters')}</h3>
                <p className="modal-subtitle">
                  {t('templateAutoAssign.filterSubtitle')}
                </p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsFilterOpen(false)}
                aria-label={t('common.closeFilters')}
              >
                <YlIcon name="xmark" size={16} />
              </button>
            </div>
            <div className="modal-body">
              <div className="filter-grid">
                <div className="filter-group">
                  <p className="filter-title">{t('operations.property')}</p>
                  <div className="filter-options filter-options-scroll">
                    {properties.map((property) => {
                      const isChecked = filterDraft.propertyIds.includes(
                        property.id,
                      )
                      return (
                        <label className="filter-option" key={property.id}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() =>
                              setFilterDraft((current) => ({
                                ...current,
                                propertyIds: toggleListValue(
                                  current.propertyIds,
                                  property.id,
                                ),
                              }))
                            }
                          />
                          <span>{getPropertyLabel(property)}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div className="filter-group">
                  <p className="filter-title">{t('operations.team')}</p>
                  <div className="filter-options filter-options-scroll">
                    {sortedTeams.map((team) => {
                      const isChecked = filterDraft.teamIds.includes(team.id)
                      return (
                        <label className="filter-option" key={team.id}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() =>
                              setFilterDraft((current) => ({
                                ...current,
                                teamIds: toggleListValue(current.teamIds, team.id),
                              }))
                            }
                          />
                          <span>{team.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setFilterDraft(emptyFilters())}
              >
                {t('common.clear')}
              </button>
              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  setFilters({
                    propertyIds: [...filterDraft.propertyIds],
                    teamIds: [...filterDraft.teamIds],
                  })
                  setIsFilterOpen(false)
                }}
              >
                {t('common.applyFilters')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isFormOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {form.id
                    ? t('templateAutoAssign.edit')
                    : t('templateAutoAssign.add')}
                </h3>
                <p className="modal-subtitle">
                  {t('templateAutoAssign.formHelp')}
                </p>
              </div>
              <button
                className="btn-icon"
                type="button"
                aria-label={t('common.close')}
                onClick={() => setIsFormOpen(false)}
              >
                <YlIcon name="xmark" size={16} />
              </button>
            </div>
            <div className="modal-body form-grid">
              <label>
                {t('operations.property')}
                <select
                  value={form.propertyId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      propertyId: event.target.value,
                      templateId: '',
                    }))
                  }
                >
                  <option value="">{t('templateAutoAssign.selectProperty')}</option>
                  {formPropertyOptions.map((property) => (
                    <option key={property.id} value={property.id}>
                      {getPropertyLabel(property)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('templateAutoAssign.template')}
                <select
                  value={form.templateId}
                  disabled={!form.propertyId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      templateId: event.target.value,
                    }))
                  }
                >
                  <option value="">
                    {form.propertyId
                      ? t('templateAutoAssign.selectTemplate')
                      : t('templateAutoAssign.pickPropertyFirst')}
                  </option>
                  {propertyTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedTemplate ? (
                <p className="table-help">
                  {t('operations.team')}:{' '}
                  {teamById.get(selectedTemplate.teamId) ??
                    selectedTemplate.teamId}
                  {' · '}
                  {t('operations.visitType')}:{' '}
                  {visitTypeById.get(selectedTemplate.visitTypeId) ??
                    selectedTemplate.visitTypeId}
                </p>
              ) : null}
              <label>
                {t('templateAutoAssign.titlePrefix')}
                <input
                  value={form.titlePrefix}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      titlePrefix: event.target.value,
                    }))
                  }
                  placeholder={t('templateAutoAssign.titlePrefixPlaceholder')}
                />
              </label>
              <p className="table-help">{t('templateAutoAssign.titlePrefixHelp')}</p>
              <div className="planner-switch">
                <YallaSwitch
                  on={form.enabled}
                  disabled={isSaving}
                  label={
                    form.enabled
                      ? t('bookingsSettings.on')
                      : t('bookingsSettings.off')
                  }
                  onToggle={() =>
                    setForm((current) => ({
                      ...current,
                      enabled: !current.enabled,
                    }))
                  }
                />
                <span>
                  {form.enabled
                    ? t('bookingsSettings.on')
                    : t('bookingsSettings.off')}
                </span>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setIsFormOpen(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={isSaving}
                onClick={submitForm}
              >
                {isSaving ? t('operations.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
