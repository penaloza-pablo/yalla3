import { reconcileCleaningInvoice } from '../../cleaning-invoice-reconcile';
import type { AgentTool, CoverageItem, ToolResult } from '../types';
import { TOOL_CATALOG_VERSION } from './metadata';

const parameters: Record<string, unknown> = {
  type: 'object',
  properties: {
    monthId: {
      type: 'string',
      description: 'Billing month in YYYY-MM.',
    },
    group: {
      type: 'string',
      enum: ['apartments', 'p2'],
      description: 'apartments or p2 (Planta 2). Same filter as Cleaning Billing chips.',
    },
    s3Key: {
      type: 'string',
      description: 'S3 key returned by verify_cleaning_invoice.',
    },
  },
  required: ['monthId', 'group', 's3Key'],
  additionalProperties: false,
};

export const reconcileCleaningInvoiceTool: AgentTool = {
  id: 'reconcile_cleaning_invoice',
  name: 'reconcile_cleaning_invoice',
  description:
    'Compares a stored cleaning invoice (ex-VAT subtotal) with Yalla Cleaning Billing lines for apartments or Planta 2. Matching uses the equivalence map, P2 Salida/Repaso fallbacks, quantity, price fallback and +X/-X netting. Returns discrepancies in favour of the supplier or Yalla.',
  outputDescription:
    'JSON with matched[], netted[], invoiceOnly[], yallaOnly[] and totals { invoiceExVat, yallaExVat, delta, favor }.',
  riskLevel: 'read',
  requiresApproval: false,
  timeoutMs: 90_000,
  enabled: true,
  catalogVersion: TOOL_CATALOG_VERSION,
  inputSchema: parameters,
  outputSchema: {
    type: 'object',
    properties: {
      matched: { type: 'array' },
      netted: { type: 'array' },
      invoiceOnly: { type: 'array' },
      yallaOnly: { type: 'array' },
      totals: { type: 'object' },
    },
  },
  executionTarget: 'internal',
  parameters,
  execute: async (args): Promise<ToolResult> => {
    const content = await reconcileCleaningInvoice(args);
    const planned: CoverageItem[] = [
      {
        id: 'totals',
        label: `delta ${content.totals.delta}`,
        detail: content.totals.favor,
        source: 'reconcile_cleaning_invoice',
      },
      ...content.invoiceOnly.map((line, index) => ({
        id: `invoice-only-${index}`,
        label: line.description,
        detail: String(line.subtotal),
        source: 'reconcile_cleaning_invoice',
      })),
      ...content.yallaOnly.map((line, index) => ({
        id: `yalla-only-${index}`,
        label: `${line.property} ${line.cleaningTypeName}`,
        detail: String(line.price),
        source: 'reconcile_cleaning_invoice',
      })),
    ];
    return {
      content,
      coverage: { planned, unchecked: [] },
    };
  },
};
