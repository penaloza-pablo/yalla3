import { defineFunction } from '@aws-amplify/backend';

export const proxyGuestyListings = defineFunction({
  runtime: 22,
  name: 'ProxyGuestyListings',
  entry: './handler.ts',
  environment: {
    UPSTREAM_URL:
      'https://pgkntvnjnvqrlgmeboqebwa33u0ydznp.lambda-url.eu-central-1.on.aws/',
  },
  timeoutSeconds: 60,
});
