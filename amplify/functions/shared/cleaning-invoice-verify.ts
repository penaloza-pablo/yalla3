import {
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getMonthRecord, isMonthId } from './cleaning-billing';
import {
  asInvoiceGroup,
  entityMatchesGroup,
  invoiceMonthMatches,
  parseCleaningInvoicePdfWithFallback,
  s3PrefixForGroup,
  type ParsedCleaningInvoice,
} from './cleaning-invoice-parse';
import { docClient, putItem } from './visit-task-utils';

const s3Client = new S3Client({});

export type CleaningInvoiceStoredMeta = {
  s3Key: string;
  invoiceNumber: string;
  billedTo: string;
  cif: string;
  comments: string[];
  verifiedAt: string;
  monthOk: boolean;
  entityOk: boolean;
  fileName: string;
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : value == null ? '' : String(value);

const nowIso = () => new Date().toISOString();

export const decodeInvoiceFile = (value: unknown) => {
  const raw = asString(value);
  if (!raw) {
    return null;
  }
  const base64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  try {
    const buffer = Buffer.from(base64, 'base64');
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
};

export const loadInvoiceBytes = async (params: {
  fileBase64?: unknown;
  s3Key?: unknown;
}) => {
  const fromBody = decodeInvoiceFile(params.fileBase64);
  if (fromBody) {
    return { bytes: fromBody, s3Key: asString(params.s3Key) };
  }
  const s3Key = asString(params.s3Key);
  const bucket = process.env.BUCKET_NAME || 'yalla-s3storage';
  if (!s3Key) {
    return { bytes: null, s3Key: '' };
  }
  const result = await s3Client.send(
    new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
  );
  if (!result.Body) {
    throw new Error('Could not read the stored invoice PDF.');
  }
  const bytes = Buffer.from(await result.Body.transformToByteArray());
  return { bytes, s3Key };
};

const sanitizeKeyPart = (value: string) =>
  value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') ||
  'invoice';

export const buildInvoiceComments = (
  invoice: ParsedCleaningInvoice,
  group: 'apartments' | 'p2',
  monthId: string,
) => {
  const comments: string[] = [];
  const entity = entityMatchesGroup(invoice, group);
  if (!invoice.invoiceNumber) {
    comments.push('No se pudo leer el número de factura.');
  }
  if (!entity.cifOk) {
    comments.push(
      invoice.cif
        ? `El CIF ${invoice.cif} no corresponde a ${entity.expected.displayName} (${entity.expected.cif}).`
        : `No se encontró el CIF esperado ${entity.expected.cif} para ${entity.expected.displayName}.`,
    );
  }
  if (!entity.nameOk) {
    comments.push(
      invoice.billedTo
        ? `El titular "${invoice.billedTo}" no coincide con ${entity.expected.legalName}.`
        : `No se encontró el titular esperado (${entity.expected.legalName}).`,
    );
  }
  if (!invoiceMonthMatches(monthId, invoice)) {
    const seen = [invoice.concept, invoice.issueDate].filter(Boolean).join(', ');
    comments.push(
      seen
        ? `El mes de la factura (${seen}) no coincide con el mes abierto ${monthId}.`
        : `No se pudo confirmar que la factura corresponda al mes ${monthId}.`,
    );
  }
  if (invoice.lines.length === 0) {
    comments.push('No se pudieron leer líneas de artículo en el PDF.');
  }
  if (comments.length === 0) {
    comments.push(
      `Factura ${invoice.invoiceNumber} de ${entity.expected.displayName} verificada para ${monthId}.`,
    );
  }
  return {
    comments,
    entityOk: entity.entityOk,
    monthOk: invoiceMonthMatches(monthId, invoice),
    cifOk: entity.cifOk,
    nameOk: entity.nameOk,
  };
};

export const saveInvoiceMetadata = async (params: {
  monthId: string;
  group: 'apartments' | 'p2';
  meta: CleaningInvoiceStoredMeta;
}) => {
  const tableName = process.env.CLEANING_BILLING_TABLE || '';
  if (!tableName) {
    return;
  }
  const stored = await getMonthRecord(tableName, params.monthId);
  const timestamp = nowIso();
  const invoicesRaw =
    stored?.invoices &&
    typeof stored.invoices === 'object' &&
    !Array.isArray(stored.invoices)
      ? (stored.invoices as Record<string, unknown>)
      : {};
  const invoices = {
    ...invoicesRaw,
    [params.group]: params.meta,
  };
  if (!stored) {
    await putItem(tableName, {
      id: params.monthId,
      invoices,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return;
  }
  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { id: params.monthId },
      UpdateExpression: 'SET invoices = :invoices, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':invoices': invoices,
        ':updatedAt': timestamp,
      },
    }),
  );
};

export const verifyCleaningInvoice = async (args: Record<string, unknown>) => {
  const monthId = asString(args.monthId);
  const group = asInvoiceGroup(args.group);
  if (!isMonthId(monthId) || !group) {
    throw new Error('monthId (YYYY-MM) and group (apartments|p2) are required.');
  }
  const fileName = asString(args.fileName) || 'invoice.pdf';
  const loaded = await loadInvoiceBytes({
    fileBase64: args.fileBase64,
    s3Key: args.s3Key,
  });
  if (!loaded.bytes) {
    throw new Error('A PDF is required (fileBase64 or s3Key).');
  }
  const invoice = await parseCleaningInvoicePdfWithFallback(loaded.bytes);
  const checked = buildInvoiceComments(invoice, group, monthId);
  const bucket = process.env.BUCKET_NAME || 'yalla-s3storage';
  const invoiceNo = sanitizeKeyPart(invoice.invoiceNumber || 'sin-numero');
  const s3Key =
    loaded.s3Key ||
    `cleaning/invoices/${s3PrefixForGroup(group)}/${monthId}/${invoiceNo}-${Date.now()}.pdf`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: loaded.bytes,
      ContentType: 'application/pdf',
    }),
  );
  const meta: CleaningInvoiceStoredMeta = {
    s3Key,
    invoiceNumber: invoice.invoiceNumber,
    billedTo: invoice.billedTo,
    cif: invoice.cif,
    comments: checked.comments,
    verifiedAt: nowIso(),
    monthOk: checked.monthOk,
    entityOk: checked.entityOk,
    fileName,
  };
  await saveInvoiceMetadata({ monthId, group, meta });
  return {
    saved: true,
    s3Key,
    invoiceNumber: invoice.invoiceNumber,
    billedTo: invoice.billedTo,
    cif: invoice.cif,
    monthOk: checked.monthOk,
    entityOk: checked.entityOk,
    comments: checked.comments,
    subtotal: invoice.subtotal,
    lineCount: invoice.lines.length,
    group,
    monthId,
  };
};
