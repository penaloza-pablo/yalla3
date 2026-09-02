import { defineFunction } from '@aws-amplify/backend';

export const getRoles = defineFunction({
  runtime: 22,
  name: 'GetRoles',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
