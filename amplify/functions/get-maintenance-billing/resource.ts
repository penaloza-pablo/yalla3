import { defineFunction } from '@aws-amplify/backend';

export const getMaintenanceBilling = defineFunction({
  runtime: 22,
  name: 'GetMaintenanceBilling',
  entry: './handler.ts',
  environment: {
    VISITS_TABLE: 'yalla-visits',
    PROPERTIES_TABLE: 'yalla-properties',
    VISIT_TYPES_TABLE: 'yalla-visit_types',
    MAINTENANCE_VISIT_TYPE_ID: 'visit_type_maintenance',
    MAINTENANCE_TEAM_ID: 'team_maintenance',
    CLEANING_VISIT_TYPE_ID: 'visit_type_cleaning',
  },
  timeoutSeconds: 40,
});
