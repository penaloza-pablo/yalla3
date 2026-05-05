import { defineFunction } from '@aws-amplify/backend';

export const getExternalProperties = defineFunction({
  name: 'GetExternalProperties',
  entry: './handler.ts',
  environment: {
    EXTERNAL_PROPERTIES_URL:
      'https://pgkntvnjnvqrlgmeboqebwa33u0ydznp.lambda-url.eu-central-1.on.aws/',
  },
  timeoutSeconds: 20,
});
