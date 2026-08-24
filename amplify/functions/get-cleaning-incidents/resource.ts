import { defineFunction } from '@aws-amplify/backend';

export const getCleaningIncidents = defineFunction({
  runtime: 22,
  name: 'GetCleaningIncidents',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
