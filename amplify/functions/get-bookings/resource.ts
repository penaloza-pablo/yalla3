import { defineFunction } from '@aws-amplify/backend';

export const getBookings = defineFunction({
  name: 'GetBookings',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-bookings',
  },
  timeoutSeconds: 20,
});
