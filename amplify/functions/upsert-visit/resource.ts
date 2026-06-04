import { defineFunction } from '@aws-amplify/backend';

export const upsertVisit = defineFunction({
  runtime: 22,
  name: 'UpsertVisit',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-visits',
    TASKS_TABLE: 'yalla-tasks',
  },
  timeoutSeconds: 30,
});
