import { defineFunction } from '@aws-amplify/backend';

export const getFinanceHistoric = defineFunction({
  runtime: 22,
  name: 'GetFinanceHistoric',
  entry: './handler.ts',
  timeoutSeconds: 60,
});
