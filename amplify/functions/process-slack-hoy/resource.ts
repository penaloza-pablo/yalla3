import { defineFunction } from '@aws-amplify/backend';

export const processSlackHoy = defineFunction({
  runtime: 22,
  name: 'ProcessSlackHoy',
  entry: './handler.ts',
  timeoutSeconds: 30,
});
