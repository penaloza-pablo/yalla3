import { defineFunction } from '@aws-amplify/backend';

export const exportMaintenanceBilling = defineFunction({
  runtime: 22,
  name: 'ExportMaintenanceBilling',
  entry: './handler.ts',
  environment: {
    BUCKET_NAME: 'yalla-s3storage',
    BUCKET_PREFIX: 'maintenance/',
  },
  timeoutSeconds: 40,
});
