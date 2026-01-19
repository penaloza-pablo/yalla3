import { defineFunction } from '@aws-amplify/backend';

export const getInventoryRebuy = defineFunction({
  name: 'GetInventoryRebuy',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-inventory',
  },
  timeoutSeconds: 20,
});
