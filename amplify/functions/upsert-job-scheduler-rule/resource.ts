import { defineFunction } from '@aws-amplify/backend';

export const upsertJobSchedulerRule = defineFunction({
  runtime: 22,
  name: 'UpsertJobSchedulerRule',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
