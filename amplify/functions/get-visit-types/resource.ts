import { defineFunction } from '@aws-amplify/backend';

export const getVisitTypes = defineFunction({
  runtime: 22,
  name: 'GetVisitTypes',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-visit_types',
  },
  timeoutSeconds: 20,
});
