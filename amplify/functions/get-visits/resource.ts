import { defineFunction } from '@aws-amplify/backend';

export const getVisits = defineFunction({
  runtime: 22,
  name: 'GetVisits',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-visits',
    TASKS_TABLE: 'yalla-tasks',
  },
  timeoutSeconds: 30,
});
