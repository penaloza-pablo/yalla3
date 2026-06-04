import { defineFunction } from '@aws-amplify/backend';

export const deleteInventory = defineFunction({
  runtime: 22,
  name: 'DeleteInventory',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-inventory',
  },
  timeoutSeconds: 20,
});
