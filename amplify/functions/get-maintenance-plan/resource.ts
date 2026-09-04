import { defineFunction } from '@aws-amplify/backend';

export const getMaintenancePlan = defineFunction({
  runtime: 22,
  name: 'GetMaintenancePlan',
  entry: './handler.ts',
  environment: {
    VISITS_TABLE: 'yalla-visits',
    TEAMS_TABLE: 'yalla-teams',
  },
  timeoutSeconds: 30,
});
