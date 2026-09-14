import { defineFunction } from '@aws-amplify/backend';

export const applyBookingsPlanner = defineFunction({
  runtime: 22,
  name: 'ApplyBookingsPlanner',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-bookings-planner-settings',
    BOOKINGS_TABLE: 'yalla-bookings',
    SLACK_SECRET_ID: 'yalla/slack',
  },
  timeoutSeconds: 120,
  memoryMB: 512,
});
