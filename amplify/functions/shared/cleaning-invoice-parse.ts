import { extractPdfText } from './cleaning-invoice-pdf';
import {
  extractInvoiceTextWithOpenAi,
  looksLikeInvoiceText,
} from './cleaning-invoice-openai';
import {
  foldCompanyName,
  foldInvoiceText,
  INVOICE_ENTITIES,
  type InvoicePropertyGroup,
} from './cleaning-invoice-equivalences';

export type ParsedInvoiceLine = {
  description: string;
  units: number;
  unitPrice: number;
  subtotal: number;
};

export type ParsedCleaningInvoice = {
  text: string;
  invoiceNumber: string;
  issueDate: string;
  issueDateIso: string;
  billedTo: string;
  cif: string;
  concept: string;
  conceptMonthId: string;
  subtotal: number;
  vat: number;
  total: number;
  lines: ParsedInvoiceLine[];
};

const SPANISH_MONTHS: Record<string, string> = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12',
};

const LINE_RE =
  /^(.+?)\s+(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)\s*€?\s+(-?\d+(?:[.,]\d+)?)\s*€?\s+(-?\d+(?:[.,]\d+)?)\s*€?\s+(-?\d+(?:[.,]\d+)?)\s*€?\s*$/;

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : value == null ? '' : String(value);

export const parseEuroAmount = (value: string) => {
  const normalized = value.replace(/[€\s]/g, '').trim();
  if (!normalized) {
    return null;
  }
  const hasComma = normalized.includes(',');
  const numeric = Number(
    hasComma
      ? normalized.replace(/\./g, '').replace(',', '.')
      : normalized,
  );
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : null;
};

const parseMaybeAmount = (value: string) => {
  if (value.includes(',')) {
    return parseEuroAmount(value);
  }
  const numeric = Number(value.replace(/\s/g, ''));
  return Number.isFinite(numeric) ? numeric : null;
};

const isoFromSpanishDate = (value: string) => {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) {
    return '';
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
};

const monthIdFromConcept = (text: string) => {
  const match = text.match(
    /limpieza\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{4})/i,
  );
  if (!match) {
    return '';
  }
  const month = SPANISH_MONTHS[foldInvoiceText(match[1])];
  return month ? `${match[2]}-${month}` : '';
};

