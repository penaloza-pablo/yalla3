import { defineFunction } from '@aws-amplify/backend';

export const upsertFinanceHistoricEvent = defineFunction({
  runtime: 22,
  name: 'UpsertFinanceHistoricEvent',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
