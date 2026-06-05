import { useCallback, useEffect, useMemo, useState } from 'react'
import { getVisitTemplates, saveVisitTemplate } from './api'
import { getPropertyLabel, sortPropertyOptions } from './propertyHelpers'
import { sortVisitTypes } from './visitTypeHelpers'
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

type Props = {
  getVisitTemplatesEndpoint?: string
  upsertVisitTemplateEndpoint?: string
  propertyOptions: PropertyOption[]
  teams: TeamRecord[]
  users: UserRecord[]
  visitTypes: VisitTypeRecord[]
  onMessage: (message: string) => void
  onError: (message: string) => void
}

export function VisitTemplatesPanel({
  getVisitTemplatesEndpoint,
  upsertVisitTemplateEndpoint,
  propertyOptions,
  teams,
  users,
  visitTypes,
  onMessage,
  onError,
}: Props) {
  const [filterPropertyId, setFilterPropertyId] = useState('')
  const [templates, setTemplates] = useState<VisitTemplateRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm())

  const sortedPropertyOptions = useMemo(
    () => sortPropertyOptions(propertyOptions),
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
        propertyId: filterPropertyId || undefined,
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
  }, [filterPropertyId, getVisitTemplatesEndpoint, onError])

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const openCreateTemplate = () => {
    setTemplateForm({
      ...emptyTemplateForm(),
      propertyId: filterPropertyId,
    })
    setIsFormOpen(true)
  }

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
              description: task.description,
              urgent: Boolean(task.urgent || task.priority === 'URGENT'),
            }))
          : [{ title: '', description: '', urgent: false }],
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
              description: task.description,
              urgent: Boolean(task.urgent || task.priority === 'URGENT'),
            }))
          : [{ title: '', description: '', urgent: false }],
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
      teamId: visitType?.defaultTeamId ?? current.teamId,
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
    if (!filterPropertyId) {
      return templates
    }
    return templates.filter((template) => template.propertyId === filterPropertyId)
  }, [filterPropertyId, templates])

  return (
    <>
      <section className="card">
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

        <div className="filters-row">
          <label>
            Property
            <select
              value={filterPropertyId}
              onChange={(event) => setFilterPropertyId(event.target.value)}
            >
              <option value="">All properties</option>
              {sortedPropertyOptions.map((property) => (
                <option key={property.id} value={property.id}>
                  {getPropertyLabel(property)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isLoading ? <p>Loading templates…</p> : null}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Property</th>
                <th>Visit type</th>
                <th>Team</th>
                <th>Tasks</th>
                <th>Status</th>
                <th>Actions</th>
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
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => openEditTemplate(template)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-link"
                        onClick={() => openDuplicateTemplate(template)}
                      >
                        Duplicate
                      </button>
                      {template.active ? (
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => void deactivateTemplate(template)}
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => void reactivateTemplate(template)}
                        >
                          Reactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

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
                {templateForm.tasks.map((task, index) => (
                  <div key={`task-${index}`} className="template-task-row">
                    <input
                      placeholder="Task title"
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
                      placeholder="Description"
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
}
