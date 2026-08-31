import { defineFunction } from '@aws-amplify/backend';

export const handleSlackCommand = defineFunction({
  runtime: 22,
  name: 'HandleSlackCommand',
  entry: './handler.ts',
  environment: {
    SLACK_SECRET_ID: 'yalla/slack',
  },
  timeoutSeconds: 30,
});
