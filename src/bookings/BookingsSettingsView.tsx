import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MobileBodyPortal } from '../MobileBodyPortal'
import { fetchJson } from '../operations/api'
import {
  filterBookingsPlannerPropertyOptions,
  getPropertyLabel,
} from '../operations/propertyHelpers'
import type { PropertyOption } from '../operations/types'
import {
  type PlannerRule,
  type PlannerRuleId,
  type PlannerSettings,
  defaultPlannerSettings,
  normalizePlannerSettings,
} from '../../amplify/functions/shared/bookings-planner'

type Props = {
  getEndpoint: (key: string, fallback?: string) => string | undefined
  propertyOptions: PropertyOption[]
}

type SettingsSection = 'planner' | 'rules'

const RULE_I18N: Record<PlannerRuleId, { name: string; description: string }> = {
  linen: {
    name: 'bookingsSettings.ruleLinen',
    description: 'bookingsSettings.ruleLinenHelp',
  },
  giftCard: {
    name: 'bookingsSettings.ruleGiftCard',
    description: 'bookingsSettings.ruleGiftCardHelp',
  },
  singleGuest: {
    name: 'bookingsSettings.ruleSingleGuest',
    description: 'bookingsSettings.ruleSingleGuestHelp',
  },
}

const mapSettings = (item: Record<string, unknown> | undefined) =>
  normalizePlannerSettings(item ?? null)

