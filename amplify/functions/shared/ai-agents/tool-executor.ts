import { validateAgainstSchema } from './json-schema';
import { getRegisteredTool } from './tools/registry';
import type {
  ApprovalPolicy,
  ExecuteToolInput,
  ExecuteToolResult,
} from './types';

const needsApproval = (toolId: string, policy?: ApprovalPolicy) =>
  Boolean(policy?.requireApprovalFor.includes(toolId));

export const executeTool = async (
  input: ExecuteToolInput,
): Promise<ExecuteToolResult> => {
  const started = Date.now();
  if (!input.allowedTools.includes(input.toolId)) {
    return {
      status: 'error',
      toolId: input.toolId,
      error: `Tool ${input.toolId} is not allowed for this agent.`,
      latencyMs: Date.now() - started,
    };
  }
  const tool = getRegisteredTool(input.toolId);
  if (!tool || !tool.enabled) {
    return {
      status: 'error',
      toolId: input.toolId,
      error: `Unknown or disabled tool: ${input.toolId}.`,
      latencyMs: Date.now() - started,
    };
  }
  const validated = validateAgainstSchema(tool.parameters, input.arguments);
  if (!validated.ok) {
    return {
      status: 'error',
      toolId: input.toolId,
      error: validated.message,
      latencyMs: Date.now() - started,
    };
  }
  if (tool.requiresApproval || needsApproval(input.toolId, input.approvalPolicy)) {
    return {
      status: 'needs_approval',
      toolId: input.toolId,
      arguments: input.arguments,
      approvalId: crypto.randomUUID(),
    };
  }
  try {
    const result = await tool.execute(input.arguments);
    return {
      status: 'ok',
      toolId: input.toolId,
      content: result.content,
      coverage: result.coverage,
      latencyMs: Date.now() - started,
    };
  } catch (error) {
    return {
      status: 'error',
      toolId: input.toolId,
      error: error instanceof Error ? error.message : String(error),
      latencyMs: Date.now() - started,
    };
  }
};
