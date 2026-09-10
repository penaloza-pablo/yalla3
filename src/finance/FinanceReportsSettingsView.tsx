import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  GLOBAL_REPORT_SETTINGS_PROPERTY_ID,
  defaultReportVisibility,
  emptyReportSettings,
  parseReportSettings,
  validateReportSettings,
  type PropertyReportSettings,
  type ReportVisibility,
} from '../../amplify/functions/shared/property-report-settings'
import {
  DEFAULT_COMMISSION_FORMULA,
  DEFAULT_PROPERTY_CONTRIBUTION_FORMULA,
  allowedFormulaVariables,
  validateFormula,
  type FormulaTarget,
} from '../../amplify/functions/shared/property-report-formula'
import { parseIvaRate, type IvaRate } from '../../amplify/functions/shared/iva'
import {
  DEFAULT_AIRBNB_FEE_PERCENT,
} from '../../amplify/functions/shared/property-report-payouts'
import { fetchJson } from '../operations/api'
import { FormulaBuilder } from './FormulaBuilder'
import { ReportVisibilityEditor } from './ReportVisibilityEditor'
import { VatChannelsFeeCard } from './VatChannelsFeeCard'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
}

type FormState = {
  formula: string
  propertyContributionFormula: string
  ourProfitFormula: string
  netEarningsFormula: string
  cleaningVat: IvaRate
  accommodationVat: IvaRate
  airbnbFee: string
  visibility: ReportVisibility
}

const toForm = (settings: PropertyReportSettings): FormState => ({
  formula: settings.formula || DEFAULT_COMMISSION_FORMULA,
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
})

export function FinanceReportsSettingsView({ getEndpoint }: Props) {
  const { t } = useTranslation()
  const getUrl = getEndpoint('getPropertyReportUrl')
  const upsertUrl = getEndpoint('upsertPropertyReportUrl')
  const [form, setForm] = useState<FormState>(toForm(emptyReportSettings()))
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const metricLabel = (id: string) =>
    t(`propertyReports.formulaVars.${id}`, {
      defaultValue: t(`propertyReports.metrics.${id}`, { defaultValue: id }),
    })

  const load = useCallback(async () => {
    if (!getUrl) {
      setError(t('propertyReports.missingEndpoint'))
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const payload = await fetchJson<{ settings?: Record<string, unknown> }>(
        `${getUrl}?propertyId=${encodeURIComponent(GLOBAL_REPORT_SETTINGS_PROPERTY_ID)}&settings=1`,
      )
      setForm(toForm(parseReportSettings(payload.settings)))
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t('reportsSettings.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [getUrl, t])

  useEffect(() => {
    void load()
  }, [load])

  const save = async () => {
    if (!upsertUrl) {
      setError(t('propertyReports.missingWrite'))
      return
    }
    const formulas: Array<[string, FormulaTarget]> = [
      [form.formula, 'managementFee'],
      [form.propertyContributionFormula, 'propertyContribution'],
      [form.ourProfitFormula, 'ourProfit'],
      [form.netEarningsFormula, 'netEarnings'],
    ]
    for (const [source, target] of formulas) {
      if (!source.trim()) {
        continue
      }
      const checked = validateFormula(source, 'commission', target)
      if (!checked.ok) {
        setError(t('propertyReports.settingsFormulaInvalid'))
        return
      }
    }
    const parsed = validateReportSettings(
      {
        ...emptyReportSettings(),
        formula: form.formula.trim(),
        propertyContributionFormula: form.propertyContributionFormula.trim(),
        ourProfitFormula: form.ourProfitFormula.trim(),
        netEarningsFormula: form.netEarningsFormula.trim(),
        cleaningVat: parseIvaRate(form.cleaningVat) ?? 0,
        accommodationVat: parseIvaRate(form.accommodationVat) ?? 0,
        airbnbFeePercent: form.airbnbFee.trim()
          ? Number(form.airbnbFee)
          : null,
        visibility: form.visibility,
      },
      { global: true },
    )
    if (!parsed.ok) {
      setError(
        parsed.message.includes('airbnbFee')
          ? t('propertyReports.settingsAirbnbFeeInvalid')
          : t('propertyReports.settingsFormulaInvalid'),
      )
      return
    }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      await fetchJson(upsertUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          propertyId: GLOBAL_REPORT_SETTINGS_PROPERTY_ID,
          action: 'settings',
          formula: parsed.settings.formula,
          propertyContributionFormula: parsed.settings.propertyContributionFormula,
          ourProfitFormula: parsed.settings.ourProfitFormula,
          netEarningsFormula: parsed.settings.netEarningsFormula,
          cleaningVat: parsed.settings.cleaningVat,
          accommodationVat: parsed.settings.accommodationVat,
          airbnbFeePercent: parsed.settings.airbnbFeePercent,
          visibility: parsed.settings.visibility,
        }),
      })
      setMessage(t('reportsSettings.saved'))
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t('reportsSettings.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const renderFormula = (
    titleKey: string,
    helpKey: string,
    field: keyof Pick<
      FormState,
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
        variableIds={allowedFormulaVariables('commission', target)}
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
          <p className="eyebrow">{t('reportsSettings.eyebrow')}</p>
          <h1 className="page-title">{t('pages.Reports Settings')}</h1>
          <p className="subtitle">{t('reportsSettings.subtitle')}</p>
        </div>
        <div className="header-actions">
          <button
            className="btn-primary"
            type="button"
            disabled={isSaving || isLoading}
            onClick={() => void save()}
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
            <h2 className="card-title">{t('reportsSettings.formulasTitle')}</h2>
            <p className="modal-subtitle">{t('reportsSettings.formulasHelp')}</p>
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
            <p className="modal-subtitle">{t('reportsSettings.visibilityHelp')}</p>
            <ReportVisibilityEditor
              value={form.visibility}
              onChange={(visibility) =>
                setForm((current) => ({ ...current, visibility }))
              }
              metricLabel={metricLabel}
            />
          </section>
        </div>
      ) : null}
    </>
  )
}
