import { defineFunction } from '@aws-amplify/backend';

export const getInventoryRebuy = defineFunction({
  runtime: 22,
  name: 'GetInventoryRebuy',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-inventory',
  },
  timeoutSeconds: 20,
});
