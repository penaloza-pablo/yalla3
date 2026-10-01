import { loadOpenAiSecret } from './ai-agents/providers/openai-secret';
import { foldInvoiceText } from './cleaning-invoice-equivalences';
import type { ParsedInvoiceLine } from './cleaning-invoice-parse';

export type InterpretedPairProposal = {
  invoiceDescription: string;
  yallaTypeNames: string[];
  reason?: string;
};

const roundMoney = (value: number) => Math.round(value * 100) / 100;

const asText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const isCoreOccupancyType = (cleaningTypeName: string) => {
  const folded = foldInvoiceText(cleaningTypeName);
  return (
    folded === 'regular' ||
    folded === 'room regular' ||
    folded === 'refresh' ||
    folded === 'p2 refresh' ||
    folded === 'storage and wk assembling' ||
    folded === 'storage'
  );
};

const parseJsonObject = (text: string) => {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const parseInterpretedPairProposals = (
  payload: unknown,
): InterpretedPairProposal[] => {
  const root =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : parseJsonObject(asText(payload));
  const raw = Array.isArray(root?.pairs) ? root.pairs : [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    const item = entry as Record<string, unknown>;
    const invoiceDescription = asText(item.invoiceDescription);
    const names = Array.isArray(item.yallaTypeNames)
      ? item.yallaTypeNames.map((name) => asText(name)).filter(Boolean)
      : asText(item.yallaTypeName)
        ? [asText(item.yallaTypeName)]
        : [];
    if (!invoiceDescription || names.length === 0) {
      return [];
    }
    return [
      {
        invoiceDescription,
        yallaTypeNames: names,
        reason: asText(item.reason) || undefined,
      },
    ];
  });
};

const compactYallaLeftovers = (
  lines: Array<{ cleaningTypeName: string; price: number }>,
) => {
  const groups = new Map<
    string,
    { type: string; count: number; unitPrice: number; total: number }
  >();
  for (const line of lines) {
    if (isCoreOccupancyType(line.cleaningTypeName)) {
      continue;
    }
    const type = line.cleaningTypeName.trim() || '—';
    const key = `${foldInvoiceText(type)}|${line.price.toFixed(2)}`;
    const current = groups.get(key) ?? {
      type,
      count: 0,
      unitPrice: line.price,
      total: 0,
    };
    current.count += 1;
    current.total = roundMoney(current.total + line.price);
    groups.set(key, current);
  }
  return [...groups.values()];
};

export const proposeInvoiceLeftoverPairs = async (
  invoiceLines: ParsedInvoiceLine[],
  yallaLines: Array<{ cleaningTypeName: string; price: number }>,
): Promise<InterpretedPairProposal[]> => {
  if (invoiceLines.length === 0 || yallaLines.length === 0) {
    return [];
  }
  const yallaGroups = compactYallaLeftovers(yallaLines);
  if (yallaGroups.length === 0) {
    return [];
  }
  const secret = await loadOpenAiSecret();
  if (!secret) {
    return [];
  }
  const headers: Record<string, string> = {
    authorization: `Bearer ${secret.apiKey}`,
    'content-type': 'application/json',
  };
  if (secret.organization) {
    headers['openai-organization'] = secret.organization;
  }
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 800,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You pair leftover cleaning-invoice concepts with leftover Yalla visit types. Only propose a pair when unit prices or subtotals match. Do not pair Regular, Refresh or Storage occupancy lines. Return JSON { "pairs": [{ "invoiceDescription": string, "yallaTypeNames": string[], "reason": string }] }. Use invoiceDescription and yalla type names exactly as given. If nothing matches, return { "pairs": [] }.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            invoiceLeftovers: invoiceLines.map((line) => ({
              description: line.description,
              units: line.units,
              unitPrice: line.unitPrice,
              subtotal: line.subtotal,
            })),
            yallaLeftovers: yallaGroups,
          }),
        },
      ],
    }),
  });
  const payload = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  if (!response.ok) {
    return [];
  }
  return parseInterpretedPairProposals(payload.choices?.[0]?.message?.content);
};
