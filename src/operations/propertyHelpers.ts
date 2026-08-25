import type { PropertyOption } from './types'

export const getPropertyLabel = (property: PropertyOption) =>
  property.listingNickname || property.nickname || property.title || property.id

export const isOtherProperty = (property: PropertyOption) =>
  property.id.trim().toLowerCase() === 'other'

export const sortPropertyOptions = (properties: PropertyOption[]) =>
  [...properties].sort((a, b) =>
    getPropertyLabel(a).localeCompare(getPropertyLabel(b), undefined, {
      sensitivity: 'base',
    }),
  )

export const sortPropertiesWithOtherLast = (properties: PropertyOption[]) => {
  const regular = properties.filter((property) => !isOtherProperty(property))
  const other = properties.filter((property) => isOtherProperty(property))
  return [...sortPropertyOptions(regular), ...other]
}

export const isMtlPropertyType = (type?: string) => {
  const normalized = (type ?? '').trim().toUpperCase()
  return normalized === 'MTL' || normalized.startsWith('MTL_')
}

export const filterPropertySelectOptions = (properties: PropertyOption[]) =>
  sortPropertyOptions(
    properties.filter(
      (property) =>
        !isMtlPropertyType(property.type) && !property.mtlPrincipalId?.trim(),
    ),
  )
