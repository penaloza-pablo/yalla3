import type { AgentDefinition, ExecutionMode } from './types';

export type VersionSelector = 'draft' | 'published' | number;

export const resolveDefinitionVersion = (options: {
  head: AgentDefinition;
  published?: AgentDefinition | null;
  executionMode: ExecutionMode;
  version?: VersionSelector;
}): { ok: true; definition: AgentDefinition } | { ok: false; message: string } => {
  const { head, published, executionMode, version } = options;
  if (typeof version === 'number') {
    if (version === head.draftVersion) {
      return { ok: true, definition: head };
    }
    if (published && (published.publishedVersion === version || head.publishedVersion === version)) {
      return { ok: true, definition: published };
    }
    return { ok: false, message: `Version ${version} was not found.` };
  }
  if (version === 'draft') {
    return { ok: true, definition: head };
  }
  if (version === 'published' || executionMode === 'production') {
    if (!head.publishedVersion || !published) {
      return {
        ok: false,
        message: 'This agent has no published version. Publish it or run a test on the draft.',
      };
    }
    return { ok: true, definition: published };
  }
  return { ok: true, definition: head };
};
