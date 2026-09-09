import { defineFunction } from '@aws-amplify/backend';

export const materializeFinanceServices = defineFunction({
  runtime: 22,
  name: 'MaterializeFinanceServices',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-finance-services',
  },
  schedule: '15 0 * * ? *',
  timeoutSeconds: 60,
});
