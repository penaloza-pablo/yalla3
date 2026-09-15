import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { YallaSwitch } from '../bookings/YallaSwitch'
import { useConfirm } from '../design/ConfirmDialog'
import { YlIcon } from '../design/icons'
import {
  getJobScheduler,
  getVisitTemplates,
  saveJobSchedulerRule,
  saveVisit,
} from './api'
import { formatDateOnlyLabel, getTodayMadrid } from './dateHelpers'
import {
  filterTemplateAutoAssignPropertyOptions,
  getPropertyLabel,
  sortPropertyOptions,
} from './propertyHelpers'
import {
  activeTemplatesForProperty,
  mapVisitTemplate,
  templateTasksPayload,
} from './visitTemplateHelpers'
import type {
  JobSchedulerRule,
  JobSchedulerRuleStatus,
  PropertyOption,
  VisitTemplateRecord,
} from './types'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
}

type RuleForm = {
  id: string
  propertyId: string
  name: string
  intervalDays: string
  templateIds: string[]
  createTemplateId: string
  enabled: boolean
}

type CreateForm = {
  ruleId: string
  propertyId: string
  templateId: string
  dateMode: 'cleaning' | 'manual'
  cleaningDate: string
  manualDate: string
}

type ProgressTone = 'ok' | 'soon' | 'overdue'

const emptyRuleForm = (): RuleForm => ({
  id: '',
  propertyId: '',
  name: '',
  intervalDays: '30',
  templateIds: [],
  createTemplateId: '',
  enabled: true,
})

const emptyCreateForm = (): CreateForm => ({
  ruleId: '',
  propertyId: '',
  templateId: '',
  dateMode: 'cleaning',
  cleaningDate: '',
  manualDate: '',
})

const emptyStatus = (): JobSchedulerRuleStatus => ({
  lastCompletedDate: null,
  lastCompletedVisitId: null,
  lastCompletedVisitTitle: null,
  daysSince: null,
  isOverdue: true,
  isScheduled: false,
  nextScheduledDate: null,
  dueDate: null,
})

const toggleListValue = (values: string[], value: string) =>
  values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value]

const isScheduledRule = (
  rule: JobSchedulerRule,
  status: JobSchedulerRuleStatus,
) => rule.enabled && status.isScheduled

const isWarningRule = (
  rule: JobSchedulerRule,
  status: JobSchedulerRuleStatus,
) => rule.enabled && status.isOverdue && !status.isScheduled

const progressForRule = (
  rule: JobSchedulerRule,
  status: JobSchedulerRuleStatus,
  warning: boolean,
) => {
  const interval = Math.max(1, rule.intervalDays)
  const elapsed = status.daysSince
  const remaining = elapsed === null ? 0 : interval - elapsed
  const ratio =
    elapsed === null ? 1 : Math.min(1, Math.max(0, elapsed / interval))
  const percent = warning ? 100 : Math.round(ratio * 100)
  const tone: ProgressTone = warning
    ? 'overdue'
    : remaining <= 2
      ? 'soon'
      : 'ok'
  return { percent, tone, remaining, interval, elapsed }
}

