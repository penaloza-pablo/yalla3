import { defineFunction } from '@aws-amplify/backend';

export const upsertSubtraction = defineFunction({
  runtime: 22,
  name: 'UpsertSubtraction',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-substractions',
    INVENTORY_TABLE: 'yalla-inventory',
  },
  timeoutSeconds: 20,
});
