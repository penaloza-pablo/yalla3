import { defineFunction } from '@aws-amplify/backend';

export const getMaintenanceProviders = defineFunction({
  runtime: 22,
  name: 'GetMaintenanceProviders',
  entry: './handler.ts',
  timeoutSeconds: 40,
});
