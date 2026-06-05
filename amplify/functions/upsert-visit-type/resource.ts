import { defineFunction } from '@aws-amplify/backend';

export const upsertVisitType = defineFunction({
  runtime: 22,
  name: 'UpsertVisitType',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-visit_types',
  },
  timeoutSeconds: 20,
});
