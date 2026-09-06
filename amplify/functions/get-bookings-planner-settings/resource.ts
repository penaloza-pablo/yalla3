import { defineFunction } from '@aws-amplify/backend';

export const getBookingsPlannerSettings = defineFunction({
  runtime: 22,
  name: 'GetBookingsPlannerSettings',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-bookings-planner-settings',
  },
  timeoutSeconds: 15,
});
