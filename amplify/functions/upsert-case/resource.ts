import { defineFunction } from '@aws-amplify/backend';

export const upsertCase = defineFunction({
  runtime: 22,
  name: 'UpsertCase',
  entry: './handler.ts',
  timeoutSeconds: 30,
  environment: {
    CASES_TABLE: 'yalla-cases',
    CASE_EVENTS_TABLE: 'yalla-case-events',
    VISITS_TABLE: 'yalla-visits',
    PROPERTIES_TABLE: 'yalla-properties',
    TASKS_TABLE: 'yalla-tasks',
    MOVEMENTS_TABLE: 'yalla-finance-movements',
  },
});
