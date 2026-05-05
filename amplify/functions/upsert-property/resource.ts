import { defineFunction } from '@aws-amplify/backend';

export const upsertProperty = defineFunction({
  name: 'UpsertProperty',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-properties',
  },
  timeoutSeconds: 20,
});
