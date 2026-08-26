import { defineFunction } from '@aws-amplify/backend';

export const upsertVisit = defineFunction({
  runtime: 22,
  name: 'UpsertVisit',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-visits',
    TASKS_TABLE: 'yalla-tasks',
    SYNC_TASK_TO_GUESTY_FUNCTION: 'yalla-syncTaskToGuesty',
    CLEANING_VISIT_TYPE_ID: 'visit_type_cleaning',
  },
  timeoutSeconds: 60,
});
