import { defineFunction } from '@aws-amplify/backend';

export const upsertFinanceService = defineFunction({
  runtime: 22,
  name: 'UpsertFinanceService',
  entry: './handler.ts',
  environment: {
    PROPERTIES_TABLE: 'yalla-properties',
  },
  timeoutSeconds: 20,
});
