import { defineFunction } from '@aws-amplify/backend';

export const handleSlackCommand = defineFunction({
  runtime: 22,
  name: 'HandleSlackCommand',
  entry: './handler.ts',
  environment: {
    SLACK_SECRET_ID: 'yalla/slack',
    TABLE_NAME: 'yalla-visits',
    VISITS_TABLE: 'yalla-visits',
    TASKS_TABLE: 'yalla-tasks',
    SYNC_TASK_TO_GUESTY_FUNCTION: 'yalla-syncTaskToGuesty',
    CLEANING_VISIT_TYPE_ID: 'visit_type_cleaning',
  },
  timeoutSeconds: 25,
});
