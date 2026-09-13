import {
  FORMULA_CATALOG_VARIABLES,
  FORMULA_RESULT_VARIABLES,
} from '../../amplify/functions/shared/property-report-formula'
import { listDashboardWidgets } from '../dashboard/widget-store'

const HANDLEBARS_VAR = /\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g

export const FINANCE_VARIABLE_IDS = [
  ...FORMULA_CATALOG_VARIABLES,
  ...FORMULA_RESULT_VARIABLES,
  'commission',
  'fixedRent',
] as const

export type GlobalVariableUsage = {
  id: string
  labelKey: 'globalVariables.usageFinance' | 'globalVariables.usageWidget'
  widgetTitleKey?: string
}

const idsInMarkup = (markup: string | undefined) => {
  if (!markup) {
    return [] as string[]
  }
  const ids: string[] = []
  HANDLEBARS_VAR.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = HANDLEBARS_VAR.exec(markup))) {
    ids.push(match[1])
  }
  return ids
}

export const listGlobalVariableIds = () => {
  const ids = new Set<string>(FINANCE_VARIABLE_IDS)
  for (const widget of listDashboardWidgets()) {
    for (const scale of widget.scales) {
      for (const id of idsInMarkup(scale.markup)) {
        ids.add(id)
      }
    }
  }
  return [...ids].sort((left, right) => left.localeCompare(right))
}

export const usagesForVariable = (variableId: string): GlobalVariableUsage[] => {
  const usages: GlobalVariableUsage[] = []
  if ((FINANCE_VARIABLE_IDS as readonly string[]).includes(variableId)) {
    usages.push({
      id: 'property-reports',
      labelKey: 'globalVariables.usageFinance',
    })
  }
  for (const widget of listDashboardWidgets()) {
    const used = widget.scales.some((scale) =>
      idsInMarkup(scale.markup).includes(variableId),
    )
    if (used) {
      usages.push({
        id: `widget:${widget.id}`,
        labelKey: 'globalVariables.usageWidget',
        widgetTitleKey: widget.titleKey,
      })
    }
  }
  return usages
}
