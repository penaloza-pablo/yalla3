import { isP2RoomListingId } from './property-identity';

export type CleaningBillingPropertyGroup = 'p2' | 'apartments' | 'other';

export const P2_ROOM_KEYS = [
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
] as const;

const P2_KEYS = new Set(['p2', ...P2_ROOM_KEYS]);

const normalizeKey = (value: string) => value.trim().toLowerCase();

export const isOtherPropertyKey = (value: string) =>
  normalizeKey(value) === 'other';

export const isP2PropertyKey = (value: string) =>
  P2_KEYS.has(normalizeKey(value));

export const propertyGroupOf = (
  label: string,
  propertyId = '',
): CleaningBillingPropertyGroup => {
  if (isOtherPropertyKey(label) || isOtherPropertyKey(propertyId)) {
    return 'other';
  }
  if (
    isP2PropertyKey(label) ||
    isP2PropertyKey(propertyId) ||
    isP2RoomListingId(propertyId)
  ) {
    return 'p2';
  }
  return 'apartments';
};

export const billingPropertyGroupOf = (
  label: string,
  propertyId = '',
): 'p2' | 'apartments' => {
  const group = propertyGroupOf(label, propertyId);
  return group === 'p2' ? 'p2' : 'apartments';
};
