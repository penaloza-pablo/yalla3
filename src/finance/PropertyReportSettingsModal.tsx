import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CONDITION_RULES,
  emptyReportSettings,
  parseReportSettings,
  validateReportSettings,
  type BusinessModel,
  type ConditionRule,
  type PropertyReportSettings,
  type ReportCondition,
} from '../../amplify/functions/shared/property-report-settings'
import { fetchJson } from '../operations/api'

type Props = {
  propertyId: string
  propertyName: string
  getUrl?: string
  upsertUrl?: string
  onClose: () => void
  onSaved: () => void
}

type ConditionForm = {
  id: string
  name: string
  rule: ConditionRule
  bearFirstAmount: string
}

type SettingsForm = {
  businessModel: BusinessModel | ''
  commissionPercent: string
  fixedRent: string
  conditions: ConditionForm[]
}

const newConditionId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `cond-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const emptyCondition = (): ConditionForm => ({
  id: newConditionId(),
  name: '',
  rule: 'bear',
  bearFirstAmount: '',
})

const toForm = (settings: PropertyReportSettings): SettingsForm => ({
  businessModel: settings.businessModel,
  commissionPercent:
    settings.commissionPercent === null ? '' : String(settings.commissionPercent),
  fixedRent: settings.fixedRent === null ? '' : String(settings.fixedRent),
  conditions: settings.conditions.map((row) => ({
    id: row.id,
    name: row.name,
    rule: row.rule,
    bearFirstAmount:
      row.bearFirstAmount === null ? '' : String(row.bearFirstAmount),
  })),
})

const parseAmount = (value: string) => {
  if (!value.trim()) {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function PropertyReportSettingsModal({
  propertyId,
  propertyName,
  getUrl,
  upsertUrl,
  onClose,
  onSaved,
}: Props) {
  const { t } = useTranslation()
  const [form, setForm] = useState<SettingsForm>(toForm(emptyReportSettings()))
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!getUrl) {
        setError(t('propertyReports.missingEndpoint'))
        setIsLoading(false)
        return
      }
      try {
        const payload = await fetchJson<{ settings?: Record<string, unknown> }>(
          `${getUrl}?propertyId=${encodeURIComponent(propertyId)}&settings=1`,
        )
        if (!cancelled) {
          setForm(toForm(parseReportSettings(payload.settings)))
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t('propertyReports.settingsLoadError'),
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [getUrl, propertyId, t])

  const updateCondition = (id: string, patch: Partial<ConditionForm>) => {
    setForm((current) => ({
      ...current,
      conditions: current.conditions.map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    }))
  }

  const save = async () => {
    if (!upsertUrl) {
      setError(t('propertyReports.missingWrite'))
      return
    }
    if (!form.businessModel) {
      setError(t('propertyReports.settingsModelRequired'))
      return
    }
    if (form.businessModel === 'commission') {
      const percent = parseAmount(form.commissionPercent)
      if (percent === null || !Number.isFinite(percent) || percent < 0 || percent > 100) {
        setError(t('propertyReports.settingsCommissionRequired'))
        return
      }
    } else {
      const amount = parseAmount(form.fixedRent)
      if (amount === null || !Number.isFinite(amount) || amount < 0) {
        setError(t('propertyReports.settingsFixedRentRequired'))
        return
      }
    }
    const named = form.conditions.filter((row) => row.name.trim())
    if (
      named.some(
        (row) =>
          row.rule === 'bearFirst' &&
          (parseAmount(row.bearFirstAmount) === null ||
            !Number.isFinite(parseAmount(row.bearFirstAmount) ?? Number.NaN)),
      )
    ) {
      setError(t('propertyReports.settingsConditionInvalid'))
      return
    }

    const conditions: ReportCondition[] = named.map((row) => ({
      id: row.id,
      name: row.name.trim(),
      rule: row.rule,
      bearFirstAmount:
        row.rule === 'bearFirst' ? parseAmount(row.bearFirstAmount) : null,
    }))
    const parsed = validateReportSettings({
      businessModel: form.businessModel,
      commissionPercent: parseAmount(form.commissionPercent),
      fixedRent: parseAmount(form.fixedRent),
      conditions,
    })
    if (!parsed.ok) {
      setError(t('propertyReports.settingsConditionInvalid'))
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      await fetchJson(upsertUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          action: 'settings',
          businessModel: parsed.settings.businessModel,
          commissionPercent: parsed.settings.commissionPercent,
          fixedRent: parsed.settings.fixedRent,
          conditions: parsed.settings.conditions,
        }),
      })
      onSaved()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t('propertyReports.settingsSaveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const ruleLabel = (rule: ConditionRule) => {
    if (rule === 'bear') return t('propertyReports.allocationBear')
    if (rule === 'ownerPlus12') return t('propertyReports.allocationOwnerPlus12')
    if (rule === 'owner') return t('propertyReports.allocationOwner')
    return t('propertyReports.allocationBearFirst')
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal modal-scrollable report-settings-modal">
        <div className="modal-header">
          <div>
            <h3 className="modal-title">{t('propertyReports.settingsTitle')}</h3>
            <p className="modal-subtitle">{propertyName}</p>
          </div>
          <button
            className="btn-icon"
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-subtitle">{t('propertyReports.settingsSubtitle')}</p>
          {error ? <p className="notice error">{error}</p> : null}
          {isLoading ? <p>{t('common.loading')}</p> : null}
          {!isLoading ? (
            <>
              <div className="form-grid">
                <label className="form-field-span">
                  {t('propertyReports.businessModel')}
                  <select
                    value={form.businessModel}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        businessModel: event.target.value as BusinessModel | '',
                      }))
                    }
                  >
                    <option value="">{t('common.select')}</option>
                    <option value="commission">
                      {t('propertyReports.modelCommission')}
                    </option>
                    <option value="fixedRent">
                      {t('propertyReports.modelFixedRent')}
                    </option>
                  </select>
                </label>
                {form.businessModel === 'commission' ? (
                  <label>
                    {t('propertyReports.commissionPercent')}
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={form.commissionPercent}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          commissionPercent: event.target.value,
                        }))
                      }
                    />
                  </label>
                ) : null}
                {form.businessModel === 'fixedRent' ? (
                  <label>
                    {t('propertyReports.fixedRentAmount')}
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.fixedRent}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          fixedRent: event.target.value,
                        }))
                      }
                    />
                  </label>
                ) : null}
              </div>
              <section className="report-settings-conditions">
                <div>
                  <h4 className="card-title">{t('propertyReports.conditions')}</h4>
                  <p className="modal-subtitle">
                    {t('propertyReports.conditionsHelp')}
                  </p>
                </div>
                {form.conditions.length === 0 ? (
                  <p className="modal-subtitle">
                    {t('propertyReports.emptyConditions')}
                  </p>
                ) : (
                  form.conditions.map((row) => (
                    <div key={row.id} className="report-settings-condition">
                      <label className="form-field">
                        <span>{t('propertyReports.conditionName')}</span>
                        <input
                          type="text"
                          value={row.name}
                          onChange={(event) =>
                            updateCondition(row.id, { name: event.target.value })
                          }
                        />
                      </label>
                      <label className="form-field">
                        <span>{t('propertyReports.conditionRule')}</span>
                        <select
                          value={row.rule}
                          onChange={(event) =>
                            updateCondition(row.id, {
                              rule: event.target.value as ConditionRule,
                            })
                          }
                        >
                          {CONDITION_RULES.map((rule) => (
                            <option key={rule} value={rule}>
                              {ruleLabel(rule)}
                            </option>
                          ))}
                        </select>
                      </label>
                      {row.rule === 'bearFirst' ? (
                        <label className="form-field">
                          <span>{t('propertyReports.bearFirstAmount')}</span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={row.bearFirstAmount}
                            onChange={(event) =>
                              updateCondition(row.id, {
                                bearFirstAmount: event.target.value,
                              })
                            }
                          />
                        </label>
                      ) : (
                        <span />
                      )}
                      <button
                        className="btn-icon btn-icon-ghost"
                        type="button"
                        aria-label={t('propertyReports.removeCondition')}
                        title={t('propertyReports.removeCondition')}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            conditions: current.conditions.filter(
                              (item) => item.id !== row.id,
                            ),
                          }))
                        }
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
                <button
                  className="btn-secondary"
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      conditions: [...current.conditions, emptyCondition()],
                    }))
                  }
                >
                  {t('propertyReports.addCondition')}
                </button>
              </section>
            </>
          ) : null}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" type="button" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn-primary"
            type="button"
            disabled={isSaving || isLoading}
            onClick={() => void save()}
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
