import { defineFunction } from '@aws-amplify/backend';

export const getMyPermissions = defineFunction({
  runtime: 22,
  name: 'GetMyPermissions',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
