import { defineFunction } from '@aws-amplify/backend';

export const getMaintenanceBillingDetails = defineFunction({
  runtime: 22,
  name: 'GetMaintenanceBillingDetails',
  entry: './handler.ts',
  environment: {
    VISIT_TYPES_TABLE: 'yalla-visit_types',
  },
  timeoutSeconds: 20,
});
