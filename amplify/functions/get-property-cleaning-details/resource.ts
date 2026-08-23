import { defineFunction } from '@aws-amplify/backend';

export const getPropertyCleaningDetails = defineFunction({
  runtime: 22,
  name: 'GetPropertyCleaningDetails',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
