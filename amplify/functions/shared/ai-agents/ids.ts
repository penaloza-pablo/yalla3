export const agentVersionId = (agentId: string, version: number) =>
  `${agentId}::v${version}`;

export const toolHeadId = (name: string) => `tool::${name}`;

export const toolVersionId = (name: string, version: number) =>
  `tool::${name}::v${version}`;

export const isAgentHeadId = (id: string) =>
  !id.startsWith('tool::') && !id.includes('::v');

export const isToolHeadId = (id: string) =>
  id.startsWith('tool::') && !id.includes('::v');
