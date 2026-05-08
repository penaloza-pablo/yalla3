import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
};

const checkInFieldCandidates = [
  'checkIn',
  'checkin',
  'check_in',
  'CheckIn',
  'CheckInDate',
  'Check-in',
  'Check in',
  'checkInDate',
  'checkInAt',
  'startDate',
  'arrivalDate',
  'arrival',
];

const parseLimit = (value?: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(Math.trunc(parsed), 200);
};

const parseCursor = (value?: string): Record<string, unknown> | undefined => {
  if (!value) {
    return undefined;
  }
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const buildCursor = (value?: Record<string, unknown>) => {
  if (!value) {
    return null;
  }
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
};

const parseDateInput = (value?: string) => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const normalizeDate = (value: Date) => {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
};

const parseCheckInDate = (item: Record<string, unknown>) => {
  for (const key of checkInFieldCandidates) {
    const rawValue = item[key];
    if (typeof rawValue !== 'string') {
      continue;
    }
    const trimmed = rawValue.trim();
    if (!trimmed) {
      continue;
    }

    const slashDate = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (slashDate) {
      const [, day, month, year] = slashDate;
      const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
      if (!Number.isNaN(parsed.getTime())) {
        return normalizeDate(parsed);
      }
    }

    const isoParsed = new Date(trimmed);
    if (!Number.isNaN(isoParsed.getTime())) {
      return normalizeDate(isoParsed);
    }
  }
  return null;
};

const matchesCheckInRange = (
  item: Record<string, unknown>,
  checkInFrom: Date | null,
  checkInTo: Date | null,
) => {
  if (!checkInFrom && !checkInTo) {
    return true;
  }

  const checkInDate = parseCheckInDate(item);
  if (!checkInDate) {
    return false;
  }

  if (checkInFrom && checkInDate < checkInFrom) {
    return false;
  }
  if (checkInTo && checkInDate > checkInTo) {
    return false;
  }
  return true;
};

const isHttpRequest = (event: HttpEvent) => Boolean(event.requestContext?.http?.method);

const buildHttpResponse = (statusCode: number, payload: Record<string, unknown>) => ({
  statusCode,
  headers: {
    ...corsHeaders,
    'content-type': 'application/json',
  },
  body: JSON.stringify(payload),
});

export const handler = async (event: HttpEvent) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
    };
  }

  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    const message = 'TABLE_NAME is not configured.';
    if (isHttp) {
      return buildHttpResponse(500, { message });
    }
    throw new Error(message);
  }

  const limit = parseLimit(event.queryStringParameters?.limit);
  const cursor = parseCursor(event.queryStringParameters?.cursor);
  const checkInFrom = normalizeDate(
    parseDateInput(event.queryStringParameters?.checkInFrom) ?? new Date(0),
  );
  const checkInToInput = parseDateInput(event.queryStringParameters?.checkInTo);
  const checkInTo = checkInToInput ? normalizeDate(checkInToInput) : null;
  const hasFromFilter = Boolean(event.queryStringParameters?.checkInFrom);

  try {
    const items: Record<string, unknown>[] = [];
    let lastEvaluatedKey = cursor;
    let scannedCount = 0;
    let loops = 0;

    do {
      const result = await client.send(
        new ScanCommand({
          TableName: tableName,
          Limit: Math.max(limit * 2, 100),
          ExclusiveStartKey: lastEvaluatedKey,
        }),
      );

      const pageItems = (result.Items as Record<string, unknown>[] | undefined) ?? [];
      scannedCount += result.ScannedCount ?? pageItems.length;
      lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;

      pageItems.forEach((item) => {
        const passesFromFilter = hasFromFilter
          ? matchesCheckInRange(item, checkInFrom, checkInTo)
          : matchesCheckInRange(item, null, checkInTo);
        if (passesFromFilter && items.length < limit) {
          items.push(item);
        }
      });

      loops += 1;
      if (items.length >= limit || !lastEvaluatedKey || loops >= 10) {
        break;
      }
    } while (true);

    const payload = {
      items,
      count: items.length,
      scannedCount,
      nextCursor: buildCursor(lastEvaluatedKey),
      pageSize: limit,
    };
    return isHttp ? buildHttpResponse(200, payload) : payload;
  } catch (error) {
    console.error('GetBookings failed', {
      tableName,
      error,
    });
    const message = 'Failed to read bookings from DynamoDB.';
    if (isHttp) {
      return buildHttpResponse(500, {
        message,
        details: error instanceof Error ? error.message : String(error),
      });
    }
    throw new Error(message);
  }
};
