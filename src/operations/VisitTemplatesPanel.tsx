import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type Ref,
} from 'react'
import { useTranslation } from 'react-i18next'
import { getVisitTemplates, saveVisitTemplate } from './api'
import { filterPropertySelectOptions, getPropertyLabel, sortPropertyOptions } from './propertyHelpers'
import { sortVisitTypes } from './visitTypeHelpers'
import { resolveTeamIdForVisitType } from './visitTypeIds'
import {
  emptyTemplateForm,
  mapVisitTemplate,
} from './visitTemplateHelpers'
import type {
  PropertyOption,
  TeamRecord,
  UserRecord,
  VisitTemplateRecord,
  VisitTypeRecord,
} from './types'

type TemplateFilters = {
  propertyIds: string[]
  teamIds: string[]
  visitTypeIds: string[]
}

const emptyTemplateFilters = (): TemplateFilters => ({
  propertyIds: [],
  teamIds: [],
  visitTypeIds: [],
})

const toggleListValue = (values: string[], value: string) =>
  values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value]

type Props = {
  getVisitTemplatesEndpoint?: string
  upsertVisitTemplateEndpoint?: string
  propertyOptions: PropertyOption[]
  teams: TeamRecord[]
  users: UserRecord[]
  visitTypes: VisitTypeRecord[]
  onMessage: (message: string) => void
  onError: (message: string) => void
  hideSectionHeader?: boolean
  searchQuery?: string
  onFilterCountChange?: (count: number) => void
}

export type VisitTemplatesPanelHandle = {
  refresh: () => Promise<void>
  openCreate: () => void
  openFilters: () => void
}

