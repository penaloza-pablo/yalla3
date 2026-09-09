import { defineFunction } from '@aws-amplify/backend';

export const getFinanceServices = defineFunction({
  runtime: 22,
  name: 'GetFinanceServices',
  entry: './handler.ts',
  schedule: '15 0 * * ? *',
  timeoutSeconds: 60,
});
