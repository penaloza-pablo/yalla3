import { defineFunction } from '@aws-amplify/backend';

export const getReviewsSyncState = defineFunction({
  runtime: 22,
  name: 'GetReviewsSyncState',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-reviewsync-state',
    STATE_ID: 'reviews',
  },
  timeoutSeconds: 20,
});
