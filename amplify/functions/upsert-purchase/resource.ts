import { defineFunction } from '@aws-amplify/backend';

export const upsertPurchase = defineFunction({
  name: 'UpsertPurchase',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-purchases',
    INVENTORY_TABLE: 'yalla-inventory',
  },
  timeoutSeconds: 20,
});
