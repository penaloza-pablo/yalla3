import { defineFunction } from '@aws-amplify/backend';

export const getMaintenanceAgents = defineFunction({
  runtime: 22,
  name: 'GetMaintenanceAgents',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
