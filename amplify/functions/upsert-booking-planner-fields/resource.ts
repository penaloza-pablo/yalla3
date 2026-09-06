import { defineFunction } from '@aws-amplify/backend';

export const upsertBookingPlannerFields = defineFunction({
  runtime: 22,
  name: 'UpsertBookingPlannerFields',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-bookings-planner-settings',
    BOOKINGS_TABLE: 'yalla-bookings',
  },
  timeoutSeconds: 30,
});
