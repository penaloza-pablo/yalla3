import { defineFunction } from '@aws-amplify/backend';

export const upsertMaintenanceIncident = defineFunction({
  runtime: 22,
  name: 'UpsertMaintenanceIncident',
  entry: './handler.ts',
  environment: {
    VISITS_TABLE: 'yalla-visits',
    PROPERTIES_TABLE: 'yalla-properties',
    MAINTENANCE_VISIT_TYPE_ID: 'visit_type_maintenance',
  },
  timeoutSeconds: 30,
});
