import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { YlIcon } from '../design/icons'
import { useDashboardWidgets } from '../dashboard/widget-store'
import {
  listGlobalVariableIds,
  usagesForVariable,
} from './globalVariables'

const descriptionFor = (
  id: string,
  t: ReturnType<typeof useTranslation>['t'],
) => {
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

export function GlobalVariablesView() {
  const { t } = useTranslation()
  const widgets = useDashboardWidgets()
  const [openId, setOpenId] = useState<string | null>(null)
  const variables = useMemo(() => listGlobalVariableIds(), [widgets])

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
      </header>

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
                  <th>{t('globalVariables.usages')}</th>
                </tr>
              </thead>
              <tbody>
                {variables.map((id) => {
                  const usages = usagesForVariable(id)
                  const isOpen = openId === id
                  return (
                    <tr key={id}>
                      <td>
                        <code>{id}</code>
                      </td>
                      <td>{descriptionFor(id, t)}</td>
                      <td>
                        <button
                          className="btn-link"
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() =>
                            setOpenId((current) => (current === id ? null : id))
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
                                  {usage.labelKey === 'globalVariables.usageWidget'
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
    </>
  )
}
