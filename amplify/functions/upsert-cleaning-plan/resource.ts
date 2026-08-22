import { defineFunction } from '@aws-amplify/backend';

export const upsertCleaningPlan = defineFunction({
  runtime: 22,
  name: 'UpsertCleaningPlan',
  entry: './handler.ts',
  environment: {
    VISITS_TABLE: 'yalla-visits',
    CLEANING_VISIT_TYPE_ID: 'visit_type_cleaning',
    SYNC_TASK_TO_GUESTY_FUNCTION: 'yalla-syncTaskToGuesty',
  },
  timeoutSeconds: 60,
});
