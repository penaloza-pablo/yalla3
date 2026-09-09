import { defineFunction } from '@aws-amplify/backend';

export const getCleaningBilling = defineFunction({
  runtime: 22,
  name: 'GetCleaningBilling',
  entry: './handler.ts',
  environment: {
    VISITS_TABLE: 'yalla-visits',
    CLEANING_VISIT_TYPE_ID: 'visit_type_cleaning',
    BOOKINGS_TABLE: 'yalla-bookings',
    PROPERTIES_TABLE: 'yalla-properties',
    INVENTORY_TABLE: 'yalla-inventory',
  },
  timeoutSeconds: 60,
});
