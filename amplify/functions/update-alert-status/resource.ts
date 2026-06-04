import { defineFunction } from '@aws-amplify/backend';

export const updateAlertStatus = defineFunction({
  runtime: 22,
  name: 'UpdateAlertStatus',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-alarms',
  },
  timeoutSeconds: 20,
});
