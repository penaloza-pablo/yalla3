import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { YlIcon } from '../design/icons'
import { useDashboardWidgets } from '../dashboard/widget-store'
import { fetchJson } from '../operations/api'
import {
  GLOBAL_REPORT_SETTINGS_PROPERTY_ID,
  parseReportSettings,
  resolveMarketManagementFee,
  validateReportSettings,
} from '../../amplify/functions/shared/property-report-settings'
import {
  defaultWritableGlobalValue,
  isWritableGlobalVariable,
  listGlobalVariableIds,
  usagesForVariable,
} from './globalVariables'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
}

const descriptionFor = (
  id: string,
  t: ReturnType<typeof useTranslation>['t'],
) => {
  const namedDescription = t(`globalVariables.descriptions.${id}`, {
    defaultValue: '',
  })
  if (namedDescription) {
    return namedDescription
  }
  const help = t(`propertyReports.metrics.${id}Help`, {
    formula: t('globalVariables.formulaFromSettings'),
    defaultValue: '',
  })
  if (help) {
    return help
  }
  const named = t(`propertyReports.formulaVars.${id}`, { defaultValue: '' })
  if (named) {
    return t('globalVariables.catalogDescription', { name: named })
  }
  return t('globalVariables.unknownDescription')
}

export function GlobalVariablesView({ getEndpoint }: Props) {
  const { t } = useTranslation()
  const widgets = useDashboardWidgets()
  const [openId, setOpenId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [marketManagementFee, setMarketManagementFee] = useState(
    String(defaultWritableGlobalValue('marketManagementFee') ?? 20),
  )
  const variables = useMemo(() => listGlobalVariableIds(), [widgets])
  const getUrl = getEndpoint('getPropertyReportUrl')
  const upsertUrl = getEndpoint('upsertPropertyReportUrl')

  const load = useCallback(async () => {
    if (!getUrl) {
      setError(t('globalVariables.missingEndpoint'))
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const payload = await fetchJson<{ settings?: Record<string, unknown> }>(
        `${getUrl}?propertyId=${encodeURIComponent(GLOBAL_REPORT_SETTINGS_PROPERTY_ID)}&settings=1`,
      )
      const settings = parseReportSettings(payload.settings)
      setMarketManagementFee(String(resolveMarketManagementFee(settings)))
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t('globalVariables.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [getUrl, t])

  useEffect(() => {
    void load()
  }, [load])

  const writableValue = (id: string) => {
    if (id === 'marketManagementFee') {
      return marketManagementFee
    }
    return ''
  }

  const setWritableValue = (id: string, value: string) => {
    if (id === 'marketManagementFee') {
      setMarketManagementFee(value)
    }
  }

  const save = async () => {
    if (!getUrl || !upsertUrl) {
      setError(
        !getUrl
          ? t('globalVariables.missingEndpoint')
          : t('globalVariables.missingWrite'),
      )
      return
    }
    const parsedFee = Number(marketManagementFee)
    if (!Number.isFinite(parsedFee) || parsedFee < 0 || parsedFee > 100) {
      setError(t('globalVariables.invalidPercent'))
      return
    }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const payload = await fetchJson<{ settings?: Record<string, unknown> }>(
        `${getUrl}?propertyId=${encodeURIComponent(GLOBAL_REPORT_SETTINGS_PROPERTY_ID)}&settings=1`,
      )
      const existing = parseReportSettings(payload.settings)
      const parsed = validateReportSettings(
        {
          ...existing,
          marketManagementFee: parsedFee,
        },
        { global: true },
      )
      if (!parsed.ok) {
        setError(t('globalVariables.invalidPercent'))
        return
      }
      await fetchJson(upsertUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          propertyId: GLOBAL_REPORT_SETTINGS_PROPERTY_ID,
          action: 'settings',
          formula: parsed.settings.formula,
          propertyContributionFormula:
            parsed.settings.propertyContributionFormula,
          ourProfitFormula: parsed.settings.ourProfitFormula,
          netEarningsFormula: parsed.settings.netEarningsFormula,
          cleaningVat: parsed.settings.cleaningVat,
          accommodationVat: parsed.settings.accommodationVat,
          airbnbFeePercent: parsed.settings.airbnbFeePercent,
          visibility: parsed.settings.visibility,
          marketManagementFee: parsed.settings.marketManagementFee,
        }),
      })
      setMarketManagementFee(String(parsed.settings.marketManagementFee ?? parsedFee))
      setMessage(t('globalVariables.saved'))
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t('globalVariables.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('globalVariables.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Global Variables')}</h1>
          </div>
          <p className="subtitle">{t('globalVariables.subtitle')}</p>
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
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{t('globalVariables.cardTitle')}</h2>
              <p className="card-subtitle">{t('globalVariables.cardSubtitle')}</p>
            </div>
          </div>
          {variables.length === 0 ? (
            <p>{t('globalVariables.empty')}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('globalVariables.variable')}</th>
                    <th>{t('globalVariables.description')}</th>
                    <th>{t('globalVariables.value')}</th>
                    <th>{t('globalVariables.usages')}</th>
                  </tr>
                </thead>
                <tbody>
                  {variables.map((id) => {
                    const usages = usagesForVariable(id)
                    const isOpen = openId === id
                    const writable = isWritableGlobalVariable(id)
                    return (
                      <tr key={id}>
                        <td>
                          <code>{id}</code>
                        </td>
                        <td>{descriptionFor(id, t)}</td>
                        <td>
                          {writable ? (
                            <label className="global-variables-value">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={0.01}
                                value={writableValue(id)}
                                onChange={(event) =>
                                  setWritableValue(id, event.target.value)
                                }
                              />
                              <span className="global-variables-suffix">%</span>
                            </label>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td>
                          <button
                            className="btn-link"
                            type="button"
                            aria-expanded={isOpen}
                            onClick={() =>
                              setOpenId((current) =>
                                current === id ? null : id,
                              )
                            }
                          >
                            <YlIcon
                              name={isOpen ? 'chevron.down' : 'chevron.right'}
                              size={12}
                            />{' '}
                            {t('globalVariables.usageCount', {
                              count: usages.length,
                            })}
                          </button>
                          {isOpen ? (
                            usages.length === 0 ? (
                              <p className="form-field-hint">
                                {t('globalVariables.noUsages')}
                              </p>
                            ) : (
                              <ul className="global-variables-usages">
                                {usages.map((usage) => (
                                  <li key={usage.id}>
                                    {usage.labelKey ===
                                    'globalVariables.usageWidget'
                                      ? t(usage.labelKey, {
                                          name: t(usage.widgetTitleKey ?? ''),
                                        })
                                      : t(usage.labelKey)}
                                  </li>
                                ))}
                              </ul>
                            )
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </>
  )
}
