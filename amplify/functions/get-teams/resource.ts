import { defineFunction } from '@aws-amplify/backend';

export const getTeams = defineFunction({
  runtime: 22,
  name: 'GetTeams',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-teams',
  },
  timeoutSeconds: 20,
});
