import { defineFunction } from '@aws-amplify/backend';

export const updateReviewWorkflow = defineFunction({
  runtime: 22,
  name: 'UpdateReviewWorkflow',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-reviews',
  },
  timeoutSeconds: 20,
});
