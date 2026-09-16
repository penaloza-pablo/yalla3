import {
  VISIBILITY_METRIC_IDS,
} from '../../amplify/functions/shared/property-report-formula'
import { DEFAULT_MARKET_MANAGEMENT_FEE } from '../../amplify/functions/shared/property-report-settings'
import { listDashboardWidgets } from '../dashboard/widget-store'

const HANDLEBARS_VAR = /\{\{\s*([A-Za-z][A-Za-z0-9]*)\s*\}\}/g

export const WRITABLE_GLOBAL_VARIABLE_IDS = ['marketManagementFee'] as const

export const FINANCE_VARIABLE_IDS = [
  ...VISIBILITY_METRIC_IDS,
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

export const isWritableGlobalVariable = (variableId: string) =>
  (WRITABLE_GLOBAL_VARIABLE_IDS as readonly string[]).includes(variableId)

export const defaultWritableGlobalValue = (variableId: string) => {
  if (variableId === 'marketManagementFee') {
    return DEFAULT_MARKET_MANAGEMENT_FEE
  }
  return null
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
  return [...ids].sort((left, right) => {
    const leftWritable = isWritableGlobalVariable(left) ? 0 : 1
    const rightWritable = isWritableGlobalVariable(right) ? 0 : 1
    if (leftWritable !== rightWritable) {
      return leftWritable - rightWritable
    }
    return left.localeCompare(right)
  })
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
