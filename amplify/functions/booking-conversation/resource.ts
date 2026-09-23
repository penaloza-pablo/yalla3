import { defineFunction } from '@aws-amplify/backend';

export const bookingConversation = defineFunction({
  runtime: 22,
  name: 'BookingConversation',
  entry: './handler.ts',
  environment: {
    BOOKINGS_TABLE: 'yalla-bookings',
  },
  timeoutSeconds: 30,
  memoryMB: 512,
});
