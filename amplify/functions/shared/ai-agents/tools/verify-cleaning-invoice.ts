import { verifyCleaningInvoice } from '../../cleaning-invoice-verify';
import type { AgentTool, CoverageItem, ToolResult } from '../types';
import { TOOL_CATALOG_VERSION } from './metadata';

const parameters: Record<string, unknown> = {
  type: 'object',
  properties: {
    monthId: {
      type: 'string',
      description: 'Billing month in YYYY-MM, matching the open month in Cleaning Billing.',
    },
    group: {
      type: 'string',
      enum: ['apartments', 'p2'],
      description: 'apartments or p2 (Planta 2).',
    },
    fileBase64: {
      type: 'string',
      description: 'PDF encoded as base64. Required unless s3Key is already stored.',
    },
    fileName: {
      type: 'string',
      description: 'Original PDF file name.',
    },
    s3Key: {
      type: 'string',
      description: 'Existing object key under cleaning/invoices/.',
    },
  },
  required: ['monthId', 'group'],
  additionalProperties: false,
};

export const verifyCleaningInvoiceTool: AgentTool = {
  id: 'verify_cleaning_invoice',
  name: 'verify_cleaning_invoice',
  description:
    'Parses a cleaning supplier PDF, checks billed entity (CIF and legal name) and month, stores the file in S3, and writes comments on the billing month. The PDF is saved even when CIF or month do not match.',
  outputDescription:
    'JSON with saved, s3Key, invoiceNumber, billedTo, cif, monthOk, entityOk, comments[], subtotal and lineCount.',
  riskLevel: 'write-low-risk',
  requiresApproval: false,
  timeoutMs: 60_000,
  enabled: true,
  catalogVersion: TOOL_CATALOG_VERSION,
  inputSchema: parameters,
  outputSchema: {
    type: 'object',
    properties: {
      saved: { type: 'boolean' },
      s3Key: { type: 'string' },
      invoiceNumber: { type: 'string' },
      comments: { type: 'array' },
    },
  },
  executionTarget: 'internal',
  parameters,
  execute: async (args): Promise<ToolResult> => {
    const content = await verifyCleaningInvoice(args);
    const planned: CoverageItem[] = [
      {
        id: 'invoice-saved',
        label: content.s3Key,
        detail: content.invoiceNumber,
        source: 'verify_cleaning_invoice',
      },
      ...content.comments.map((comment, index) => ({
        id: `comment-${index}`,
        label: comment,
        source: 'verify_cleaning_invoice',
      })),
    ];
    return {
      content,
      coverage: { planned, unchecked: [] },
    };
  },
};
