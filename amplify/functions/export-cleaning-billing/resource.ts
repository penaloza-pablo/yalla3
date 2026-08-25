import { defineFunction } from '@aws-amplify/backend';

export const exportCleaningBilling = defineFunction({
  runtime: 22,
  name: 'ExportCleaningBilling',
  entry: './handler.ts',
  environment: {
    BUCKET_NAME: 'yalla-s3storage',
    BUCKET_PREFIX: 'cleaning/',
  },
  timeoutSeconds: 40,
});
