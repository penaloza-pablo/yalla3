import { defineFunction } from '@aws-amplify/backend';

export const getReviewsSyncState = defineFunction({
  name: 'GetReviewsSyncState',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-reviewsync-state',
    STATE_ID: 'reviews',
  },
  timeoutSeconds: 20,
});
