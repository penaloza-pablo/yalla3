import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { rejectIfUnauthenticated } from '../shared/cognito-auth';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type,authorization',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
};

const CHECK_IN_INDEX = 'CheckInDate-index';
const PROJECTED_FIELDS = [
  'ReservationID',
  'CheckInDate',
  'CheckOutDate',
  '#status',
  'GuestName',
  'ListingNickname',
  '#source',
  'Guests',
  'Nights',
  'CreatedAt',
  'UpdatedAt',
  'EventType',
  'Currency',
  'ConversationID',
  'ListingID',
  'GuestEmail',
  'GuestPaidTotal',
  'GuestPaidDay',
  'GuestPaidTotalWithoutCleaning',
].join(', ');
const EXPRESSION_NAMES = {
  '#status': 'Status',
  '#source': 'Source',
};

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
};

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
    const parsed = JSON.parse(decoded) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const encodeCursor = (value?: Record<string, unknown> | null) => {
  if (!value) {
    return null;
  }
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
};

const parseIsoDate = (value?: string) => {
  if (!value) {
    return null;
  }
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const toIsoDate = (value: Date) => value.toISOString().slice(0, 10);

const addUtcDays = (value: Date, days: number) => {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const eachUtcDate = (from: Date, to: Date) => {
  const dates: string[] = [];
  for (
    let cursor = from;
    cursor.getTime() <= to.getTime();
    cursor = addUtcDays(cursor, 1)
  ) {
    dates.push(toIsoDate(cursor));
  }
  return dates;
};

const isHttpRequest = (event: HttpEvent) =>
  Boolean(event.requestContext?.http?.method);

const jsonResponse = (statusCode: number, payload: Record<string, unknown>) => ({
  statusCode,
  headers: {
    ...corsHeaders,
    'content-type': 'application/json',
  },
  body: JSON.stringify(payload),
});

const isIndexUnavailableError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  const name = error.name;
  if (name === 'AccessDeniedException') {
    return true;
  }
  return (
    name === 'ValidationException' &&
    (message.includes('specified index') ||
      message.includes('index was not found') ||
      message.includes('backfilling') ||
      message.includes('is not in active'))
  );
};

const compareCheckIn = (
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) => {
  const leftDate = String(left.CheckInDate ?? '');
  const rightDate = String(right.CheckInDate ?? '');
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }
  return String(left.ReservationID ?? '').localeCompare(
    String(right.ReservationID ?? ''),
  );
};

const queryCheckInDate = async (tableName: string, checkInDate: string) => {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  let scannedCount = 0;

  do {
    const result = await client.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: CHECK_IN_INDEX,
        KeyConditionExpression: 'CheckInDate = :checkInDate',
        ExpressionAttributeValues: { ':checkInDate': checkInDate },
        ExpressionAttributeNames: EXPRESSION_NAMES,
        ProjectionExpression: PROJECTED_FIELDS,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    const page = (result.Items as Record<string, unknown>[] | undefined) ?? [];
    scannedCount += result.ScannedCount ?? page.length;
    items.push(...page);
    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  return { items, scannedCount };
};

const queryCheckInRange = async (
  tableName: string,
  fromIso: string,
  toIso: string,
) => {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) {
    return { items: [] as Record<string, unknown>[], scannedCount: 0 };
  }
  const start = from.getTime() <= to.getTime() ? from : to;
  const end = from.getTime() <= to.getTime() ? to : from;
  const items: Record<string, unknown>[] = [];
  let scannedCount = 0;
  for (const date of eachUtcDate(start, end)) {
    const page = await queryCheckInDate(tableName, date);
    items.push(...page.items);
    scannedCount += page.scannedCount;
  }
  items.sort(compareCheckIn);
  return { items, scannedCount };
};

const scanMatching = async (
  tableName: string,
  options: {
    checkInFrom: string | null;
    checkInTo: string | null;
    useIndex: boolean;
  },
) => {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  let scannedCount = 0;
  const values: Record<string, string> = {};
  const filters: string[] = [];

  if (options.checkInFrom) {
    values[':checkInFrom'] = options.checkInFrom;
    filters.push('CheckInDate >= :checkInFrom');
  }
  if (options.checkInTo) {
    values[':checkInTo'] = options.checkInTo;
    filters.push('CheckInDate <= :checkInTo');
  }

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        IndexName: options.useIndex ? CHECK_IN_INDEX : undefined,
        ExclusiveStartKey: exclusiveStartKey,
        Limit: 100,
        ExpressionAttributeNames: EXPRESSION_NAMES,
        ProjectionExpression: PROJECTED_FIELDS,
        FilterExpression: filters.length > 0 ? filters.join(' AND ') : undefined,
        ExpressionAttributeValues:
          Object.keys(values).length > 0 ? values : undefined,
      }),
    );
    const page = (result.Items as Record<string, unknown>[] | undefined) ?? [];
    scannedCount += result.ScannedCount ?? page.length;
    items.push(...page);
    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  items.sort(compareCheckIn);
  return { items, scannedCount };
};

