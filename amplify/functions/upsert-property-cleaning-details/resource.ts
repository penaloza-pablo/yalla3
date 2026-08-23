import { defineFunction } from '@aws-amplify/backend';

export const upsertPropertyCleaningDetails = defineFunction({
  runtime: 22,
  name: 'UpsertPropertyCleaningDetails',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
