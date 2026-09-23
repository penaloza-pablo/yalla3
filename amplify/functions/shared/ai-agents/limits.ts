import type { RuntimeLimits } from './types';

export const DEFAULT_RUNTIME_LIMITS: RuntimeLimits = {
  maxTurns: 8,
  timeoutMs: 90_000,
  maxCostUsd: 0.5,
  maxToolCalls: 12,
};

export const TOOL_DEBUG_AGENT_ID = '__tool_debug__';

export const MAX_STEP_CHARS = 24_000;

export const clampRuntimeLimits = (
  value?: Partial<RuntimeLimits> | null,
): RuntimeLimits => {
  const maxTurns = Number(value?.maxTurns);
  const timeoutMs = Number(value?.timeoutMs);
  const maxCostUsd = Number(value?.maxCostUsd);
  const maxToolCalls = Number(value?.maxToolCalls);
  return {
    maxTurns:
      Number.isInteger(maxTurns) && maxTurns > 0 && maxTurns <= 20
        ? maxTurns
        : DEFAULT_RUNTIME_LIMITS.maxTurns,
    timeoutMs:
      Number.isInteger(timeoutMs) && timeoutMs >= 5_000 && timeoutMs <= 110_000
        ? timeoutMs
        : DEFAULT_RUNTIME_LIMITS.timeoutMs,
    maxCostUsd:
      Number.isFinite(maxCostUsd) && maxCostUsd > 0 && maxCostUsd <= 20
        ? Math.round(maxCostUsd * 10000) / 10000
        : DEFAULT_RUNTIME_LIMITS.maxCostUsd,
    maxToolCalls:
      Number.isInteger(maxToolCalls) && maxToolCalls > 0 && maxToolCalls <= 40
        ? maxToolCalls
        : DEFAULT_RUNTIME_LIMITS.maxToolCalls,
  };
};

export const capStoredValue = (value: unknown, max = MAX_STEP_CHARS): unknown => {
  if (value === undefined) {
    return undefined;
  }
  const text =
    typeof value === 'string' ? value : JSON.stringify(value ?? null);
  if (text.length <= max) {
    return value;
  }
  return {
    truncated: true,
    preview: text.slice(0, max),
    chars: text.length,
  };
};
