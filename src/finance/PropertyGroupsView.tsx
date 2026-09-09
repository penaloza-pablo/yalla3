import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  groupedMemberIdSet,
  isReportGroupType,
  resolveReportGroups,
  slugifyGroupId,
  type ResolvedReportGroup,
} from '../../amplify/functions/shared/property-groups'
import {
  isP2BuildingId,
  isP2RoomListingId,
  yallaAliasForListingId,
} from '../../amplify/functions/shared/property-identity'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { fetchJson } from '../operations/api'
import {
  filterPropertySelectOptions,
  getPropertyLabel,
} from '../operations/propertyHelpers'
import type { PropertyOption } from '../operations/types'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
  isSummaryInfoOpen: boolean
  onToggleSummaryInfo: () => void
  onGroupsChanged: () => Promise<void> | void
}

type FormState = {
  id: string
  name: string
  memberIds: string[]
  system: boolean
}

const emptyForm = (): FormState => ({
  id: '',
  name: '',
  memberIds: [],
  system: false,
})

export function PropertyGroupsView({
  getEndpoint,
  propertyOptions,
  isSummaryInfoOpen,
  onToggleSummaryInfo,
  onGroupsChanged,
}: Props) {
  const { t } = useTranslation()
  const endpoints = useMemo(
    () => ({
      upsert: getEndpoint('upsertPropertyUrl'),
      remove: getEndpoint('deletePropertyUrl'),
    }),
    [getEndpoint],
  )

  const groups = useMemo(
    () => resolveReportGroups(propertyOptions),
    [propertyOptions],
  )
  const memberOwner = useMemo(() => {
    const owners = new Map<string, string>()
    for (const group of groups) {
      for (const memberId of group.memberIds) {
        if (memberId && memberId !== group.id) {
          owners.set(memberId, group.id)
        }
      }
    }
    return owners
  }, [groups])

  const selectableProperties = useMemo(
    () =>
      filterPropertySelectOptions(propertyOptions).filter(
        (property) =>
          !isP2BuildingId(property.id) && !isP2RoomListingId(property.id),
      ),
    [propertyOptions],
  )

  const [form, setForm] = useState<FormState>(emptyForm)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const seededRef = useRef(false)

  const persistGroup = useCallback(
    async (group: { id: string; name: string; memberIds: string[]; system?: boolean }) => {
      if (!endpoints.upsert) {
        throw new Error(t('propertyGroups.missingWrite'))
      }
      await fetchJson(endpoints.upsert, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: group.id,
          title: group.name,
          nickname: group.name,
          listingNickname: group.name,
          type: 'REPORT_GROUP',
          active: true,
          memberIds: group.memberIds,
          system: Boolean(group.system),
        }),
      })
    },
    [endpoints.upsert, t],
  )

  useEffect(() => {
    if (seededRef.current || !endpoints.upsert || propertyOptions.length === 0) {
      return
    }
    const storedIds = new Set(
      propertyOptions
        .filter((property) => isReportGroupType(property.type))
        .map((property) => property.id),
    )
    const missing = groups.filter(
      (group) =>
        !group.system &&
        !storedIds.has(group.id) &&
        group.memberIds.some((id) => id !== group.id),
    )
    if (missing.length === 0) {
      seededRef.current = true
      return
    }
    seededRef.current = true
    void (async () => {
      try {
        for (const group of missing) {
          await persistGroup(group)
        }
        await onGroupsChanged()
      } catch (seedError) {
        seededRef.current = false
        setError(
          seedError instanceof Error
            ? seedError.message
            : t('propertyGroups.saveError'),
        )
      }
    })()
  }, [endpoints.upsert, groups, onGroupsChanged, persistGroup, propertyOptions, t])

  const pickerProperties = useMemo(() => {
    return selectableProperties.filter((property) => {
      const owner = memberOwner.get(property.id)
      return !owner || owner === form.id
    })
  }, [form.id, memberOwner, selectableProperties])

  const memberLabel = (group: ResolvedReportGroup) => {
    const labels = propertyOptions
      .filter(
        (property) =>
          group.memberIds.includes(property.id) && property.id !== group.id,
      )
      .map((property) => getPropertyLabel(property))
    const aliases = group.memberIds
      .filter((id) => id !== group.id)
      .map((id) => yallaAliasForListingId(id))
      .filter(Boolean)
    const unique = [...new Set([...labels, ...aliases].filter(Boolean))]
    return unique.length > 0 ? unique.join(', ') : t('propertyGroups.noMembers')
  }

  const openCreate = () => {
    setForm(emptyForm())
    setIsFormOpen(true)
    setError(null)
    setMessage(null)
  }

  const openEdit = (group: ResolvedReportGroup) => {
    setForm({
      id: group.id,
      name: group.name,
      memberIds: group.memberIds.filter((id) => id !== group.id),
      system: group.system,
    })
    setIsFormOpen(true)
    setError(null)
    setMessage(null)
  }

  const toggleMember = (propertyId: string) => {
    setForm((current) => ({
      ...current,
      memberIds: current.memberIds.includes(propertyId)
        ? current.memberIds.filter((id) => id !== propertyId)
        : [...current.memberIds, propertyId],
    }))
  }

  const saveForm = async () => {
    const name = form.name.trim()
    if (!name) {
      setError(t('propertyGroups.validationName'))
      return
    }
    if (form.memberIds.length === 0) {
      setError(t('propertyGroups.validationMembers'))
      return
    }
    const id = form.id || slugifyGroupId(name)
    if (!id) {
      setError(t('propertyGroups.validationName'))
      return
    }
    const taken = propertyOptions.some(
      (property) =>
        property.id === id &&
        !isReportGroupType(property.type) &&
        !isP2BuildingId(property.id),
    )
    if (taken) {
      setError(t('propertyGroups.idTaken'))
      return
    }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      await persistGroup({
        id,
        name,
        memberIds: form.memberIds,
        system: form.system,
      })
      setIsFormOpen(false)
      setMessage(t('propertyGroups.saved'))
      await onGroupsChanged()
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : t('propertyGroups.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const deleteGroup = async (group: ResolvedReportGroup) => {
    if (group.system) {
      setError(t('propertyGroups.systemLocked'))
      return
    }
    if (!endpoints.remove) {
      setError(t('propertyGroups.missingWrite'))
      return
    }
    if (!window.confirm(t('propertyGroups.confirmDelete', { name: group.name }))) {
      return
    }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      await fetchJson(endpoints.remove, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: group.id }),
      })
      setMessage(t('propertyGroups.deleted'))
      await onGroupsChanged()
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : t('propertyGroups.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('propertyGroups.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Property Groups')}</h1>
            <button
              type="button"
              className={`btn-page-info ${isSummaryInfoOpen ? 'is-active' : ''}`}
              aria-label={
                isSummaryInfoOpen
                  ? t('common.hideSummaryInfo')
                  : t('common.showSummaryInfo')
              }
              aria-expanded={isSummaryInfoOpen}
              onClick={onToggleSummaryInfo}
            >
              i
            </button>
          </div>
          <p className="subtitle">{t('propertyGroups.subtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <div className="header-actions">
              <button className="btn-primary" type="button" onClick={openCreate}>
                {t('propertyGroups.add')}
              </button>
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {isSummaryInfoOpen ? (
        <section className="summary-cards summary-cards-2">
          <article className="summary-card">
            <p className="card-label">{t('propertyGroups.groupsCard')}</p>
            <p className="card-value">{groups.length}</p>
          </article>
          <article className="summary-card">
            <p className="card-label">{t('propertyGroups.membersCard')}</p>
            <p className="card-value">{groupedMemberIdSet(groups).size}</p>
          </article>
        </section>
      ) : null}

      {error ? <p className="notice error">{error}</p> : null}
      {message ? <p className="notice success">{message}</p> : null}

      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">{t('propertyGroups.cardTitle')}</h2>
            <p className="card-subtitle">{t('propertyGroups.cardSubtitle')}</p>
          </div>
          <button className="btn-secondary" type="button" onClick={openCreate}>
            {t('propertyGroups.add')}
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('propertyGroups.name')}</th>
                <th>{t('propertyGroups.members')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 ? (
                <tr>
                  <td colSpan={3}>{t('propertyGroups.empty')}</td>
                </tr>
              ) : (
                groups.map((group) => (
                  <tr key={group.id}>
                    <td>{group.name}</td>
                    <td>{memberLabel(group)}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          className="btn-ghost"
                          type="button"
                          onClick={() => openEdit(group)}
                        >
                          {t('common.edit')}
                        </button>
                        {!group.system ? (
                          <button
                            className="btn-ghost"
                            type="button"
                            disabled={isSaving}
                            onClick={() => void deleteGroup(group)}
                          >
                            {t('common.delete')}
                          </button>
                        ) : null}
                      </div>
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
          <div className="modal modal-scrollable">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {form.id
                    ? t('propertyGroups.editTitle')
                    : t('propertyGroups.formTitle')}
                </h3>
                <p className="modal-subtitle">
                  {form.system
                    ? t('propertyGroups.systemHelp')
                    : t('propertyGroups.formSubtitle')}
                </p>
              </div>
              <button
                className="btn-icon"
                type="button"
                onClick={() => setIsFormOpen(false)}
                aria-label={t('common.closeForm')}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <label className="form-field-span">
                  {t('propertyGroups.name')}
                  <input
                    type="text"
                    value={form.name}
                    disabled={form.system}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <fieldset className="form-field-span">
                  <legend>{t('propertyGroups.members')}</legend>
                  <div className="checkbox-list">
                    {pickerProperties.length === 0 ? (
                      <p className="modal-subtitle">{t('propertyGroups.noProperties')}</p>
                    ) : (
                      pickerProperties.map((property) => (
                        <label key={property.id} className="form-field-checkbox">
                          <input
                            type="checkbox"
                            checked={form.memberIds.includes(property.id)}
                            disabled={form.system}
                            onChange={() => toggleMember(property.id)}
                          />
                          <span>{getPropertyLabel(property)}</span>
                        </label>
                      ))
                    )}
                  </div>
                </fieldset>
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
              {!form.system ? (
                <button
                  className="btn-primary"
                  type="button"
                  disabled={isSaving}
                  onClick={() => void saveForm()}
                >
                  {t('common.save')}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
