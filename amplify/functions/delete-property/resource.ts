import { defineFunction } from '@aws-amplify/backend';

export const deleteProperty = defineFunction({
  name: 'DeleteProperty',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-properties',
  },
  timeoutSeconds: 20,
});
