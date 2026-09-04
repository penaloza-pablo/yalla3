import { defineFunction } from '@aws-amplify/backend';

export const upsertSlackNotification = defineFunction({
  runtime: 22,
  name: 'UpsertSlackNotification',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
