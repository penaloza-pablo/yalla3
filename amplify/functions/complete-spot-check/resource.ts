import { defineFunction } from '@aws-amplify/backend';

export const completeSpotCheck = defineFunction({
  runtime: 22,
  name: 'CompleteSpotCheck',
  entry: './handler.ts',
  environment: {
    INVENTORY_TABLE: 'yalla-inventory',
    BUCKET_NAME: 'yalla-s3storage',
    BUCKET_PREFIX: 'inventory/',
  },
  timeoutSeconds: 60,
});
