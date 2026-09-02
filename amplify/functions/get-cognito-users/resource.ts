import { defineFunction } from '@aws-amplify/backend';

export const getCognitoUsers = defineFunction({
  runtime: 22,
  name: 'GetCognitoUsers',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
