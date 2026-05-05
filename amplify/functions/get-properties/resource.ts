import { defineFunction } from '@aws-amplify/backend';

export const getProperties = defineFunction({
  name: 'GetProperties',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-properties',
  },
  timeoutSeconds: 20,
});
