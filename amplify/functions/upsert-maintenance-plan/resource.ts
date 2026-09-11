import { defineFunction } from '@aws-amplify/backend';

export const upsertMaintenancePlan = defineFunction({
  runtime: 22,
  name: 'UpsertMaintenancePlan',
  entry: './handler.ts',
  environment: {
    VISITS_TABLE: 'yalla-visits',
    TEAMS_TABLE: 'yalla-teams',
    SYNC_TASK_TO_GUESTY_FUNCTION: 'yalla-syncTaskToGuesty',
    SLACK_SECRET_ID: 'yalla/slack',
    APP_BASE_URL: 'https://main.dd8kh4wy2zlme.amplifyapp.com',
  },
  timeoutSeconds: 60,
});
