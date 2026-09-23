const USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4o': { input: 2.5, output: 10 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1': { input: 2, output: 8 },
  'o4-mini': { input: 1.1, output: 4.4 },
};

const DEFAULT_RATES = { input: 0.15, output: 0.6 };

export const estimateCostUsd = (
  model: string,
  usage?: { inputTokens?: number; outputTokens?: number },
) => {
  const rates = USD_PER_MILLION[model] ?? DEFAULT_RATES;
  const input = (usage?.inputTokens ?? 0) / 1_000_000;
  const output = (usage?.outputTokens ?? 0) / 1_000_000;
  return Math.round((input * rates.input + output * rates.output) * 1_000_000) /
    1_000_000;
};
