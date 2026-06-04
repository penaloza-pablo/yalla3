import { defineFunction } from '@aws-amplify/backend';

export const upsertAlert = defineFunction({
  runtime: 22,
  name: 'UpsertAlert',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-alarms',
  },
  timeoutSeconds: 20,
});
