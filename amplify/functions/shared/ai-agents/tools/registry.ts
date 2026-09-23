import { listTodayCheckinGuestsTool } from './list-today-checkin-guests';
import type { AgentTool } from '../types';

const TOOLS: Record<string, AgentTool> = {
  [listTodayCheckinGuestsTool.name]: listTodayCheckinGuestsTool,
};

export const listRegisteredTools = () => Object.values(TOOLS);

export const listPublicTools = () =>
  listRegisteredTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    outputDescription: tool.outputDescription,
  }));

export const registeredToolNames = () => new Set(Object.keys(TOOLS));

export const getRegisteredTool = (name: string) => TOOLS[name];

export const resolveAllowedTools = (allowedTools: string[]) => {
  const resolved: AgentTool[] = [];
  const missing: string[] = [];
  for (const name of allowedTools) {
    const tool = TOOLS[name];
    if (!tool) {
      missing.push(name);
      continue;
    }
    resolved.push(tool);
  }
  return { tools: resolved, missing };
};
