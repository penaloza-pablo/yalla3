import {
  getPropertyLabel,
  sortPropertiesWithOtherLast,
  sortPropertyOptions,
} from './propertyHelpers'
import type { PropertyOption, VisitRecord } from './types'

export type MtlStandaloneRow = {
  kind: 'standalone'
  property: PropertyOption
  propertyIds: string[]
}

export type MtlGroupRow = {
  kind: 'mtl-group'
  principal: PropertyOption
  children: PropertyOption[]
  propertyIds: string[]
}

export type MtlDisplayRow = MtlStandaloneRow | MtlGroupRow

export const isMtlPrincipal = (property: PropertyOption) =>
  (property.type ?? '').trim().toUpperCase() === 'MTL_PRINCIPAL'

export const isMtlChild = (property: PropertyOption) =>
  Boolean(property.mtlPrincipalId?.trim())

export const visitBelongsToPropertyScope = (
  visit: VisitRecord,
  propertyIds: string[],
) => propertyIds.includes(visit.propertyId)

export const isPropertyIdInScope = (
  propertyId: string,
  propertyIds: string[],
) => propertyIds.includes(propertyId)

export const getVisitsForPropertyIds = (
  visits: VisitRecord[],
  propertyIds: string[],
) => visits.filter((visit) => propertyIds.includes(visit.propertyId))

export const buildMtlDisplayRows = (
  properties: PropertyOption[],
): MtlDisplayRow[] => {
  const sorted = sortPropertiesWithOtherLast(properties)
  const childrenByPrincipal = new Map<string, PropertyOption[]>()

  sorted.forEach((property) => {
    const principalId = property.mtlPrincipalId?.trim()
    if (!principalId) {
      return
    }
    const children = childrenByPrincipal.get(principalId) ?? []
    children.push(property)
    childrenByPrincipal.set(principalId, children)
  })

  childrenByPrincipal.forEach((children, principalId) => {
    childrenByPrincipal.set(principalId, sortPropertyOptions(children))
  })

  const principalIds = new Set(
    sorted
      .filter(
        (property) =>
          isMtlPrincipal(property) ||
          (childrenByPrincipal.get(property.id)?.length ?? 0) > 0,
      )
      .map((property) => property.id),
  )

  const rows: MtlDisplayRow[] = []

  sorted.forEach((property) => {
    if (isMtlChild(property)) {
      const principalExists = sorted.some(
        (entry) => entry.id === property.mtlPrincipalId?.trim(),
      )
      if (principalExists) {
        return
      }
      rows.push({
        kind: 'standalone',
        property,
        propertyIds: [property.id],
      })
      return
    }

    if (principalIds.has(property.id)) {
      const children = childrenByPrincipal.get(property.id) ?? []
      rows.push({
        kind: 'mtl-group',
        principal: property,
        children,
        propertyIds: [property.id, ...children.map((child) => child.id)],
      })
      return
    }

    rows.push({
      kind: 'standalone',
      property,
      propertyIds: [property.id],
    })
  })

  return rows
}

export const rowHasVisits = (row: MtlDisplayRow, visits: VisitRecord[]) =>
  getVisitsForPropertyIds(visits, row.propertyIds).length > 0

export const getMtlGroupLabel = (row: MtlGroupRow) => {
  const roomCount = row.children.length
  const suffix =
    roomCount > 0 ? ` (${roomCount} room${roomCount === 1 ? '' : 's'})` : ''
  return `${getPropertyLabel(row.principal)}${suffix}`
}
