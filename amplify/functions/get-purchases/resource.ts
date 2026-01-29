import { defineFunction } from '@aws-amplify/backend';

export const getPurchases = defineFunction({
  name: 'GetPurchases',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-purchases',
  },
  timeoutSeconds: 20,
});
