import { defineFunction } from '@aws-amplify/backend';

export const upsertFinanceMovement = defineFunction({
  runtime: 22,
  name: 'UpsertFinanceMovement',
  entry: './handler.ts',
  environment: {
    PROPERTIES_TABLE: 'yalla-properties',
  },
  timeoutSeconds: 20,
});
