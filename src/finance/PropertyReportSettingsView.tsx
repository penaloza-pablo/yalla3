import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CONDITION_RULES,
  GLOBAL_REPORT_SETTINGS_PROPERTY_ID,
  defaultReportVisibility,
  emptyReportSettings,
  mergeReportSettings,
  parseReportSettings,
  validateReportSettings,
  type BusinessModel,
  type ConditionRule,
  type PropertyReportSettings,
  type ReportCondition,
  type ReportVisibility,
} from '../../amplify/functions/shared/property-report-settings'
import {
  DEFAULT_COMMISSION_FORMULA,
  DEFAULT_PROPERTY_CONTRIBUTION_FORMULA,
  allowedFormulaVariables,
  validateFormula,
  type FormulaTarget,
} from '../../amplify/functions/shared/property-report-formula'
import { fetchJson } from '../operations/api'
import { parseIvaRate, type IvaRate } from '../../amplify/functions/shared/iva'
import { DEFAULT_AIRBNB_FEE_PERCENT } from '../../amplify/functions/shared/property-report-payouts'
import { FormulaBuilder } from './FormulaBuilder'
import { ReportVisibilityEditor } from './ReportVisibilityEditor'
import { VatChannelsFeeCard } from './VatChannelsFeeCard'

export type CopyTarget = {
  id: string
  name: string
}

