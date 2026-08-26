import { defineFunction } from '@aws-amplify/backend';

export const upsertCleaner = defineFunction({
  runtime: 22,
  name: 'UpsertCleaner',
  entry: './handler.ts',
  environment: {
    VISITS_TABLE: 'yalla-visits',
    CLEANING_VISIT_TYPE_ID: 'visit_type_cleaning',
  },
  timeoutSeconds: 60,
});
