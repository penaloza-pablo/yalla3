import type { PropertyOption } from './types'

export const getPropertyLabel = (property: PropertyOption) =>
  property.listingNickname || property.nickname || property.title || property.id

export const sortPropertyOptions = (properties: PropertyOption[]) =>
  [...properties].sort((a, b) =>
    getPropertyLabel(a).localeCompare(getPropertyLabel(b), undefined, {
      sensitivity: 'base',
    }),
  )
