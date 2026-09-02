import { defineFunction } from '@aws-amplify/backend';

export const upsertUserRole = defineFunction({
  runtime: 22,
  name: 'UpsertUserRole',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
