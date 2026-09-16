import { defineFunction } from '@aws-amplify/backend';

export const applyBookingsPlanner = defineFunction({
  runtime: 22,
  name: 'ApplyBookingsPlanner',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-bookings-planner-settings',
    BOOKINGS_TABLE: 'yalla-bookings',
    VISITS_TABLE: 'yalla-visits',
    PROPERTIES_TABLE: 'yalla-properties',
    SLACK_SECRET_ID: 'yalla/slack',
    APP_BASE_URL: 'https://main.dd8kh4wy2zlme.amplifyapp.com',
  },
  timeoutSeconds: 120,
  memoryMB: 512,
});