export function BookingsSettingsView({ getEndpoint, propertyOptions }: Props) {
  const { t } = useTranslation()
  const endpoints = useMemo(
    () => ({
      getSettings: getEndpoint(
        'getBookingsPlannerSettingsUrl',
        import.meta.env.VITE_GET_BOOKINGS_PLANNER_SETTINGS_URL,
      ),
      upsertSettings: getEndpoint(
        'upsertBookingsPlannerSettingsUrl',
        import.meta.env.VITE_UPSERT_BOOKINGS_PLANNER_SETTINGS_URL,
      ),
    }),
    [getEndpoint],
  )

  const [section, setSection] = useState<SettingsSection | null>(null)
  const [settings, setSettings] = useState<PlannerSettings>(defaultPlannerSettings())
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [expandedRule, setExpandedRule] = useState<PlannerRuleId | null>(null)
  const properties = useMemo(
    () => filterBookingsPlannerPropertyOptions(propertyOptions),
    [propertyOptions],
  )

  const loadSettings = useCallback(async () => {
    if (!endpoints.getSettings) {
      setError(t('bookingsSettings.missingEndpoint'))
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const payload = await fetchJson<{ item?: Record<string, unknown> }>(
        endpoints.getSettings,
      )
      setSettings(mapSettings(payload.item))
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : t('bookingsSettings.loadError'),
      )
    } finally {
      setIsLoading(false)
    }
  }, [endpoints.getSettings, t])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const saveSettings = async (
    next: PlannerSettings,
    successKey: string,
    applyWindow = true,
  ) => {
    if (!endpoints.upsertSettings) {
      setError(t('bookingsSettings.missingWrite'))
      return
    }
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      const payload = await fetchJson<{ item?: Record<string, unknown> }>(
        endpoints.upsertSettings,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            plannerEnabled: next.plannerEnabled,
            rules: next.rules,
            applyWindow,
            syncGuesty: true,
          }),
        },
      )
      setSettings(mapSettings(payload.item))
      setMessage(t(successKey))
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : t('bookingsSettings.saveError'),
      )
    } finally {
      setIsSaving(false)
    }
  }

  const updateRule = (id: PlannerRuleId, patch: Partial<PlannerRule>) => {
    const rules = settings.rules.map((rule) =>
      rule.id === id ? { ...rule, ...patch } : rule,
    )
    return { ...settings, rules }
  }

  const toggleExcluded = (ruleId: PlannerRuleId, propertyId: string) => {
    const rule = settings.rules.find((entry) => entry.id === ruleId)
    if (!rule) {
      return
    }
    const excluded = rule.excludedPropertyIds.includes(propertyId)
      ? rule.excludedPropertyIds.filter((id) => id !== propertyId)
      : [...rule.excludedPropertyIds, propertyId]
    void saveSettings(
      updateRule(ruleId, { excludedPropertyIds: excluded }),
      'bookingsSettings.saved',
    )
  }

  const propertyLabel = (id: string) => {
    const match = properties.find((property) => property.id === id)
    return match ? getPropertyLabel(match) : id
  }

  return (
    <>
      <header className="page-header">
        <div className="page-header-leading">
          <p className="eyebrow">{t('bookingsSettings.eyebrow')}</p>
          <div className="page-title-row">
            <h1 className="page-title">{t('pages.Bookings settings')}</h1>
          </div>
          <p className="subtitle">{t('bookingsSettings.subtitle')}</p>
        </div>
        <MobileBodyPortal>
          <div className="page-action-bar">
            <div className="header-actions">
              <button
                className="btn-ghost"
                type="button"
                onClick={() => void loadSettings()}
                disabled={isLoading || isSaving}
              >
                {t('common.refresh')}
              </button>
            </div>
          </div>
        </MobileBodyPortal>
      </header>

      {message ? <p className="notice success">{message}</p> : null}
      {error ? <p className="notice error">{error}</p> : null}

      <section className="summary-cards cleaning-settings-cards">
        <button
          type="button"
          className={`card card-compact summary-card-button ${
            section === 'planner' ? 'is-selected' : ''
          }`}
          onClick={() =>
            setSection((current) => (current === 'planner' ? null : 'planner'))
          }
        >
          <p className="card-label">{t('bookingsSettings.plannerCard')}</p>
          <p className="card-value">
            {isLoading
              ? '—'
              : settings.plannerEnabled
                ? t('bookingsSettings.on')
                : t('bookingsSettings.off')}
          </p>
          <p className="card-meta">{t('bookingsSettings.plannerCardMeta')}</p>
        </button>
        <button
          type="button"
          className={`card card-compact summary-card-button ${
            section === 'rules' ? 'is-selected' : ''
          }`}
          onClick={() =>
            setSection((current) => (current === 'rules' ? null : 'rules'))
          }
        >
          <p className="card-label">{t('bookingsSettings.rulesCard')}</p>
          <p className="card-value">
            {isLoading
              ? '—'
              : settings.rules.filter((rule) => rule.enabled).length}
          </p>
          <p className="card-meta">{t('bookingsSettings.rulesCardMeta')}</p>
        </button>
      </section>

      {section === 'planner' ? (
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{t('bookingsSettings.plannerTitle')}</h2>
              <p className="subtitle">{t('bookingsSettings.plannerHelp')}</p>
            </div>
          </div>
          <label className="planner-switch">
            <input
              type="checkbox"
              checked={settings.plannerEnabled}
              disabled={isSaving || isLoading}
              onChange={(event) =>
                void saveSettings(
                  { ...settings, plannerEnabled: event.target.checked },
                  event.target.checked
                    ? 'bookingsSettings.enabledSuccess'
                    : 'bookingsSettings.disabled',
                )
              }
            />
            <span>
              {settings.plannerEnabled
                ? t('bookingsSettings.on')
                : t('bookingsSettings.off')}
            </span>
          </label>
        </section>
      ) : null}

      {section === 'rules' ? (
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">{t('bookingsSettings.rulesTitle')}</h2>
              <p className="subtitle">{t('bookingsSettings.rulesHelp')}</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('bookingsSettings.rule')}</th>
                  <th>{t('bookingsSettings.enabled')}</th>
                  <th>{t('bookingsSettings.excludedProperties')}</th>
                </tr>
              </thead>
              <tbody>
                {settings.rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <strong>{t(RULE_I18N[rule.id].name)}</strong>
                      <p className="table-help">{t(RULE_I18N[rule.id].description)}</p>
                    </td>
                    <td>
                      <label className="planner-switch compact">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          disabled={isSaving || isLoading}
                          onChange={(event) =>
                            void saveSettings(
                              updateRule(rule.id, {
                                enabled: event.target.checked,
                              }),
                              'bookingsSettings.saved',
                            )
                          }
                        />
                        <span>
                          {rule.enabled
                            ? t('bookingsSettings.on')
                            : t('bookingsSettings.off')}
                        </span>
                      </label>
                    </td>
                    <td>
                      <button
                        className="btn-secondary"
                        type="button"
                        onClick={() =>
                          setExpandedRule((current) =>
                            current === rule.id ? null : rule.id,
                          )
                        }
                      >
                        {rule.excludedPropertyIds.length
                          ? t('bookingsSettings.excludedCount', {
                              count: rule.excludedPropertyIds.length,
                            })
                          : t('bookingsSettings.selectProperties')}
                      </button>
                      {rule.excludedPropertyIds.length ? (
                        <p className="table-help">
                          {rule.excludedPropertyIds
                            .map((id) => propertyLabel(id))
                            .join(', ')}
                        </p>
                      ) : null}
                      {expandedRule === rule.id ? (
                        <div className="property-exclusion-list">
                          {properties.map((property) => (
                            <label
                              className="checkbox-row compact"
                              key={property.id}
                            >
                              <input
                                type="checkbox"
                                checked={rule.excludedPropertyIds.includes(
                                  property.id,
                                )}
                                disabled={isSaving}
                                onChange={() =>
                                  toggleExcluded(rule.id, property.id)
                                }
                              />
                              <span>{getPropertyLabel(property)}</span>
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  )
}
