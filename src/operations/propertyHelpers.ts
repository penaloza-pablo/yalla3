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

const P2_ROOM_NICKNAMES = new Set(
  Array.from({ length: 12 }, (_, index) => String(201 + index)),
)

export const isP2RoomNickname = (value: string) =>
  P2_ROOM_NICKNAMES.has(value.trim())

const isMtlPrincipalType = (type?: string) =>
  (type ?? '').trim().toUpperCase() === 'MTL_PRINCIPAL'

const isYallaP2Property = (property: PropertyOption) => {
  if (isMtlPrincipalType(property.type)) {
    return true
  }
  const id = property.id.trim().toLowerCase()
  const label = getPropertyLabel(property).trim().toLowerCase()
  return id === 'planta2' || label === 'p2'
}

const isP2RoomProperty = (property: PropertyOption) =>
  isP2RoomNickname(property.nickname) ||
  isP2RoomNickname(property.listingNickname) ||
  isP2RoomNickname(property.id)

export const filterTemplateAutoAssignPropertyOptions = (
  properties: PropertyOption[],
) =>
  sortPropertyOptions(
    properties.filter((property) => {
      if (isYallaP2Property(property) || isP2RoomProperty(property)) {
        return true
      }
      return (
        !isMtlPropertyType(property.type) && !property.mtlPrincipalId?.trim()
      )
    }),
  )

export const filterBookingsPlannerPropertyOptions = (
  properties: PropertyOption[],
) =>
  sortPropertyOptions(
    properties.filter((property) => {
      if (isP2RoomProperty(property)) {
        return true
      }
      return (
        !isMtlPropertyType(property.type) && !property.mtlPrincipalId?.trim()
      )
    }),
  )

export const filterMovementsPropertyOptions = (properties: PropertyOption[]) => {
  const eligible = properties.filter((property) => {
    if (isP2RoomProperty(property)) {
      return false
    }
    if (isYallaP2Property(property) || isOtherProperty(property)) {
      return true
    }
    return !isMtlPropertyType(property.type) && !property.mtlPrincipalId?.trim()
  })
  const p2 = sortPropertyOptions(eligible.filter(isYallaP2Property))
  const other = eligible.filter(isOtherProperty)
  const rest = sortPropertyOptions(
    eligible.filter(
      (property) => !isYallaP2Property(property) && !isOtherProperty(property),
    ),
  )
  return [...p2, ...rest, ...other]
}
