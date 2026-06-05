import { defineFunction } from '@aws-amplify/backend';

export const upsertVisitTemplate = defineFunction({
  runtime: 22,
  name: 'UpsertVisitTemplate',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-visit-templates',
  },
  timeoutSeconds: 20,
});
