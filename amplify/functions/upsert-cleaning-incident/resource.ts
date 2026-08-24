import { defineFunction } from '@aws-amplify/backend';

export const upsertCleaningIncident = defineFunction({
  runtime: 22,
  name: 'UpsertCleaningIncident',
  entry: './handler.ts',
  environment: {
    VISITS_TABLE: 'yalla-visits',
    PROPERTIES_TABLE: 'yalla-properties',
    CLEANING_VISIT_TYPE_ID: 'visit_type_cleaning',
  },
  timeoutSeconds: 30,
});
