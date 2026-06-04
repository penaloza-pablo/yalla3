import { defineFunction } from '@aws-amplify/backend';

export const upsertInventory = defineFunction({
  runtime: 22,
  name: 'UpsertInventory',
  entry: './handler.ts',
  environment: {
    TABLE_NAME: 'yalla-inventory',
    ALERTS_TABLE: 'yalla-alarms',
  },
  timeoutSeconds: 20,
});
