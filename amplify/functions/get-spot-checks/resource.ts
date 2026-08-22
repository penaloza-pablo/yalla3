import { defineFunction } from '@aws-amplify/backend';

export const getSpotChecks = defineFunction({
  runtime: 22,
  name: 'GetSpotChecks',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
