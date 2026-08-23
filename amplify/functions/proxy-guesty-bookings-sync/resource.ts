import { defineFunction } from '@aws-amplify/backend';

export const proxyGuestyBookingsSync = defineFunction({
  runtime: 22,
  name: 'ProxyGuestyBookingsSync',
  entry: './handler.ts',
  environment: {
    UPSTREAM_URL:
      'https://jwi6hjcbrqanjnajx3hksic3wu0etfku.lambda-url.eu-central-1.on.aws/',
  },
  timeoutSeconds: 120,
});
