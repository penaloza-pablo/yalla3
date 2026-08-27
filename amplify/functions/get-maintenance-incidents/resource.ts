import { defineFunction } from '@aws-amplify/backend';

export const getMaintenanceIncidents = defineFunction({
  runtime: 22,
  name: 'GetMaintenanceIncidents',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
