import { defineFunction } from '@aws-amplify/backend';

export const getCheckInTracker = defineFunction({
  runtime: 22,
  name: 'GetCheckInTracker',
  entry: './handler.ts',
  environment: {
    BOOKINGS_TABLE: 'yalla-bookings',
    VISITS_TABLE: 'yalla-visits',
  },
  timeoutSeconds: 30,
});
