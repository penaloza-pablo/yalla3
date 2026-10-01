import {
  billingPropertyGroupOf,
  isOtherPropertyKey,
  isP2PropertyKey,
  propertyGroupOf,
} from '../../amplify/functions/shared/cleaning-property-groups'
import type { CleaningBillingPropertyGroup } from './types'

export {
  billingPropertyGroupOf,
  isOtherPropertyKey,
  isP2PropertyKey,
  propertyGroupOf,
}

export const PROPERTY_GROUP_CHIPS: CleaningBillingPropertyGroup[] = [
  'p2',
  'apartments',
  'other',
]

export const BILLING_PROPERTY_GROUP_CHIPS: CleaningBillingPropertyGroup[] = [
  'p2',
  'apartments',
]
