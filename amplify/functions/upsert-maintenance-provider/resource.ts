import { defineFunction } from '@aws-amplify/backend';

export const upsertMaintenanceProvider = defineFunction({
  runtime: 22,
  name: 'UpsertMaintenanceProvider',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
