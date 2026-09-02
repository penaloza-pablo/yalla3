import { defineFunction } from '@aws-amplify/backend';

export const notifyCleaningOverdue = defineFunction({
  runtime: 22,
  name: 'NotifyCleaningOverdue',
  entry: './handler.ts',
  environment: {
    SLACK_SECRET_ID: 'yalla/slack',
    TABLE_NAME: 'yalla-visits',
    CLEANING_VISIT_TYPE_ID: 'visit_type_cleaning',
  },
  schedule: 'every 1m',
  timeoutSeconds: 30,
});