export function JobSchedulerView({ getEndpoint, propertyOptions }: Props) {
  const { t, i18n } = useTranslation()
  const confirmAction = useConfirm()
  const locale = i18n.language
  const endpoints = useMemo(
    () => ({
      list: getEndpoint('getJobSchedulerUrl'),
      upsert: getEndpoint('upsertJobSchedulerRuleUrl'),
      templates: getEndpoint(
        'getVisitTemplatesUrl',
        import.meta.env.VITE_GET_VISIT_TEMPLATES_URL,
      ),
      upsertVisit: getEndpoint(
        'upsertVisitUrl',
        import.meta.env.VITE_UPSERT_VISIT_URL,
      ),
    }),
    [getEndpoint],
  )

  const [rules, setRules] = useState<JobSchedulerRule[]>([])
  const [statuses, setStatuses] = useState<Record<string, JobSchedulerRuleStatus>>(
    {},
  )
  const [upcomingCleaningDates, setUpcomingCleaningDates] = useState<
    Record<string, string[]>
  >({})
  const [templates, setTemplates] = useState<VisitTemplateRecord[]>([])
  const [today, setToday] = useState(getTodayMadrid)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [showEmptyProperties, setShowEmptyProperties] = useState(true)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [form, setForm] = useState<RuleForm>(emptyRuleForm)
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm)

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
  const rulesByProperty = useMemo(() => {
    const grouped = new Map<string, JobSchedulerRule[]>()
    for (const rule of rules) {
      const current = grouped.get(rule.propertyId) ?? []
      current.push(rule)
      grouped.set(rule.propertyId, current)
    }
    for (const [propertyId, propertyRules] of grouped) {
      grouped.set(
        propertyId,
        [...propertyRules].sort((left, right) =>
          left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
        ),
      )
    }
    return grouped
  }, [rules])

  const formTemplates = useMemo(() => {
    const active = activeTemplatesForProperty(templates, form.propertyId)
    const byId = new Map(active.map((template) => [template.id, template]))
    for (const templateId of form.templateIds) {
      const extra = templateById.get(templateId)
      if (extra && !byId.has(templateId)) {
        byId.set(templateId, extra)
      }
    }
    return [...byId.values()]
  }, [form.propertyId, form.templateIds, templateById, templates])

  const load = useCallback(async () => {
    if (!endpoints.list) {
      setError(t('jobScheduler.missingEndpoint'))
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const scheduler = await getJobScheduler(endpoints.list)
      setRules(scheduler.rules)
      setStatuses(scheduler.statuses)
      setUpcomingCleaningDates(scheduler.upcomingCleaningDates)
      setToday(scheduler.today || getTodayMadrid())
      if (endpoints.templates) {
        try {
          const templatesPayload = await getVisitTemplates(endpoints.templates, {
            includeInactive: true,
          })
          setTemplates(
            (templatesPayload.items ?? []).map((entry) =>
              mapVisitTemplate(entry as unknown as Record<string, unknown>),
            ),
          )
        } catch {
          setTemplates([])
        }
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error && loadError.message
          ? loadError.message
          : t('jobScheduler.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [endpoints.list, endpoints.templates, t])

  useEffect(() => {
    void load()
  }, [load])

  const visibleProperties = useMemo(() => {
    const query = search.trim().toLowerCase()
    return properties.filter((property) => {
      const propertyRules = rulesByProperty.get(property.id) ?? []
      if (!showEmptyProperties && propertyRules.length === 0 && rules.length > 0) {
        return false
      }
      if (overdueOnly) {
        const hasWarning = propertyRules.some((rule) =>
          isWarningRule(rule, statuses[rule.id] ?? emptyStatus()),
        )
        if (!hasWarning) {
          return false
        }
      }
      if (!query) {
        return true
      }
      const haystack = [
        getPropertyLabel(property),
        ...propertyRules.map((rule) => rule.name),
        ...propertyRules.flatMap((rule) =>
          rule.templateIds.map(
            (templateId) => templateById.get(templateId)?.name ?? '',
          ),
        ),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [
    overdueOnly,
    properties,
    rules.length,
    rulesByProperty,
    search,
    showEmptyProperties,
    statuses,
    templateById,
  ])

  const openCreateRule = (propertyId = '') => {
    setForm({
      ...emptyRuleForm(),
      propertyId,
    })
    setIsFormOpen(true)
    setMessage(null)
  }

  const openEditRule = (rule: JobSchedulerRule) => {
    setForm({
      id: rule.id,
      propertyId: rule.propertyId,
      name: rule.name,
      intervalDays: String(rule.intervalDays),
      templateIds: [...rule.templateIds],
      createTemplateId: rule.createTemplateId,
      enabled: rule.enabled,
    })
    setIsFormOpen(true)
    setMessage(null)
  }

  const openCreateVisit = (rule: JobSchedulerRule) => {
    const dates = upcomingCleaningDates[rule.propertyId] ?? []
    const needsTemplatePick = rule.templateIds.length > 1
    setCreateForm({
      ruleId: rule.id,
      propertyId: rule.propertyId,
      templateId: needsTemplatePick
        ? ''
        : rule.createTemplateId || rule.templateIds[0] || '',
      dateMode: dates.length > 0 ? 'cleaning' : 'manual',
      cleaningDate: dates[0] ?? '',
      manualDate: today,
    })
    setIsCreateOpen(true)
    setMessage(null)
  }

  const saveRule = async (payload: Record<string, unknown>) => {
    if (!endpoints.upsert) {
      setError(t('jobScheduler.missingWrite'))
      return false
    }
    await saveJobSchedulerRule(endpoints.upsert, payload)
    await load()
    return true
  }

  const submitRule = async () => {
    const propertyId = form.propertyId.trim()
    const name = form.name.trim()
    const intervalDays = Number(form.intervalDays)
    const templateIds = form.templateIds.filter(Boolean)
    const createTemplateId =
      form.createTemplateId.trim() || templateIds[0] || ''
    if (
      !propertyId ||
      !name ||
      !Number.isInteger(intervalDays) ||
      intervalDays < 1 ||
      templateIds.length === 0 ||
      !createTemplateId
    ) {
      setError(t('jobScheduler.required'))
      return
    }
    if (!templateIds.includes(createTemplateId)) {
      setError(t('jobScheduler.createTemplateRequired'))
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await saveRule({
        id: form.id || undefined,
        propertyId,
        name,
        intervalDays,
        templateIds,
        createTemplateId,
        enabled: form.enabled,
      })
      setIsFormOpen(false)
      setMessage(
        t(form.id ? 'jobScheduler.updated' : 'jobScheduler.created'),
      )
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message
          ? saveError.message
          : t('jobScheduler.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const deleteRule = async (rule: { id: string; name: string }) => {
    const confirmed = await confirmAction({
      title: t('jobScheduler.delete'),
      message: t('jobScheduler.deleteConfirm', { name: rule.name }),
      destructive: true,
    })
    if (!confirmed) {
      return false
    }
    setError(null)
    try {
      await saveRule({ id: rule.id, action: 'delete' })
      setMessage(t('jobScheduler.deleted'))
      return true
    } catch (saveError) {
      setError(
        saveError instanceof Error && saveError.message
          ? saveError.message
          : t('jobScheduler.saveError'),
      )
      return false
    }
  }

  const deleteRuleFromForm = async () => {
    if (!form.id) {
      return
    }
    const deleted = await deleteRule({ id: form.id, name: form.name })
    if (deleted) {
      setIsFormOpen(false)
    }
  }

  const submitCreateVisit = async () => {
    if (!endpoints.upsertVisit) {
      setError(t('jobScheduler.missingVisitWrite'))
      return
    }
    const template = templateById.get(createForm.templateId)
    if (!template) {
      setError(t('jobScheduler.selectTemplate'))
      return
    }
    const scheduledDate =
      createForm.dateMode === 'cleaning'
        ? createForm.cleaningDate.trim()
        : createForm.manualDate.trim()
    if (!scheduledDate) {
      setError(t('jobScheduler.dateRequired'))
      return
    }
    setIsCreating(true)
    setError(null)
    try {
      await saveVisit(endpoints.upsertVisit, {
        propertyId: createForm.propertyId,
        visitTypeId: template.visitTypeId,
        teamId: template.teamId,
        assignedUserId: template.assignedUserId,
        scheduledDate,
        scheduledStartTime: template.scheduledStartTime,
        scheduledEndTime: template.scheduledEndTime,
        title: template.title || template.name,
        description: template.description,
        estimatedDurationMinutes: template.estimatedDurationMinutes,
        appliesToHourBank: template.appliesToHourBank,
        sourceTemplateId: template.id,
        tasks: templateTasksPayload(template),
      })
      setIsCreateOpen(false)
      setMessage(t('jobScheduler.visitCreated'))
      await load()
    } catch (createError) {
      setError(
        createError instanceof Error && createError.message
          ? createError.message
          : t('jobScheduler.visitCreateError'),
      )
    } finally {
      setIsCreating(false)
    }
  }

  const templateLabel = (templateId: string) =>
    templateById.get(templateId)?.name ||
    templateById.get(templateId)?.title ||
    templateId

  const createRule = rules.find((rule) => rule.id === createForm.ruleId)
  const createDates = upcomingCleaningDates[createForm.propertyId] ?? []
  const createTemplateIds = createRule?.templateIds ?? []
  const needsCreateTemplatePick = createTemplateIds.length > 1
  const createTemplateReady = Boolean(createForm.templateId)

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('jobScheduler.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Job scheduler')}</h1>
          </div>
          <p className="subtitle">{t('jobScheduler.subtitle')}</p>
        </div>
        <div className="header-actions">
          <button
            className="btn-ghost"
            type="button"
            aria-label={t('common.refresh')}
            title={t('common.refresh')}
            onClick={() => void load()}
          >
            <YlIcon name="arrow.clockwise" size={16} />
          </button>
          <button
            className="btn-ghost"
            type="button"
            aria-label={t('jobScheduler.add')}
            title={t('jobScheduler.add')}
            onClick={() => openCreateRule()}
          >
            <YlIcon name="plus" size={16} />
          </button>
        </div>
      </header>

      {error ? <p className="notice error">{error}</p> : null}
      {message ? <p className="notice success">{message}</p> : null}

      <section className="card">
        <div className="job-scheduler-toolbar">
          <input
            className="search-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('jobScheduler.search')}
            aria-label={t('jobScheduler.search')}
          />
          <label className="filter-option job-scheduler-filter">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(event) => setOverdueOnly(event.target.checked)}
            />
            {t('jobScheduler.overdueOnly')}
          </label>
          {rules.length > 0 ? (
            <label className="filter-option job-scheduler-filter">
              <input
                type="checkbox"
                checked={showEmptyProperties}
                onChange={(event) => setShowEmptyProperties(event.target.checked)}
              />
              {t('jobScheduler.showEmpty')}
            </label>
          ) : null}
        </div>
        {isLoading ? <p>{t('common.loading')}</p> : null}
        <div className="table-wrap">
          <table className="data-table job-scheduler-table">
            <thead>
              <tr>
                <th>{t('operations.property')}</th>
                <th>{t('jobScheduler.rule')}</th>
                <th>{t('jobScheduler.last')}</th>
                <th
                  className="job-scheduler-meter-head"
                  aria-label={t('jobScheduler.meterColumn')}
                />
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleProperties.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={6}>
                    {rules.length > 0
                      ? t('jobScheduler.emptyFiltered')
                      : t('jobScheduler.empty')}
                  </td>
                </tr>
              ) : (
                visibleProperties.flatMap((property) => {
                  const propertyRules = (
                    rulesByProperty.get(property.id) ?? []
                  ).filter(
                    (rule) =>
                      !overdueOnly ||
                      isWarningRule(rule, statuses[rule.id] ?? emptyStatus()),
                  )
                  const rows =
                    propertyRules.length > 0 ? propertyRules : [null]
                  return rows.map((rule, index) => {
                    const status = rule
                      ? (statuses[rule.id] ?? emptyStatus())
                      : null
                    const warning = Boolean(
                      rule && status && isWarningRule(rule, status),
                    )
                    const scheduled = Boolean(
                      rule && status && isScheduledRule(rule, status),
                    )
                    const progress =
                      rule && status
                        ? progressForRule(rule, status, warning)
                        : null
                    return (
                      <tr
                        key={rule ? rule.id : `${property.id}-empty`}
                        className={`${rule && !rule.enabled ? 'muted-row' : ''} ${
                          warning ? 'job-scheduler-row-overdue' : ''
                        }`.trim()}
                      >
                        {index === 0 ? (
                          <td
                            className="job-scheduler-property-cell"
                            rowSpan={rows.length}
                          >
                            <div className="job-scheduler-property">
                              <button
                                className="job-scheduler-add-rule"
                                type="button"
                                aria-label={t('jobScheduler.addForProperty', {
                                  name: getPropertyLabel(property),
                                })}
                                title={t('jobScheduler.add')}
                                onClick={() => openCreateRule(property.id)}
                              >
                                <YlIcon name="plus" size={10} />
                              </button>
                              <strong>{getPropertyLabel(property)}</strong>
                            </div>
                          </td>
                        ) : null}
                        {rule && status && progress ? (
                          <>
                            <td>
                              <div className="job-scheduler-rule-name">
                                {rule.name}
                              </div>
                              <p className="table-help">
                                {rule.templateIds.map(templateLabel).join(' · ')}
                              </p>
                            </td>
                            <td
                              className={
                                warning ? 'job-scheduler-days is-overdue' : ''
                              }
                            >
                              {status.daysSince === null
                                ? '—'
                                : t('jobScheduler.daysValue', {
                                    count: status.daysSince,
                                  })}
                            </td>
                            <td>
                              <div className="job-scheduler-progress">
                                <div
                                  className={`yl-progress is-${progress.tone}`}
                                  role="progressbar"
                                  aria-valuemin={0}
                                  aria-valuemax={progress.interval}
                                  aria-valuenow={
                                    warning
                                      ? progress.interval
                                      : Math.min(
                                          progress.interval,
                                          progress.elapsed ?? progress.interval,
                                        )
                                  }
                                  aria-label={t('jobScheduler.progressLabel', {
                                    elapsed:
                                      status.daysSince === null
                                        ? t('jobScheduler.never')
                                        : status.daysSince,
                                    interval: rule.intervalDays,
                                  })}
                                >
                                  <span
                                    style={{ width: `${progress.percent}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td>
                              {scheduled ? (
                                <span
                                  className="job-scheduler-tag is-scheduled"
                                  title={
                                    status.nextScheduledDate
                                      ? t('jobScheduler.scheduledOn', {
                                          date: formatDateOnlyLabel(
                                            status.nextScheduledDate,
                                            locale,
                                          ),
                                        })
                                      : undefined
                                  }
                                >
                                  {t('jobScheduler.scheduled')}
                                </span>
                              ) : warning ? (
                                <span className="job-scheduler-tag is-warning">
                                  <YlIcon
                                    name="exclamationmark.triangle"
                                    size={12}
                                  />
                                  {t('jobScheduler.overdue')}
                                </span>
                              ) : (
                                <span className="job-scheduler-tag">
                                  {t('jobScheduler.onTrack')}
                                </span>
                              )}
                            </td>
                            <td>
                              <div className="job-scheduler-actions">
                                <div className="btn-group">
                                  <button
                                    className="btn-icon"
                                    type="button"
                                    aria-label={t('jobScheduler.edit')}
                                    title={t('jobScheduler.edit')}
                                    onClick={() => openEditRule(rule)}
                                  >
                                    <YlIcon name="pencil" size={14} />
                                  </button>
                                  <button
                                    className="btn-icon"
                                    type="button"
                                    aria-label={t('jobScheduler.createVisit')}
                                    title={t('jobScheduler.createVisit')}
                                    onClick={() => openCreateVisit(rule)}
                                  >
                                    <YlIcon name="calendar" size={14} />
                                  </button>
                                </div>
                              </div>
                            </td>
                          </>
                        ) : (
                          <td colSpan={5} className="detail-muted">
                            {t('jobScheduler.noRules')}
                          </td>
                        )}
                      </tr>
                    )
                  })
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
                <h3 className="modal-title">
                  {form.id ? t('jobScheduler.edit') : t('jobScheduler.add')}
                </h3>
                <p className="modal-subtitle">{t('jobScheduler.formHelp')}</p>
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
                      templateIds: [],
                      createTemplateId: '',
                    }))
                  }
                >
                  <option value="">{t('jobScheduler.selectProperty')}</option>
                  {properties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {getPropertyLabel(property)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('jobScheduler.ruleName')}
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder={t('jobScheduler.ruleNamePlaceholder')}
                />
              </label>
              <label>
                {t('jobScheduler.intervalDays')}
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={form.intervalDays}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      intervalDays: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="form-field-span">
                <p className="filter-title">{t('jobScheduler.countTemplates')}</p>
                <p className="table-help">{t('jobScheduler.countTemplatesHelp')}</p>
                <div className="checkbox-list">
                  {form.propertyId ? (
                    formTemplates.length > 0 ? (
                      formTemplates.map((template) => (
                        <label className="filter-option" key={template.id}>
                          <input
                            type="checkbox"
                            checked={form.templateIds.includes(template.id)}
                            onChange={() =>
                              setForm((current) => {
                                const templateIds = toggleListValue(
                                  current.templateIds,
                                  template.id,
                                )
                                return {
                                  ...current,
                                  templateIds,
                                  createTemplateId: templateIds.includes(
                                    current.createTemplateId,
                                  )
                                    ? current.createTemplateId
                                    : templateIds[0] || '',
                                }
                              })
                            }
                          />
                          {template.name || template.title}
                        </label>
                      ))
                    ) : (
                      <p className="detail-muted">
                        {t('operations.noTemplatesForProperty')}
                      </p>
                    )
                  ) : (
                    <p className="detail-muted">
                      {t('jobScheduler.pickPropertyFirst')}
                    </p>
                  )}
                </div>
              </div>
              <div className="form-field-span planner-switch compact job-scheduler-enabled">
                <YallaSwitch
                  on={form.enabled}
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
              {form.id ? (
                <button
                  className="btn-danger modal-footer-start"
                  type="button"
                  onClick={() => void deleteRuleFromForm()}
                >
                  {t('jobScheduler.delete')}
                </button>
              ) : null}
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
                onClick={() => void submitRule()}
              >
                {isSaving ? t('operations.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isCreateOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('jobScheduler.createVisit')}</h3>
                <p className="modal-subtitle">
                  {t('jobScheduler.createVisitHelp', {
                    property:
                      propertyById.get(createForm.propertyId) ??
                      createForm.propertyId,
                    rule: createRule?.name ?? '',
                  })}
                </p>
              </div>
              <button
                className="btn-icon"
                type="button"
                aria-label={t('common.close')}
                onClick={() => setIsCreateOpen(false)}
              >
                <YlIcon name="xmark" size={16} />
              </button>
            </div>
            <div className="modal-body form-grid">
              {needsCreateTemplatePick ? (
                <fieldset className="form-field-span job-scheduler-dates">
                  <legend>{t('jobScheduler.pickTemplateToCreate')}</legend>
                  <div className="filter-options">
                    {createTemplateIds.map((templateId) => (
                      <label className="filter-option" key={templateId}>
                        <input
                          type="radio"
                          name="job-scheduler-template"
                          checked={createForm.templateId === templateId}
                          onChange={() =>
                            setCreateForm((current) => ({
                              ...current,
                              templateId,
                            }))
                          }
                        />
                        {templateLabel(templateId)}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <p className="form-field-span table-help">
                  {t('jobScheduler.usingTemplate', {
                    name: templateLabel(createForm.templateId),
                  })}
                </p>
              )}
              {createTemplateReady ? (
                <fieldset className="form-field-span job-scheduler-dates">
                  <legend>{t('common.date')}</legend>
                  {createDates.length > 0 ? (
                    <div className="filter-options">
                      {createDates.map((date) => (
                        <label className="filter-option" key={date}>
                          <input
                            type="radio"
                            name="job-scheduler-date"
                            checked={
                              createForm.dateMode === 'cleaning' &&
                              createForm.cleaningDate === date
                            }
                            onChange={() =>
                              setCreateForm((current) => ({
                                ...current,
                                dateMode: 'cleaning',
                                cleaningDate: date,
                              }))
                            }
                          />
                          {t('jobScheduler.cleaningDate', {
                            date: formatDateOnlyLabel(date, locale),
                          })}
                        </label>
                      ))}
                      <label className="filter-option">
                        <input
                          type="radio"
                          name="job-scheduler-date"
                          checked={createForm.dateMode === 'manual'}
                          onChange={() =>
                            setCreateForm((current) => ({
                              ...current,
                              dateMode: 'manual',
                            }))
                          }
                        />
                        {t('jobScheduler.manualDate')}
                      </label>
                    </div>
                  ) : (
                    <p className="table-help">{t('jobScheduler.noUpcoming')}</p>
                  )}
                  {createForm.dateMode === 'manual' || createDates.length === 0 ? (
                    <label>
                      {t('jobScheduler.chooseDate')}
                      <input
                        type="date"
                        value={createForm.manualDate}
                        onChange={(event) =>
                          setCreateForm((current) => ({
                            ...current,
                            dateMode: 'manual',
                            manualDate: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ) : null}
                </fieldset>
              ) : null}
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => setIsCreateOpen(false)}
              >
                {t('common.cancel')}
              </button>
              <button
                className="btn-primary"
                type="button"
                disabled={isCreating || !createTemplateReady}
                onClick={() => void submitCreateVisit()}
              >
                {isCreating
                  ? t('operations.saving')
                  : t('jobScheduler.createVisit')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
