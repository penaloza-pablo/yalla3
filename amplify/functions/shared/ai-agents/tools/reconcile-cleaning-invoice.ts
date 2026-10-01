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
    'Compares a stored cleaning invoice (ex-VAT subtotal) with Yalla Cleaning Billing lines for apartments or Planta 2. Matching uses the equivalence map, learned equivalences, amount-aligned Keynest/travel matching, grouped concepts, P2 fallbacks and +X/-X netting. Remaining leftovers are interpreted semantically only when amounts align; Regular/Refresh/Storage leftovers are never reinterpreted. Left-over rows in summary include origin (invoice or Yalla).',
  outputDescription:
    'JSON with summary[] (matched/mismatch/invoice_only/yalla_only/netted grouped rows; interpreted:true marks leftover semantic pairs), matched[], netted[], invoiceOnly[], yallaOnly[] and totals { invoiceExVat, yallaExVat, delta, favor }. Prefer summary[] when narrating.',
  riskLevel: 'read',
  requiresApproval: false,
  timeoutMs: 90_000,
  enabled: true,
  catalogVersion: TOOL_CATALOG_VERSION,
  inputSchema: parameters,
  outputSchema: {
    type: 'object',
    properties: {
      summary: { type: 'array' },
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
    const review = content.summary.filter((row) => row.status !== 'matched');
    const planned: CoverageItem[] = [
      {
        id: 'totals',
        label: `delta ${content.totals.delta}`,
        detail: content.totals.favor,
        source: 'reconcile_cleaning_invoice',
      },
      ...review.map((row, index) => ({
        id: `summary-${index}`,
        label: row.invoiceLabel || row.yallaLabel || row.status,
        detail: `${row.status} ${row.invoiceAmount}/${row.yallaAmount}`,
        source: 'reconcile_cleaning_invoice',
      })),
    ];
    const { yallaOnly: _rawYallaOnly, matched, ...rest } = content;
    return {
      content: {
        ...rest,
        matched: matched.map(({ yallaLines: _yallaLines, ...entry }) => entry),
        yallaOnly: content.summary.filter((row) => row.status === 'yalla_only'),
      },
      coverage: { planned, unchecked: [] },
    };
  },
};