type Props = {
  propertyId: string
  propertyName: string
  getUrl?: string
  upsertUrl?: string
  copyTargets: CopyTarget[]
  onBack: () => void
  onSaved: (settings: PropertyReportSettings) => void
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
  formula: string
  propertyContributionFormula: string
  ourProfitFormula: string
  netEarningsFormula: string
  cleaningVat: IvaRate
  accommodationVat: IvaRate
  airbnbFee: string
  visibility: ReportVisibility
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
  formula:
    settings.businessModel === 'commission' && !settings.formula
      ? DEFAULT_COMMISSION_FORMULA
      : settings.formula,
  propertyContributionFormula:
    settings.propertyContributionFormula || DEFAULT_PROPERTY_CONTRIBUTION_FORMULA,
  ourProfitFormula: settings.ourProfitFormula,
  netEarningsFormula: settings.netEarningsFormula,
  cleaningVat: settings.cleaningVat ?? 0,
  accommodationVat: settings.accommodationVat ?? 0,
  airbnbFee:
    settings.airbnbFeePercent === null
      ? String(DEFAULT_AIRBNB_FEE_PERCENT)
      : String(settings.airbnbFeePercent),
  visibility: settings.visibility ?? defaultReportVisibility(),
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

export function PropertyReportSettingsView({
  propertyId,
  propertyName,
  getUrl,
  upsertUrl,
  copyTargets,
  onBack,
  onSaved,
}: Props) {
  const { t } = useTranslation()
  const [form, setForm] = useState<SettingsForm>(toForm(emptyReportSettings()))
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [copyTargetId, setCopyTargetId] = useState('')

  const metricLabel = (id: string) =>
    t(`propertyReports.formulaVars.${id}`, {
      defaultValue: t(`propertyReports.metrics.${id}`, { defaultValue: id }),
    })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!getUrl) {
        setError(t('propertyReports.missingEndpoint'))
        setIsLoading(false)
        return
      }
      try {
        const [payload, globalPayload] = await Promise.all([
          fetchJson<{ settings?: Record<string, unknown> }>(
            `${getUrl}?propertyId=${encodeURIComponent(propertyId)}&settings=1`,
          ),
          fetchJson<{ settings?: Record<string, unknown> }>(
            `${getUrl}?propertyId=${encodeURIComponent(GLOBAL_REPORT_SETTINGS_PROPERTY_ID)}&settings=1`,
          ).catch(() => ({ settings: undefined })),
        ])
        if (!cancelled) {
          setForm(
            toForm(
              mergeReportSettings(
                parseReportSettings(payload.settings),
                parseReportSettings(globalPayload.settings),
              ),
            ),
          )
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

  const buildPayload = () => {
    if (!form.businessModel) {
      return { ok: false as const, message: t('propertyReports.settingsModelRequired') }
    }
    if (form.businessModel === 'commission') {
      const percent = parseAmount(form.commissionPercent)
      if (percent === null || !Number.isFinite(percent) || percent < 0 || percent > 100) {
        return {
          ok: false as const,
          message: t('propertyReports.settingsCommissionRequired'),
        }
      }
    } else {
      const amount = parseAmount(form.fixedRent)
      if (amount === null || !Number.isFinite(amount) || amount < 0) {
        return {
          ok: false as const,
          message: t('propertyReports.settingsFixedRentRequired'),
        }
      }
    }
    const formulaChecks: Array<[string, FormulaTarget, boolean]> = [
      [form.formula, 'managementFee', form.businessModel === 'commission'],
      [form.propertyContributionFormula, 'propertyContribution', false],
      [form.ourProfitFormula, 'ourProfit', false],
      [form.netEarningsFormula, 'netEarnings', false],
    ]
    for (const [source, target, required] of formulaChecks) {
      if (!source.trim()) {
        if (required) {
          return {
            ok: false as const,
            message: t('propertyReports.settingsFormulaRequired'),
          }
        }
        continue
      }
      const formulaCheck = validateFormula(source, form.businessModel, target)
      if (!formulaCheck.ok) {
        return {
          ok: false as const,
          message: t('propertyReports.settingsFormulaInvalid'),
        }
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
      return {
        ok: false as const,
        message: t('propertyReports.settingsConditionInvalid'),
      }
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
      formula: form.formula.trim(),
      propertyContributionFormula: form.propertyContributionFormula.trim(),
      ourProfitFormula: form.ourProfitFormula.trim(),
      netEarningsFormula: form.netEarningsFormula.trim(),
      cleaningVat: parseIvaRate(form.cleaningVat) ?? 0,
      accommodationVat: parseIvaRate(form.accommodationVat) ?? 0,
      airbnbFeePercent: parseAmount(form.airbnbFee),
      visibility: form.visibility,
      conditions,
    })
    if (!parsed.ok) {
      return {
        ok: false as const,
        message: parsed.message.includes('airbnbFee')
          ? t('propertyReports.settingsAirbnbFeeInvalid')
          : t('propertyReports.settingsConditionInvalid'),
      }
    }
    return { ok: true as const, settings: parsed.settings }
  }

  const persist = async (targetId: string, copied: boolean) => {
    if (!upsertUrl) {
      setError(t('propertyReports.missingWrite'))
      return
    }
    const built = buildPayload()
    if (!built.ok) {
      setError(built.message)
      return
    }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const payload = await fetchJson<{ settings?: Record<string, unknown> }>(
        upsertUrl,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            propertyId: targetId,
            action: 'settings',
            businessModel: built.settings.businessModel,
            commissionPercent: built.settings.commissionPercent,
            fixedRent: built.settings.fixedRent,
            formula: built.settings.formula,
            propertyContributionFormula: built.settings.propertyContributionFormula,
            ourProfitFormula: built.settings.ourProfitFormula,
            netEarningsFormula: built.settings.netEarningsFormula,
            cleaningVat: built.settings.cleaningVat,
            accommodationVat: built.settings.accommodationVat,
            airbnbFeePercent: built.settings.airbnbFeePercent,
            visibility: built.settings.visibility,
            conditions: built.settings.conditions,
          }),
        },
      )
      if (copied) {
        setMessage(t('propertyReports.settingsCopied'))
      } else {
        onSaved(parseReportSettings(payload.settings ?? built.settings))
      }
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

  const otherTargets = useMemo(
    () => copyTargets.filter((item) => item.id !== propertyId),
    [copyTargets, propertyId],
  )

  const renderFormula = (
    titleKey: string,
    helpKey: string,
    field: keyof Pick<
      SettingsForm,
      | 'formula'
      | 'propertyContributionFormula'
      | 'ourProfitFormula'
      | 'netEarningsFormula'
    >,
    target: FormulaTarget,
  ) => (
    <div className="formula-field">
      <h4 className="card-title">{t(titleKey)}</h4>
      <p className="modal-subtitle">{t(helpKey)}</p>
      <FormulaBuilder
        value={form[field]}
        variableIds={allowedFormulaVariables(form.businessModel, target)}
        variableLabel={metricLabel}
        onChange={(formula) =>
          setForm((current) => ({ ...current, [field]: formula }))
        }
      />
    </div>
  )

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('propertyReports.eyebrow')}</p>
          <div className="page-title-row">
            <button type="button" className="btn-ghost" onClick={onBack}>
              {t('common.back')}
            </button>
            <h1 className="page-title">
              {t('propertyReports.settingsTitleNamed', { name: propertyName })}
            </h1>
          </div>
          <p className="subtitle">{t('propertyReports.settingsSubtitle')}</p>
        </div>
        <div className="header-actions">
          <button
            className="btn-primary"
            type="button"
            disabled={isSaving || isLoading}
            onClick={() => void persist(propertyId, false)}
          >
            {t('common.save')}
          </button>
        </div>
      </header>
      {error ? <p className="notice error">{error}</p> : null}
      {message ? <p className="notice success">{message}</p> : null}
      {isLoading ? <p>{t('common.loading')}</p> : null}
      {!isLoading ? (
        <div className="report-settings-page">
          <section className="card">
            <h2 className="card-title">{t('propertyReports.cardBusinessModel')}</h2>
            <div className="form-grid">
              <label className="form-field-span">
                {t('propertyReports.businessModel')}
                <select
                  value={form.businessModel}
                  onChange={(event) =>
                    setForm((current) => {
                      const businessModel = event.target.value as BusinessModel | ''
                      let formula = current.formula
                      if (businessModel === 'commission' && !formula.trim()) {
                        formula = DEFAULT_COMMISSION_FORMULA
                      }
                      if (
                        businessModel === 'fixedRent' &&
                        formula.includes('commission')
                      ) {
                        formula = ''
                      }
                      return { ...current, businessModel, formula }
                    })
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
            {form.businessModel ? (
              <>
                {renderFormula(
                  'propertyReports.managementFeeFormula',
                  'propertyReports.managementFeeFormulaHelp',
                  'formula',
                  'managementFee',
                )}
                {renderFormula(
                  'propertyReports.propertyContributionFormula',
                  'propertyReports.propertyContributionFormulaHelp',
                  'propertyContributionFormula',
                  'propertyContribution',
                )}
                {renderFormula(
                  'propertyReports.ourProfitFormula',
                  'propertyReports.ourProfitFormulaHelp',
                  'ourProfitFormula',
                  'ourProfit',
                )}
                {renderFormula(
                  'propertyReports.netEarningsFormula',
                  'propertyReports.netEarningsFormulaHelp',
                  'netEarningsFormula',
                  'netEarnings',
                )}
              </>
            ) : null}
            <section className="report-settings-conditions">
              <div>
                <h4 className="card-title">{t('propertyReports.conditions')}</h4>
                <p className="modal-subtitle">{t('propertyReports.conditionsHelp')}</p>
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
          </section>

          <VatChannelsFeeCard
            cleaningVat={form.cleaningVat}
            accommodationVat={form.accommodationVat}
            airbnbFee={form.airbnbFee}
            t={t}
            onChange={(patch) =>
              setForm((current) => ({
                ...current,
                cleaningVat: patch.cleaningVat ?? current.cleaningVat,
                accommodationVat:
                  patch.accommodationVat ?? current.accommodationVat,
                airbnbFee: patch.airbnbFee ?? current.airbnbFee,
              }))
            }
          />

          <section className="card">
            <h2 className="card-title">{t('propertyReports.cardVisibility')}</h2>
            <p className="modal-subtitle">{t('propertyReports.visibilityHelp')}</p>
            <ReportVisibilityEditor
              value={form.visibility}
              onChange={(visibility) =>
                setForm((current) => ({ ...current, visibility }))
              }
              metricLabel={metricLabel}
            />
          </section>

          <section className="card">
            <h2 className="card-title">{t('propertyReports.cardCopy')}</h2>
            <p className="modal-subtitle">{t('propertyReports.copyHelp')}</p>
            <div className="report-settings-copy">
              <label className="form-field">
                <span>{t('propertyReports.copyTarget')}</span>
                <select
                  value={copyTargetId}
                  onChange={(event) => setCopyTargetId(event.target.value)}
                >
                  <option value="">{t('common.select')}</option>
                  {otherTargets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn-secondary"
                type="button"
                disabled={isSaving || !copyTargetId}
                onClick={() => void persist(copyTargetId, true)}
              >
                {t('propertyReports.copyAction')}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
