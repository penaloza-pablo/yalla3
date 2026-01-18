import { defineFunction } from '@aws-amplify/backend';

export const upsertInventory = defineFunction({
  name: 'UpsertInventory',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-inventory',
  },
  timeoutSeconds: 20,
});
