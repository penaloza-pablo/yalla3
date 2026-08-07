import { defineFunction } from '@aws-amplify/backend';

export const getSubtractions = defineFunction({
  runtime: 22,
  name: 'GetSubtractions',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-substractions',
  },
  timeoutSeconds: 20,
});
