import type { CleaningBillingPropertyGroup } from './types'

export const PROPERTY_GROUP_CHIPS: CleaningBillingPropertyGroup[] = [
  'p2',
  'apartments',
  'other',
]

const P2_KEYS = new Set([
  'p2',
  '201',
  '202',
  '203',
  '204',
  '205',
  '206',
  '207',
  '208',
  '209',
  '210',
  '211',
  '212',
])

const normalizeKey = (value: string) => value.trim().toLowerCase()

export const isOtherPropertyKey = (value: string) =>
  normalizeKey(value) === 'other'

export const isP2PropertyKey = (value: string) => P2_KEYS.has(normalizeKey(value))

export const propertyGroupOf = (
  label: string,
  propertyId = '',
): CleaningBillingPropertyGroup => {
  if (isOtherPropertyKey(label) || isOtherPropertyKey(propertyId)) {
    return 'other'
  }
  if (isP2PropertyKey(label) || isP2PropertyKey(propertyId)) {
    return 'p2'
  }
  return 'apartments'
}
