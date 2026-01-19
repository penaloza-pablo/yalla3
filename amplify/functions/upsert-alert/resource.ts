import { defineFunction } from '@aws-amplify/backend';

export const upsertAlert = defineFunction({
  name: 'UpsertAlert',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-alarms',
  },
  timeoutSeconds: 20,
});
