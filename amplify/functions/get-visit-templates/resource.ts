import { defineFunction } from '@aws-amplify/backend';

export const getVisitTemplates = defineFunction({
  runtime: 22,
  name: 'GetVisitTemplates',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-visit-templates',
  },
  timeoutSeconds: 20,
});
