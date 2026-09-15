import { defineFunction } from '@aws-amplify/backend';

export const getJobScheduler = defineFunction({
  runtime: 22,
  name: 'GetJobScheduler',
  entry: './handler.ts',
  environment: {
    VISITS_TABLE: 'yalla-visits',
    TEMPLATES_TABLE: 'yalla-visit-templates',
    CLEANING_VISIT_TYPE_ID: 'visit_type_cleaning',
  },
  timeoutSeconds: 60,
});
