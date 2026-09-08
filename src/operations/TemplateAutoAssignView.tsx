import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { YallaSwitch } from '../bookings/YallaSwitch'
import {
  fetchJson,
  getVisitTemplateAutoAssignRules,
  getVisitTemplates,
  mapVisitTemplateAutoAssign,
  saveVisitTemplateAutoAssign,
} from './api'
import {
  filterPropertySelectOptions,
  getPropertyLabel,
  sortPropertyOptions,
} from './propertyHelpers'
import { activeTemplatesForProperty, mapVisitTemplate } from './visitTemplateHelpers'
import type {
  PropertyOption,
  TeamRecord,
  VisitTemplateAutoAssignRule,
  VisitTemplateRecord,
  VisitTypeRecord,
} from './types'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
}

const emptyForm = () => ({
  id: '',
  propertyId: '',
  templateId: '',
  titlePrefix: '',
  enabled: true,
})

export function TemplateAutoAssignView({
  getEndpoint,
  propertyOptions,
}: Props) {
  const { t } = useTranslation()
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
  const [form, setForm] = useState(emptyForm)

  const properties = useMemo(
    () => sortPropertyOptions(filterPropertySelectOptions(propertyOptions)),
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
  const propertyTemplates = useMemo(
    () =>
      form.propertyId
        ? activeTemplatesForProperty(templates, form.propertyId)
        : [],
    [form.propertyId, templates],
  )
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

  const saveRule = async (payload: Record<string, unknown>, successKey: string) => {
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
      setIsFormOpen(false)
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
            className="btn-ghost"
            type="button"
            aria-label={t('templateAutoAssign.add')}
            title={t('templateAutoAssign.add')}
            onClick={openCreate}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16">
              <path d="M9 4h2v5h5v2h-5v5H9v-5H4V9h5V4z" fill="currentColor" />
            </svg>
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
              {sortedRules.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={7}>{t('templateAutoAssign.empty')}</td>
                </tr>
              ) : (
                sortedRules.map((rule) => {
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
                            aria-label={t('common.delete')}
                            title={t('common.delete')}
                            onClick={() => {
                              if (
                                window.confirm(t('templateAutoAssign.deleteConfirm'))
                              ) {
                                void saveRule(
                                  { id: rule.id, action: 'delete' },
                                  'templateAutoAssign.deleted',
                                )
                              }
                            }}
                          >
                            ✕
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

      {isFormOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('templateAutoAssign.add')}</h3>
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
                ✕
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
                  {properties.map((property) => (
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
