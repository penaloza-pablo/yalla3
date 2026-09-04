import { defineFunction } from '@aws-amplify/backend';

export const getSlackNotifications = defineFunction({
  runtime: 22,
  name: 'GetSlackNotifications',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
