import { defineFunction } from '@aws-amplify/backend';

export const getCleaners = defineFunction({
  runtime: 22,
  name: 'GetCleaners',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
