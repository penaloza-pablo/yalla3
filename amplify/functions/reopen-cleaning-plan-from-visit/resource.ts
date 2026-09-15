import { defineFunction } from '@aws-amplify/backend';

export const reopenCleaningPlanFromVisit = defineFunction({
  runtime: 22,
  name: 'ReopenCleaningPlanFromVisit',
  entry: './handler.ts',
  environment: {
    BOOKINGS_TABLE: 'yalla-bookings',
    SLACK_SECRET_ID: 'yalla/slack',
    APP_BASE_URL: 'https://main.dd8kh4wy2zlme.amplifyapp.com',
  },
  timeoutSeconds: 30,
});
