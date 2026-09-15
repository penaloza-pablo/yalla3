import { defineFunction } from '@aws-amplify/backend';

export const upsertCheckInTracker = defineFunction({
  runtime: 22,
  name: 'UpsertCheckInTracker',
  entry: './handler.ts',
  environment: {
    BOOKINGS_TABLE: 'yalla-bookings',
  },
  timeoutSeconds: 30,
});
