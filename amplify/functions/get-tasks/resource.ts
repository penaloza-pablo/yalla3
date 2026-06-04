import { defineFunction } from '@aws-amplify/backend';

export const getTasks = defineFunction({
  runtime: 22,
  name: 'GetTasks',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-tasks',
  },
  timeoutSeconds: 30,
});
