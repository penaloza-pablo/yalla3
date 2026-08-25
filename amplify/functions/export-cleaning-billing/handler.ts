import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import * as XLSX from 'xlsx';
import { deriveMonthStatus, getMonthRecord, isMonthId } from '../shared/cleaning-billing';
import {
  corsHeaders as jsonCorsHeaders,
  isHttpRequest,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';

const s3Client = new S3Client({});

const corsHeaders = {
  ...jsonCorsHeaders,
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Expose-Headers': 'content-disposition',
};

type ExportRow = Record<string, string | number>;

type Payload = {
  month?: string;
  filtered?: boolean;
  headers?: unknown;
  rows?: unknown;
};

const formatDateStamp = (date: Date) => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asHeaders = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((header) => asString(header)).filter(Boolean);
};

const asRows = (value: unknown): ExportRow[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const row: ExportRow = {};
    Object.entries(item).forEach(([key, cell]) => {
      if (typeof cell === 'number' && Number.isFinite(cell)) {
        row[key] = cell;
        return;
      }
      row[key] = cell === null || cell === undefined ? '' : String(cell);
    });
    return row;
  });
};

const jsonResponse = (statusCode: number, message: string) => ({
  statusCode,
  headers: {
    ...corsHeaders,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ message }),
});

const buildXlsxBuffer = (headers: string[], rows: ExportRow[]) => {
  const columnHeaders =
    headers.length > 0
      ? headers
      : rows[0]
        ? Object.keys(rows[0])
        : [];
  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: columnHeaders.length > 0 ? columnHeaders : undefined,
  });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Cleaning Cost');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
}) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) {
      return denied;
    }
  }

  const tableName = process.env.TABLE_NAME;
  const bucketName = process.env.BUCKET_NAME;
  const prefix = process.env.BUCKET_PREFIX ?? 'cleaning/';

  if (!tableName || !bucketName) {
    return jsonResponse(500, 'TABLE_NAME or BUCKET_NAME is not configured.');
  }

  let raw = event.body ?? '';
  if (event.isBase64Encoded && raw) {
    raw = Buffer.from(raw, 'base64').toString('utf8');
  }

  const payload = parseBody<Payload>(raw);
  const monthId = asString(payload?.month);
  if (!isMonthId(monthId)) {
    return jsonResponse(400, 'A valid month is required.');
  }

  try {
    const stored = await getMonthRecord(tableName, monthId);
    const status = deriveMonthStatus(monthId, asString(stored?.status));
    if (status !== 'CLOSED') {
      return jsonResponse(409, 'Download is available after the month is closed.');
    }

    const columnHeaders = asHeaders(payload?.headers);
    const rows = asRows(payload?.rows);
    const filtered = payload?.filtered === true;
    const timestamp = formatDateStamp(new Date());
    const fileName = filtered
      ? `cleaning-billing-${monthId}-filtered-${timestamp}.xlsx`
      : `cleaning-billing-${monthId}-${timestamp}.xlsx`;
    const key = `${prefix}${fileName}`;
    const body = buildXlsxBuffer(columnHeaders, rows);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'content-type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${fileName}"`,
      },
      body: body.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('ExportCleaningBilling failed', error);
    return jsonResponse(500, 'Failed to export cleaning billing.');
  }
};
