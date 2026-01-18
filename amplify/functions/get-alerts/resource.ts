import { defineFunction } from '@aws-amplify/backend';

export const getAlerts = defineFunction({
  name: 'GetAlerts',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-alarms',
  },
  timeoutSeconds: 20,
});
