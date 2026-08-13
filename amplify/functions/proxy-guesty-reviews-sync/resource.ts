import { defineFunction } from '@aws-amplify/backend';

export const proxyGuestyReviewsSync = defineFunction({
  runtime: 22,
  name: 'ProxyGuestyReviewsSync',
  entry: './handler.ts',
  environment: {
    UPSTREAM_URL:
      'https://r3faghrqj3o4x7b4noa53f4gee0pmnpf.lambda-url.eu-central-1.on.aws/',
  },
  timeoutSeconds: 120,
});
