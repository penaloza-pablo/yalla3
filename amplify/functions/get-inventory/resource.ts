import { defineFunction } from '@aws-amplify/backend';

export const getInventory = defineFunction({
  name: 'GetInventory',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-inventory',
  },
  timeoutSeconds: 20,
});