const scanPage = async (
  tableName: string,
  limit: number,
  startKey?: Record<string, unknown>,
  useIndex = true,
) => {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey = startKey;
  let scannedCount = 0;

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        IndexName: useIndex ? CHECK_IN_INDEX : undefined,
        ExclusiveStartKey: exclusiveStartKey,
        Limit: 100,
        ExpressionAttributeNames: EXPRESSION_NAMES,
        ProjectionExpression: PROJECTED_FIELDS,
      }),
    );
    const page = (result.Items as Record<string, unknown>[] | undefined) ?? [];
    scannedCount += result.ScannedCount ?? page.length;
    for (const item of page) {
      if (items.length < limit) {
        items.push(item);
      }
    }
    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey && items.length < limit);

  return {
    items,
    lastEvaluatedKey: exclusiveStartKey,
    scannedCount,
  };
};

const paginate = (
  items: Record<string, unknown>[],
  scannedCount: number,
  limit: number,
  cursor?: Record<string, unknown>,
) => {
  const offset =
    typeof cursor?.offset === 'number' && cursor.offset > 0
      ? Math.trunc(cursor.offset)
      : 0;
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  return {
    items: page,
    count: page.length,
    scannedCount,
    nextCursor:
      nextOffset < items.length ? encodeCursor({ offset: nextOffset }) : null,
    pageSize: limit,
  };
};

export const handler = async (event: HttpEvent) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
    };
  }

  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) return denied;
  }

  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    const message = 'TABLE_NAME is not configured.';
    if (isHttp) {
      return jsonResponse(500, { message });
    }
    throw new Error(message);
  }

  const limit = parseLimit(event.queryStringParameters?.limit);
  const cursor = parseCursor(event.queryStringParameters?.cursor);
  const checkInFrom = parseIsoDate(event.queryStringParameters?.checkInFrom);
  const checkInTo = parseIsoDate(event.queryStringParameters?.checkInTo);
  const fromIso = checkInFrom ? toIsoDate(checkInFrom) : null;
  const toIso = checkInTo ? toIsoDate(checkInTo) : null;

  try {
    if (fromIso || toIso) {
      let collected: { items: Record<string, unknown>[]; scannedCount: number };
      try {
        if (fromIso && toIso) {
          collected = await queryCheckInRange(tableName, fromIso, toIso);
        } else {
          collected = await scanMatching(tableName, {
            checkInFrom: fromIso,
            checkInTo: toIso,
            useIndex: true,
          });
        }
      } catch (error) {
        if (!isIndexUnavailableError(error)) {
          throw error;
        }
        collected = await scanMatching(tableName, {
          checkInFrom: fromIso,
          checkInTo: toIso,
          useIndex: false,
        });
      }
      const payload = paginate(
        collected.items,
        collected.scannedCount,
        limit,
        cursor,
      );
      return isHttp ? jsonResponse(200, payload) : payload;
    }

    try {
      const scanned = await scanPage(tableName, limit, cursor, true);
      const payload = {
        items: scanned.items,
        count: scanned.items.length,
        scannedCount: scanned.scannedCount,
        nextCursor: encodeCursor(scanned.lastEvaluatedKey),
        pageSize: limit,
      };
      return isHttp ? jsonResponse(200, payload) : payload;
    } catch (error) {
      if (!isIndexUnavailableError(error)) {
        throw error;
      }
      const scanned = await scanPage(tableName, limit, cursor, false);
      const payload = {
        items: scanned.items,
        count: scanned.items.length,
        scannedCount: scanned.scannedCount,
        nextCursor: encodeCursor(scanned.lastEvaluatedKey),
        pageSize: limit,
      };
      return isHttp ? jsonResponse(200, payload) : payload;
    }
  } catch (error) {
    console.error('GetBookings failed', { tableName, error });
    const message = 'Failed to read bookings from DynamoDB.';
    if (isHttp) {
      return jsonResponse(500, {
        message,
        details: error instanceof Error ? error.message : String(error),
      });
    }
    throw new Error(message);
  }
};
