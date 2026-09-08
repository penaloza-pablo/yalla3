import { defineFunction } from '@aws-amplify/backend';

export const getFinanceServices = defineFunction({
  runtime: 22,
  name: 'GetFinanceServices',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
