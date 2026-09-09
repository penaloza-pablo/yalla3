import type { PropertyOption } from './types'
import {
  isJclStorageIdentity,
  isP2BuildingId,
  isP2RoomListingId,
  isP2RoomNickname,
  P2_BUILDING_ID,
  PLANTA_2_REPORT_NAME,
  PROPERTY_REPORTS_START_MONTH,
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

const shiftMonthId = (monthId: string, offset: number) => {
  const [year, month] = monthId.split('-').map(Number)
  const cursor = new Date(Date.UTC(year, month - 1 + offset, 1))
  return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`
}

export const listPropertyReportMonthIds = (todayIsoDate: string) => {
  const current = todayIsoDate.slice(0, 7)
  if (current < PROPERTY_REPORTS_START_MONTH) {
    return []
  }
  const ids: string[] = []
  let cursor = PROPERTY_REPORTS_START_MONTH
  while (cursor <= current) {
    ids.push(cursor)
    cursor = shiftMonthId(cursor, 1)
  }
  return ids.reverse()
}

export const propertyReportsLabel = (property: PropertyOption) =>
  isYallaP2Property(property) || isP2BuildingId(property.id)
    ? PLANTA_2_REPORT_NAME
    : getPropertyLabel(property)

export const filterPropertyReportsOptions = (properties: PropertyOption[]) => {
  const hasP2 = properties.some(
    (property) =>
      isP2BuildingId(property.id) ||
      isP2RoomProperty(property) ||
      isYallaP2Property(property),
  )
  const rest = properties.filter((property) => {
    if (isP2RoomProperty(property) || isYallaP2Property(property)) {
      return false
    }
    if (isOtherProperty(property)) {
      return false
    }
    if (
      isJclStorageIdentity({
        id: property.id,
        nickname: property.nickname,
        listingNickname: property.listingNickname,
        title: property.title,
      })
    ) {
      return false
    }
    if ((property.type ?? '').trim().toUpperCase() === 'MTL') {
      return false
    }
    return true
  })
  const building = properties.find((property) => isP2BuildingId(property.id))
  const planta2 = hasP2
    ? {
        id: P2_BUILDING_ID,
        nickname: PLANTA_2_REPORT_NAME,
        listingNickname: PLANTA_2_REPORT_NAME,
        title: building?.title || PLANTA_2_REPORT_NAME,
        type: building?.type,
        mtlPrincipalId: building?.mtlPrincipalId,
      }
    : null
  return sortPropertyOptions([...(planta2 ? [planta2] : []), ...rest])
}
