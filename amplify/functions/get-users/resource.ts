import { defineFunction } from '@aws-amplify/backend';

export const getUsers = defineFunction({
  runtime: 22,
  name: 'GetUsers',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-users',
  },
  timeoutSeconds: 20,
});
