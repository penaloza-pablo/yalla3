import { defineFunction } from '@aws-amplify/backend';

export const getYallaServices = defineFunction({
  runtime: 22,
  name: 'GetYallaServices',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
