import { defineFunction } from '@aws-amplify/backend';

export const exportSubtractions = defineFunction({
  runtime: 22,
  name: 'ExportSubtractions',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-substractions',
    BUCKET_NAME: 'yalla-s3storage',
    BUCKET_PREFIX: 'subtractions/',
  },
  timeoutSeconds: 30,
});
