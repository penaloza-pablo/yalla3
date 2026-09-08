import { defineFunction } from '@aws-amplify/backend';

export const applyVisitTemplateAutoAssign = defineFunction({
  runtime: 22,
  name: 'ApplyVisitTemplateAutoAssign',
  entry: './handler.ts',
  timeoutSeconds: 60,
});
