import { defineFunction } from '@aws-amplify/backend';

export const exportInventory = defineFunction({
  name: 'ExportInventory',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-inventory',
    BUCKET_NAME: 'yalla-s3storage',
    BUCKET_PREFIX: 'inventory/',
  },
  timeoutSeconds: 30,
});
