import { defineFunction } from '@aws-amplify/backend';

export const getCleaningPlan = defineFunction({
  runtime: 22,
  name: 'GetCleaningPlan',
  entry: './handler.ts',
  environment: {
    VISITS_TABLE: 'yalla-visits',
    CLEANING_VISIT_TYPE_ID: 'visit_type_cleaning',
  },
  timeoutSeconds: 30,
});
