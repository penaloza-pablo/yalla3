import { defineFunction } from '@aws-amplify/backend';

export const getPropertyReport = defineFunction({
  runtime: 22,
  name: 'GetPropertyReport',
  entry: './handler.ts',
  environment: {
    VISITS_TABLE: 'yalla-visits',
    BOOKINGS_TABLE: 'yalla-bookings',
    PROPERTIES_TABLE: 'yalla-properties',
    VISIT_TYPES_TABLE: 'yalla-visit_types',
    MAINTENANCE_VISIT_TYPE_ID: 'visit_type_maintenance',
    MAINTENANCE_TEAM_ID: 'team_maintenance',
    CLEANING_VISIT_TYPE_ID: 'visit_type_cleaning',
    SUBTRACTIONS_TABLE: 'yalla-substractions',
    MOVEMENTS_TABLE: 'yalla-finance-movements',
    SERVICES_TABLE: 'yalla-finance-services',
    INVENTORY_TABLE: 'yalla-inventory',
  },
  timeoutSeconds: 60,
  memoryMB: 512,
});
