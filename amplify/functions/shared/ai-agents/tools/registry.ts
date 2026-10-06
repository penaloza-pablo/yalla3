import { applyBookingPlannerResolutionTool } from './apply-booking-planner-resolution';
import { getUpcomingReservationAlertsTool } from './get-upcoming-reservation-alerts';
import { listBookingConversationTool } from './list-booking-conversation';
import { listTodayCheckinGuestsTool } from './list-today-checkin-guests';
import { reconcileCleaningInvoiceTool } from './reconcile-cleaning-invoice';
import { sendBookingConversationMessageTool } from './send-booking-conversation-message';
import { verifyCleaningInvoiceTool } from './verify-cleaning-invoice';
import { TOOL_CATALOG_VERSION } from './metadata';
import type { AgentTool, AgentToolPublic } from '../types';

const TOOLS: Record<string, AgentTool> = {
  [listTodayCheckinGuestsTool.name]: listTodayCheckinGuestsTool,
  [getUpcomingReservationAlertsTool.name]: getUpcomingReservationAlertsTool,
  [listBookingConversationTool.name]: listBookingConversationTool,
  [applyBookingPlannerResolutionTool.name]: applyBookingPlannerResolutionTool,
  [sendBookingConversationMessageTool.name]: sendBookingConversationMessageTool,
  [verifyCleaningInvoiceTool.name]: verifyCleaningInvoiceTool,
  [reconcileCleaningInvoiceTool.name]: reconcileCleaningInvoiceTool,
};

const toPublic = (tool: AgentTool): AgentToolPublic => ({
  id: tool.id,
  name: tool.name,
  description: tool.description,
  outputDescription: tool.outputDescription,
  riskLevel: tool.riskLevel,
  requiresApproval: tool.requiresApproval,
  timeoutMs: tool.timeoutMs,
  enabled: tool.enabled,
  catalogVersion: tool.catalogVersion,
  inputSchema: tool.inputSchema,
  outputSchema: tool.outputSchema,
  executionTarget: tool.executionTarget,
});

export const listRegisteredTools = () => Object.values(TOOLS);

export const listPublicTools = () => listRegisteredTools().map(toPublic);

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

export { TOOL_CATALOG_VERSION };
