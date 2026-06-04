import { defineFunction } from '@aws-amplify/backend';

export const upsertTask = defineFunction({
  runtime: 22,
  name: 'UpsertTask',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-tasks',
    VISITS_TABLE: 'yalla-visits',
  },
  timeoutSeconds: 30,
});
