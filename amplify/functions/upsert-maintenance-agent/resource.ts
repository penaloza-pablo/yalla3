import { defineFunction } from '@aws-amplify/backend';

export const upsertMaintenanceAgent = defineFunction({
  runtime: 22,
  name: 'UpsertMaintenanceAgent',
  entry: './handler.ts',
  environment: {
    USERS_TABLE: 'yalla-users',
  },
  timeoutSeconds: 20,
});