export const VisitTemplatesPanel = forwardRef(function VisitTemplatesPanel(
  {
    getVisitTemplatesEndpoint,
    upsertVisitTemplateEndpoint,
    propertyOptions,
    teams,
    users,
    visitTypes,
    onMessage,
    onError,
    hideSectionHeader = false,
    searchQuery = '',
    onFilterCountChange,
  }: Props,
  ref: Ref<VisitTemplatesPanelHandle>,
) {
  const { t } = useTranslation()
  const [filters, setFilters] = useState<TemplateFilters>(emptyTemplateFilters)
  const [filterDraft, setFilterDraft] = useState<TemplateFilters>(
    emptyTemplateFilters,
  )
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [nameSort, setNameSort] = useState<'asc' | 'desc' | null>(null)
  const [templates, setTemplates] = useState<VisitTemplateRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm())

  const sortedPropertyOptions = useMemo(
    () => sortPropertyOptions(propertyOptions),
    [propertyOptions],
  )
  const filterPropertyOptions = useMemo(
    () => filterPropertySelectOptions(propertyOptions),
    [propertyOptions],
  )

  const propertyById = useMemo(
    () =>
      new Map(
        propertyOptions.map((property) => [property.id, getPropertyLabel(property)]),
      ),
    [propertyOptions],
  )
  const sortedVisitTypes = useMemo(() => sortVisitTypes(visitTypes), [visitTypes])

  const visitTypeById = useMemo(
    () => new Map(visitTypes.map((type) => [type.id, type.name])),
    [visitTypes],
  )
  const teamById = useMemo(
    () => new Map(teams.map((team) => [team.id, team.name])),
    [teams],
  )

  const teamUsers = useMemo(() => {
    if (!templateForm.teamId) return users
    return users.filter((user) => user.teamId === templateForm.teamId)
  }, [users, templateForm.teamId])

  const loadTemplates = useCallback(async () => {
    if (!getVisitTemplatesEndpoint) {
      onError(
        'Missing get visit templates endpoint (VITE_GET_VISIT_TEMPLATES_URL).',
      )
      return
    }
    setIsLoading(true)
    try {
      const payload = await getVisitTemplates(getVisitTemplatesEndpoint, {
        includeInactive: true,
      })
      const items = (payload.items ?? []).map((entry) =>
        mapVisitTemplate(entry as unknown as Record<string, unknown>),
      )
      setTemplates(items)
    } catch (loadError) {
      onError(
        loadError instanceof Error
          ? loadError.message
          : 'Unable to load visit templates.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [getVisitTemplatesEndpoint, onError])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const openCreateTemplate = () => {
    setTemplateForm({
      ...emptyTemplateForm(),
      propertyId: filters.propertyIds[0] ?? '',
    })
    setIsFormOpen(true)
  }

  useImperativeHandle(ref, () => ({
    refresh: loadTemplates,
    openCreate: openCreateTemplate,
    openFilters: () => {
      setFilterDraft({
        propertyIds: [...filters.propertyIds],
        teamIds: [...filters.teamIds],
        visitTypeIds: [...filters.visitTypeIds],
      })
      setIsFilterOpen(true)
    },
  }))

  const openEditTemplate = (template: VisitTemplateRecord) => {
    setTemplateForm({
      id: template.id,
      name: template.name,
      propertyId: template.propertyId,
      visitTypeId: template.visitTypeId,
      teamId: template.teamId,
      assignedUserId: template.assignedUserId,
      title: template.title,
      description: template.description,
      scheduledStartTime: template.scheduledStartTime,
      scheduledEndTime: template.scheduledEndTime,
      estimatedDurationMinutes: template.estimatedDurationMinutes
        ? String(template.estimatedDurationMinutes)
        : '',
      tasks:
        template.tasks.length > 0
          ? template.tasks.map((task) => ({
              title: task.title,
              titleEs: task.titleEs ?? '',
              description: task.description,
              urgent: Boolean(task.urgent || task.priority === 'URGENT'),
            }))
          : [{ title: '', titleEs: '', description: '', urgent: false }],
    })
    setIsFormOpen(true)
  }

  const openDuplicateTemplate = (template: VisitTemplateRecord) => {
    setTemplateForm({
      id: '',
      name: `${template.name} (copy)`,
      propertyId: '',
      visitTypeId: template.visitTypeId,
      teamId: template.teamId,
      assignedUserId: template.assignedUserId,
      title: template.title,
      description: template.description,
      scheduledStartTime: template.scheduledStartTime,
      scheduledEndTime: template.scheduledEndTime,
      estimatedDurationMinutes: template.estimatedDurationMinutes
        ? String(template.estimatedDurationMinutes)
        : '',
      tasks:
        template.tasks.length > 0
          ? template.tasks.map((task) => ({
              title: task.title,
              titleEs: task.titleEs ?? '',
              description: task.description,
              urgent: Boolean(task.urgent || task.priority === 'URGENT'),
            }))
          : [{ title: '', titleEs: '', description: '', urgent: false }],
    })
    setIsFormOpen(true)
  }

  const handleVisitTypeChange = (visitTypeId: string) => {
    const visitType = visitTypes.find((entry) => entry.id === visitTypeId)
    const property = propertyOptions.find(
      (entry) => entry.id === templateForm.propertyId,
    )
    setTemplateForm((current) => ({
      ...current,
      visitTypeId,
      teamId: resolveTeamIdForVisitType(visitType, teams, current.teamId),
      assignedUserId: '',
      estimatedDurationMinutes: visitType?.defaultDurationMinutes
        ? String(visitType.defaultDurationMinutes)
        : current.estimatedDurationMinutes,
      title:
        current.title.trim() ||
        `${visitType?.name ?? 'Visit'} - ${
          property?.listingNickname || property?.nickname || 'Property'
        }`,
    }))
  }

  const submitTemplate = async () => {
    if (!upsertVisitTemplateEndpoint) {
      onError(
        'Missing upsert visit template endpoint (VITE_UPSERT_VISIT_TEMPLATE_URL).',
      )
      return
    }
    const payload: Record<string, unknown> = {
      id: templateForm.id || undefined,
      name: templateForm.name.trim(),
      propertyId: templateForm.propertyId,
      visitTypeId: templateForm.visitTypeId,
      teamId: templateForm.teamId,
      assignedUserId: templateForm.assignedUserId,
      title: templateForm.title.trim(),
      description: templateForm.description,
      scheduledStartTime: templateForm.scheduledStartTime,
      scheduledEndTime: templateForm.scheduledEndTime,
      tasks: templateForm.tasks
        .filter((task) => task.title.trim())
        .map((task, index) => ({
          title: task.title.trim(),
          titleEs: task.titleEs?.trim() || undefined,
          description: task.description,
          priority: task.urgent ? 'URGENT' : 'MEDIUM',
          urgent: task.urgent,
          sortOrder: index + 1,
        })),
    }
    if (templateForm.estimatedDurationMinutes) {
      payload.estimatedDurationMinutes = Number(
        templateForm.estimatedDurationMinutes,
      )
    }
    try {
      await saveVisitTemplate(upsertVisitTemplateEndpoint, payload)
      setIsFormOpen(false)
      onMessage(templateForm.id ? 'Template updated.' : 'Template created.')
      await loadTemplates()
    } catch (saveError) {
      onError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to save visit template.',
      )
    }
  }

  const deactivateTemplate = async (template: VisitTemplateRecord) => {
    if (!upsertVisitTemplateEndpoint) return
    try {
      await saveVisitTemplate(upsertVisitTemplateEndpoint, {
        id: template.id,
        active: false,
      })
      onMessage('Template deactivated.')
      await loadTemplates()
    } catch (saveError) {
      onError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to deactivate template.',
      )
    }
  }

  const reactivateTemplate = async (template: VisitTemplateRecord) => {
    if (!upsertVisitTemplateEndpoint) return
    try {
      await saveVisitTemplate(upsertVisitTemplateEndpoint, {
        id: template.id,
        active: true,
      })
      onMessage('Template reactivated.')
      await loadTemplates()
    } catch (saveError) {
      onError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to reactivate template.',
      )
    }
  }

  const filteredTemplates = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    let next = templates

    if (filters.propertyIds.length > 0) {
      const selected = new Set(filters.propertyIds)
      next = next.filter((template) => {
        const ids = [template.propertyId, ...(template.propertyIds ?? [])]
        return ids.some((id) => selected.has(id))
      })
    }
    if (filters.teamIds.length > 0) {
      const selected = new Set(filters.teamIds)
      next = next.filter((template) => selected.has(template.teamId))
    }
    if (filters.visitTypeIds.length > 0) {
      const selected = new Set(filters.visitTypeIds)
      next = next.filter((template) => selected.has(template.visitTypeId))
    }
    if (query) {
      next = next.filter((template) => {
        const propertyLabel =
          propertyById.get(template.propertyId) ?? template.propertyId
        const visitTypeLabel =
          visitTypeById.get(template.visitTypeId) ?? template.visitTypeId
        const teamLabel = teamById.get(template.teamId) ?? template.teamId
        return (
          template.name.toLowerCase().includes(query) ||
          propertyLabel.toLowerCase().includes(query) ||
          visitTypeLabel.toLowerCase().includes(query) ||
          teamLabel.toLowerCase().includes(query) ||
          template.title.toLowerCase().includes(query) ||
          template.description.toLowerCase().includes(query)
        )
      })
    }
    if (nameSort) {
      next = [...next].sort((left, right) => {
        const compare = left.name.localeCompare(right.name, undefined, {
          sensitivity: 'base',
        })
        return nameSort === 'asc' ? compare : -compare
      })
    }
    return next
  }, [
    filters.propertyIds,
    filters.teamIds,
    filters.visitTypeIds,
    nameSort,
    propertyById,
    searchQuery,
    teamById,
    templates,
    visitTypeById,
  ])

  const activeFilterCount =
    filters.propertyIds.length + filters.teamIds.length + filters.visitTypeIds.length

  useEffect(() => {
    onFilterCountChange?.(activeFilterCount)
  }, [activeFilterCount, onFilterCountChange])

  return (
    <>
      <section className="card">
        {hideSectionHeader ? null : (
          <div className="page-header">
            <div>
              <h2 className="section-title">Visit templates</h2>
              <p className="subtitle">
                Reusable visit and task presets per property. Applying a template
                pre-fills a new visit; you still choose the date before saving.
              </p>
            </div>
            <div className="header-actions">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => void loadTemplates()}
              >
                Refresh
              </button>
              <button className="btn-primary" type="button" onClick={openCreateTemplate}>
                Create template
              </button>
            </div>
          </div>
        )}

        {isLoading ? <p>Loading templates…</p> : null}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">
                  <button
                    className={`btn-sort ${nameSort ? 'is-active' : ''}`}
                    type="button"
                    onClick={() =>
                      setNameSort((current) =>
                        current === 'asc' ? 'desc' : 'asc',
                      )
                    }
                  >
                    {t('common.name')}
                    <span className="sort-indicator">
                      {nameSort === 'asc' ? '▲' : nameSort === 'desc' ? '▼' : '↕'}
                    </span>
                  </button>
                </th>
                <th>{t('operations.property')}</th>
                <th>{t('operations.visitType')}</th>
                <th>{t('operations.team')}</th>
                <th>{t('operations.tasks')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredTemplates.length === 0 ? (
                <tr>
                  <td colSpan={7}>No templates found.</td>
                </tr>
              ) : (
                filteredTemplates.map((template) => (
                  <tr key={template.id} className={template.active ? '' : 'muted-row'}>
                    <td>{template.name}</td>
                    <td>{propertyById.get(template.propertyId) ?? template.propertyId}</td>
                    <td>
                      {visitTypeById.get(template.visitTypeId) ?? template.visitTypeId}
                    </td>
                    <td>{teamById.get(template.teamId) ?? template.teamId}</td>
                    <td>{template.tasks.length}</td>
                    <td>{template.active ? 'Active' : 'Inactive'}</td>
                    <td>
                      <div className="action-buttons">
                        <button
                          type="button"
                          className="btn-icon btn-icon-ghost"
                          aria-label={t('operations.editTemplate')}
                          title={t('operations.editTemplate')}
                          onClick={() => openEditTemplate(template)}
                        >
                          <span aria-hidden="true">✎</span>
                        </button>
                        <button
                          type="button"
                          className="btn-icon btn-icon-ghost"
                          aria-label={t('operations.duplicateTemplate')}
                          title={t('operations.duplicateTemplate')}
                          onClick={() => openDuplicateTemplate(template)}
                        >
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 20 20"
                            width="16"
                            height="16"
                          >
                            <path
                              d="M7 3h10v10h-2V5H7V3zm-4 4h10v10H3V7zm2 2v6h6V9H5z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                        {template.active ? (
                          <button
                            type="button"
                            className="btn-icon btn-icon-ghost"
                            aria-label={t('operations.deactivateTemplate')}
                            title={t('operations.deactivateTemplate')}
                            onClick={() => void deactivateTemplate(template)}
                          >
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 20 20"
                              width="16"
                              height="16"
                            >
                              <path
                                d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm3.5 10.9L8.9 6.5 6.5 8.9l4.6 4.6 2.4-2.4z"
                                fill="currentColor"
                              />
                            </svg>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-icon btn-icon-ghost"
                            aria-label={t('operations.reactivateTemplate')}
                            title={t('operations.reactivateTemplate')}
                            onClick={() => void reactivateTemplate(template)}
                          >
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 20 20"
                              width="16"
                              height="16"
                            >
                              <path
                                d="M10 3a7 7 0 1 0 6.3 4H14a5 5 0 1 1-4 8.5V13l4 3-4 3v-2.2A7 7 0 0 0 10 3z"
                                fill="currentColor"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isFilterOpen ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">{t('common.filters')}</h3>
                <p className="modal-subtitle">{t('operations.filterSubtitle')}</p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsFilterOpen(false)}
                aria-label={t('common.closeFilters')}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="filter-grid">
                <div className="filter-group">
                  <p className="filter-title">{t('operations.property')}</p>
                  <div className="filter-options filter-options-scroll">
                    {filterPropertyOptions.map((property) => {
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
                    {teams.map((team) => {
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
                <div className="filter-group">
                  <p className="filter-title">{t('operations.visitType')}</p>
                  <div className="filter-options filter-options-scroll">
                    {sortedVisitTypes.map((type) => {
                      const isChecked = filterDraft.visitTypeIds.includes(type.id)
                      return (
                        <label className="filter-option" key={type.id}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() =>
                              setFilterDraft((current) => ({
                                ...current,
                                visitTypeIds: toggleListValue(
                                  current.visitTypeIds,
                                  type.id,
                                ),
                              }))
                            }
                          />
                          <span>{type.name}</span>
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
                onClick={() => setFilterDraft(emptyTemplateFilters())}
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
                    visitTypeIds: [...filterDraft.visitTypeIds],
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
          <div className="modal modal-wide modal-scrollable">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {templateForm.id ? 'Edit template' : 'Create template'}
                </h3>
                <p className="modal-subtitle">
                  {templateForm.tasks.length} task
                  {templateForm.tasks.length === 1 ? '' : 's'} in this template.
                  Add or remove tasks below, then save.
                </p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsFormOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body form-grid">
              <label>
                Template name
                <input
                  value={templateForm.name}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="e.g. Property check"
                />
              </label>
              <label>
                Property
                <select
                  value={templateForm.propertyId}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      propertyId: event.target.value,
                    }))
                  }
                >
                  <option value="">Select property</option>
                  {sortedPropertyOptions.map((property) => (
                    <option key={property.id} value={property.id}>
                      {getPropertyLabel(property)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Visit type
                <select
                  value={templateForm.visitTypeId}
                  onChange={(event) => handleVisitTypeChange(event.target.value)}
                >
                  <option value="">Select type</option>
                  {sortedVisitTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Team
                <select
                  value={templateForm.teamId}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      teamId: event.target.value,
                      assignedUserId: '',
                    }))
                  }
                >
                  <option value="">Select team</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Default assignee
                <select
                  value={templateForm.assignedUserId}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      assignedUserId: event.target.value,
                    }))
                  }
                >
                  <option value="">Unassigned</option>
                  {teamUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Default start
                <input
                  type="time"
                  value={templateForm.scheduledStartTime}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      scheduledStartTime: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Default end
                <input
                  type="time"
                  value={templateForm.scheduledEndTime}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      scheduledEndTime: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Visit title
                <input
                  value={templateForm.title}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="full-width">
                Description
                <textarea
                  value={templateForm.description}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Est. duration (min)
                <input
                  type="number"
                  value={templateForm.estimatedDurationMinutes}
                  onChange={(event) =>
                    setTemplateForm((current) => ({
                      ...current,
                      estimatedDurationMinutes: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="full-width template-tasks-editor">
                <h4>Template tasks</h4>
                <p className="subtitle">{t('operations.templateTaskTitleEsHint')}</p>
                {templateForm.tasks.map((task, index) => (
                  <div key={`task-${index}`} className="template-task-row">
                    <input
                      placeholder={t('operations.taskTitle')}
                      value={task.title}
                      onChange={(event) =>
                        setTemplateForm((current) => ({
                          ...current,
                          tasks: current.tasks.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, title: event.target.value }
                              : entry,
                          ),
                        }))
                      }
                    />
                    <input
                      placeholder={t('operations.taskTitleEs')}
                      value={task.titleEs ?? ''}
                      onChange={(event) =>
                        setTemplateForm((current) => ({
                          ...current,
                          tasks: current.tasks.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, titleEs: event.target.value }
                              : entry,
                          ),
                        }))
                      }
                    />
                    <input
                      placeholder={t('operations.description')}
                      value={task.description}
                      onChange={(event) =>
                        setTemplateForm((current) => ({
                          ...current,
                          tasks: current.tasks.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, description: event.target.value }
                              : entry,
                          ),
                        }))
                      }
                    />
                    <label className="checkbox-row compact">
                      <input
                        type="checkbox"
                        checked={task.urgent}
                        onChange={(event) =>
                          setTemplateForm((current) => ({
                            ...current,
                            tasks: current.tasks.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, urgent: event.target.checked }
                                : entry,
                            ),
                          }))
                        }
                      />
                      Urgent
                    </label>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() =>
                        setTemplateForm((current) => ({
                          ...current,
                          tasks: current.tasks.filter(
                            (_, entryIndex) => entryIndex !== index,
                          ),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() =>
                    setTemplateForm((current) => ({
                      ...current,
                      tasks: [
                        ...current.tasks,
                        {
                          title: '',
                          titleEs: '',
                          description: '',
                          urgent: false,
                        },
                      ],
                    }))
                  }
                >
                  Add task
                </button>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn-primary"
                onClick={() => void submitTemplate()}
              >
                Save template
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
})
