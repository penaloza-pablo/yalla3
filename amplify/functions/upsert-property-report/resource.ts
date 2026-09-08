import { defineFunction } from '@aws-amplify/backend';

export const upsertPropertyReport = defineFunction({
  runtime: 22,
  name: 'UpsertPropertyReport',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
