import type { PropertyOption } from './types'
import {
  isP2BuildingId,
  isP2RoomListingId,
  isP2RoomNickname,
  resolveYallaPropertyLabel,
} from '../../amplify/functions/shared/property-identity'

export { isP2RoomNickname }

export const getPropertyLabel = (property: PropertyOption) =>
  resolveYallaPropertyLabel({
    id: property.id,
    nickname: property.nickname,
    listingNickname: property.listingNickname,
    title: property.title,
  })

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

const isMtlPrincipalType = (type?: string) =>
  (type ?? '').trim().toUpperCase() === 'MTL_PRINCIPAL'

const isYallaP2Property = (property: PropertyOption) => {
  if (isMtlPrincipalType(property.type) || isP2BuildingId(property.id)) {
    return true
  }
  const label = getPropertyLabel(property).trim().toLowerCase()
  return label === 'p2'
}

const isP2RoomProperty = (property: PropertyOption) =>
  isP2RoomListingId(property.id) ||
  isP2RoomNickname(property.nickname) ||
  isP2RoomNickname(property.listingNickname)

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
