import { defineFunction } from '@aws-amplify/backend';

export const getInventory = defineFunction({
  runtime: 22,
  name: 'GetInventory',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-inventory',
  },
  timeoutSeconds: 20,
});
