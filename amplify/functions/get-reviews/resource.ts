import { defineFunction } from '@aws-amplify/backend';

export const getReviews = defineFunction({
  name: 'GetReviews',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-reviews',
  },
  timeoutSeconds: 20,
});
