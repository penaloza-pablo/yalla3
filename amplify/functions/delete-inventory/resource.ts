import { defineFunction } from '@aws-amplify/backend';

export const deleteInventory = defineFunction({
  name: 'DeleteInventory',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-inventory',
  },
  timeoutSeconds: 20,
});
