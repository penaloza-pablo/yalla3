import { defineFunction } from '@aws-amplify/backend';

export const getCases = defineFunction({
  runtime: 22,
  name: 'GetCases',
  entry: './handler.ts',
  timeoutSeconds: 30,
  environment: {
    CASES_TABLE: 'yalla-cases',
    CASE_EVENTS_TABLE: 'yalla-case-events',
    VISITS_TABLE: 'yalla-visits',
    PROPERTIES_TABLE: 'yalla-properties',
    MOVEMENTS_TABLE: 'yalla-finance-movements',
  },
});
