import { defineFunction } from '@aws-amplify/backend';

export const updateAlertStatus = defineFunction({
  name: 'UpdateAlertStatus',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-alarms',
  },
  timeoutSeconds: 20,
});
