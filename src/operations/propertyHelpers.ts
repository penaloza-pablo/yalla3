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
import {
  groupedMemberIdSet,
  isReportGroupRecord,
  isReportGroupType,
  resolveReportGroups,
} from '../../amplify/functions/shared/property-groups'

export { isP2RoomNickname }

export const getPropertyLabel = (property: PropertyOption) =>
  resolveYallaPropertyLabel({
    id: property.id,
    nickname: property.nickname,
    listingNickname: property.listingNickname,
    title: property.title,
  })

export const getListingNicknameLabel = (property: PropertyOption) =>
  property.listingNickname.trim() || getPropertyLabel(property)

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
        !isReportGroupType(property.type) &&
        !isMtlPropertyType(property.type) &&
        !property.mtlPrincipalId?.trim(),
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

export { isYallaP2Property }

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

const toGroupOption = (
  group: ReturnType<typeof resolveReportGroups>[number],
  properties: PropertyOption[],
): PropertyOption => {
  const stored = properties.find((property) => property.id === group.id)
  return {
    id: group.id,
    nickname: group.name,
    listingNickname: stored?.listingNickname || group.name,
    title: stored?.title || group.name,
    type:
      stored?.type ||
      (group.id === P2_BUILDING_ID ? 'MTL_PRINCIPAL' : 'REPORT_GROUP'),
    mtlPrincipalId: stored?.mtlPrincipalId,
    memberIds: group.memberIds,
  }
}

export const isFinanceGroupProperty = (property: PropertyOption) =>
  isReportGroupType(property.type) || isYallaP2Property(property)

export const filterMovementsPropertyOptions = (properties: PropertyOption[]) => {
  const groups = resolveReportGroups(properties)
  const groupIds = new Set(groups.map((group) => group.id))
  const eligible = properties.filter((property) => {
    if (isP2RoomProperty(property)) {
      return false
    }
    if (isFinanceGroupProperty(property) || groupIds.has(property.id)) {
      return true
    }
    if (isOtherProperty(property)) {
      return true
    }
    return !isMtlPropertyType(property.type) && !property.mtlPrincipalId?.trim()
  })
  const eligibleIds = new Set(eligible.map((property) => property.id))
  const missingGroups = groups
    .filter((group) => !eligibleIds.has(group.id))
    .map((group) => toGroupOption(group, properties))
  const all = [...eligible, ...missingGroups]
  const p2 = sortPropertyOptions(all.filter(isYallaP2Property))
  const groupOptions = sortPropertyOptions(
    all.filter(
      (property) =>
        !isYallaP2Property(property) &&
        (isReportGroupType(property.type) || groupIds.has(property.id)),
    ),
  )
  const other = all.filter(isOtherProperty)
  const rest = sortPropertyOptions(
    all.filter(
      (property) =>
        !isYallaP2Property(property) &&
        !isOtherProperty(property) &&
        !isReportGroupType(property.type) &&
        !groupIds.has(property.id),
    ),
  )
  return [...p2, ...groupOptions, ...rest, ...other]
}

export const partitionFinancePropertyOptions = (properties: PropertyOption[]) => {
  const groups = properties.filter(isFinanceGroupProperty)
  const other = properties.filter(isOtherProperty)
  const listings = properties.filter(
    (property) => !isFinanceGroupProperty(property) && !isOtherProperty(property),
  )
  return { groups, listings, other }
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
  isYallaP2Property(property) ||
  isP2BuildingId(property.id) ||
  isReportGroupType(property.type)
    ? property.nickname || PLANTA_2_REPORT_NAME
    : getPropertyLabel(property)

export const filterPropertyReportsOptions = (properties: PropertyOption[]) => {
  const groups = resolveReportGroups(properties)
  const memberIds = groupedMemberIdSet(groups)
  const rest = properties.filter((property) => {
    if (isReportGroupRecord(property) || memberIds.has(property.id)) {
      return false
    }
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
  const groupOptions: PropertyOption[] = groups.map((group) => {
    const stored = properties.find((property) => property.id === group.id)
    return {
      id: group.id,
      nickname: group.name,
      listingNickname: stored?.listingNickname || group.name,
      title: stored?.title || group.name,
      type: stored?.type || (group.id === P2_BUILDING_ID ? 'MTL_PRINCIPAL' : 'REPORT_GROUP'),
      mtlPrincipalId: stored?.mtlPrincipalId,
      memberIds: group.memberIds,
    }
  })
  return sortPropertyOptions([...groupOptions, ...rest])
}