const lastDayOfMonth = (monthId: string) => {
  const [year, month] = monthId.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

const daysBetweenIso = (fromIso: string, toIso: string) => {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.round((to - from) / 86_400_000);
};

export const invoiceMonthMatches = (
  monthId: string,
  invoice: Pick<ParsedCleaningInvoice, 'conceptMonthId' | 'issueDateIso'>,
) => {
  if (invoice.conceptMonthId && invoice.conceptMonthId === monthId) {
    return true;
  }
  if (!invoice.issueDateIso) {
    return false;
  }
  if (invoice.issueDateIso.startsWith(`${monthId}-`)) {
    return true;
  }
  const monthEnd = `${monthId}-${String(lastDayOfMonth(monthId)).padStart(2, '0')}`;
  const daysAfter = daysBetweenIso(monthEnd, invoice.issueDateIso);
  return (
    daysAfter >= 1 &&
    daysAfter <= 7 &&
    Boolean(invoice.conceptMonthId) &&
    invoice.conceptMonthId === monthId
  );
};

const usefulPdfText = (raw: string) => {
  const cut = raw.search(/\nTOTAL FACTURA\b/i);
  const sliced = cut >= 0 ? raw.slice(0, cut + raw.slice(cut).split('\n')[0].length) : raw;
  return sliced
    .split('\n')
    .filter((line) => !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(line))
    .join('\n')
    .trim();
};

const mergeWrappedRows = (rows: string[]) => {
  const merged: string[] = [];
  for (const row of rows) {
    const line = row.trim();
    if (!line) {
      continue;
    }
    if (LINE_RE.test(line)) {
      merged.push(line);
      continue;
    }
    if (merged.length === 0) {
      merged.push(line);
      continue;
    }
    const previous = merged[merged.length - 1];
    if (LINE_RE.test(previous)) {
      const match = previous.match(LINE_RE);
      if (match) {
        merged[merged.length - 1] =
          `${match[1].trim()} ${line} ${match[2]} ${match[3]} € ${match[4]} € ${match[5]} € ${match[6]} €`;
        continue;
      }
    }
    merged[merged.length - 1] = `${previous} ${line}`.replace(/\s+/g, ' ').trim();
  }
  return merged;
};

const parseLines = (text: string) => {
  const start = text.search(/\barticulo\b/i);
  const endMatch = text.slice(start >= 0 ? start : 0).search(/\bForma de pago\b/i);
  const body =
    start >= 0
      ? text.slice(
          start,
          endMatch >= 0 ? start + endMatch : undefined,
        )
      : text;
  const rows = mergeWrappedRows(
    body
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const lines: ParsedInvoiceLine[] = [];
  for (const row of rows) {
    const match = row.match(LINE_RE);
    if (!match) {
      continue;
    }
    const description = match[1].replace(/\barticulo\b.*$/i, '').trim();
    if (!description || /^articulo\b/i.test(description)) {
      continue;
    }
    const units = parseMaybeAmount(match[2]);
    const unitPrice = parseEuroAmount(match[3]);
    const subtotal = parseEuroAmount(match[4]);
    if (units == null || unitPrice == null || subtotal == null) {
      continue;
    }
    lines.push({ description, units, unitPrice, subtotal });
  }
  return lines;
};

export const parseCleaningInvoiceText = (rawText: string): ParsedCleaningInvoice => {
  const text = usefulPdfText(rawText);
  const invoiceNumber =
    text.match(/N[uú]mero:\s*([\d-]+)/i)?.[1]?.trim() ?? '';
  const issueDate = text.match(/Fecha:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] ?? '';
  const billedToMatch = text.match(
    /(DILIGENTE\s+RE\s+MANAGEMENT\s+S\.?L\.?|NADLAN\s+ROSENFELD\s+S\.?L?\.?)/i,
  );
  const billedTo = billedToMatch?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
  const cif =
    [...text.matchAll(/\b([A-Z]\d{8})\b/g)].map((match) => match[1]).at(-1) ??
    '';
  const concept =
    text.match(
      /Limpieza\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+\d{4}/i,
    )?.[0] ?? '';
  const subtotal =
    parseEuroAmount(text.match(/Subtotal\s+(-?[\d.,]+)/i)?.[1] ?? '') ?? 0;
  const vat = parseEuroAmount(text.match(/I\.?V\.?A\.?\s+(-?[\d.,]+)/i)?.[1] ?? '') ?? 0;
  const total =
    parseEuroAmount(text.match(/TOTAL FACTURA\s+(-?[\d.,]+)/i)?.[1] ?? '') ?? 0;
  return {
    text,
    invoiceNumber,
    issueDate,
    issueDateIso: isoFromSpanishDate(issueDate),
    billedTo,
    cif,
    concept,
    conceptMonthId: monthIdFromConcept(text),
    subtotal,
    vat,
    total,
    lines: parseLines(text),
  };
};

export const parseCleaningInvoicePdf = (bytes: Uint8Array | Buffer) =>
  parseCleaningInvoiceText(extractPdfText(bytes));

export const parseCleaningInvoicePdfWithFallback = async (
  bytes: Uint8Array | Buffer,
) => {
  const buffer = Buffer.from(bytes);
  const extracted = extractPdfText(buffer);
  if (looksLikeInvoiceText(extracted)) {
    return parseCleaningInvoiceText(extracted);
  }
  try {
    const fallback = await extractInvoiceTextWithOpenAi(buffer);
    if (looksLikeInvoiceText(fallback)) {
      return parseCleaningInvoiceText(fallback);
    }
  } catch {
    // Deterministic parse remains the source of truth when OCR is unavailable.
  }
  return parseCleaningInvoiceText(extracted);
};

export const entityMatchesGroup = (
  invoice: Pick<ParsedCleaningInvoice, 'billedTo' | 'cif'>,
  group: InvoicePropertyGroup,
) => {
  const expected = INVOICE_ENTITIES[group];
  const cifOk = invoice.cif.toUpperCase() === expected.cif;
  const nameOk =
    foldCompanyName(invoice.billedTo) === foldCompanyName(expected.legalName) ||
    foldCompanyName(invoice.billedTo).includes(foldCompanyName(expected.legalName)) ||
    foldCompanyName(expected.legalName).includes(foldCompanyName(invoice.billedTo));
  return { cifOk, nameOk, entityOk: cifOk && nameOk, expected };
};

export const asInvoiceGroup = (value: unknown): InvoicePropertyGroup | '' => {
  const raw = asString(value).toLowerCase();
  if (raw === 'p2' || raw === 'planta2' || raw === 'planta 2') {
    return 'p2';
  }
  if (raw === 'apartments' || raw === 'apartamentos') {
    return 'apartments';
  }
  return '';
};

export const s3PrefixForGroup = (group: InvoicePropertyGroup) =>
  group === 'p2' ? 'planta2' : 'apartments';
