import { defineFunction } from '@aws-amplify/backend';

export const upsertVisitTemplateAutoAssign = defineFunction({
  runtime: 22,
  name: 'UpsertVisitTemplateAutoAssign',
  entry: './handler.ts',
  timeoutSeconds: 20,
});
