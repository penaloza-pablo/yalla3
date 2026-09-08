import { defineFunction } from '@aws-amplify/backend';

export const getVisitTemplateAutoAssign = defineFunction({
  runtime: 22,
  name: 'GetVisitTemplateAutoAssign',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
