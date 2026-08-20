import { defineFunction } from '@aws-amplify/backend';

export const getActivityLogs = defineFunction({
  runtime: 22,
  name: 'GetActivityLogs',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
