import { defineFunction } from '@aws-amplify/backend';

export const deleteProperty = defineFunction({
  runtime: 22,
  name: 'DeleteProperty',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-properties',
  },
  timeoutSeconds: 20,
});
