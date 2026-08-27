import { defineFunction } from '@aws-amplify/backend';

export const upsertMaintenanceBillingDetails = defineFunction({
  runtime: 22,
  name: 'UpsertMaintenanceBillingDetails',
  entry: './handler.ts',
  environment: {
    VISIT_TYPES_TABLE: 'yalla-visit_types',
  },
  timeoutSeconds: 20,
});
