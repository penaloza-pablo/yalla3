import { defineFunction } from '@aws-amplify/backend';

export const upsertCleaner = defineFunction({
  runtime: 22,
  name: 'UpsertCleaner',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
