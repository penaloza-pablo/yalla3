import { defineFunction } from '@aws-amplify/backend';

export const getFinanceMovements = defineFunction({
  runtime: 22,
  name: 'GetFinanceMovements',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
