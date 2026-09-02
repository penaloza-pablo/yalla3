import { defineFunction } from '@aws-amplify/backend';

export const upsertRole = defineFunction({
  runtime: 22,
  name: 'UpsertRole',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
