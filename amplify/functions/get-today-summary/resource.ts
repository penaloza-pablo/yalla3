import { defineFunction } from '@aws-amplify/backend';

export const getTodaySummary = defineFunction({
  runtime: 22,
  name: 'GetTodaySummary',
  entry: './handler.ts',
  environment: {
    VISITS_TABLE: 'yalla-visits',
    INVENTORY_TABLE: 'yalla-inventory',
    REVIEWS_TABLE: 'yalla-reviews',
    CLEANING_VISIT_TYPE_ID: 'visit_type_cleaning',
    MAINTENANCE_VISIT_TYPE_ID: 'visit_type_maintenance',
  },
  timeoutSeconds: 30,
});
