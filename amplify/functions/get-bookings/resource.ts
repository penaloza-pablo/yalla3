import { defineFunction } from '@aws-amplify/backend';

export const getBookings = defineFunction({
  runtime: 22,
  name: 'GetBookings',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-bookings',
  },
  timeoutSeconds: 20,
});
