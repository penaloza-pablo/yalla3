import { BatchGetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { queryVisitsForScheduledDate } from '../shared/cleaning-plan';
import {
  CHECK_IN_LOOKBACK_DAYS,
  mapCheckInTrackerRow,
  resolveTrackerDateWindow,
  shouldIncludeBooking,
  summarizeDayActivity,
} from '../shared/check-in-tracker';
import { addDaysToDateString, listDatesInRange } from '../shared/date-range';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { docClient, getTodayInMadrid } from '../shared/visit-task-utils';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
};

const CHECK_IN_INDEX = 'CheckInDate-index';
const TRACKER_FLAG_ATTRIBUTES = [
  'ReservationID',
  'CheckInAccessGranted',
  'CheckInAccessGrantedAt',
  'CheckInAccessGrantedBy',
  'CheckInGuestEntered',
  'CheckInGuestEnteredAt',
  'CheckInGuestEnteredBy',
  'EarlyCheckIn',
  'EarlyCheckInOn',
];

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const queryCheckIns = async (tableName: string, checkInDate: string) => {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: CHECK_IN_INDEX,
        KeyConditionExpression: 'CheckInDate = :checkInDate',
        ExpressionAttributeValues: { ':checkInDate': checkInDate },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    items.push(...((result.Items as Record<string, unknown>[]) ?? []));
    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);
  return items;
};

const hydrateTrackerFlags = async (
  tableName: string,
  items: Record<string, unknown>[],
) => {
  const ids = [
    ...new Set(
      items
        .map((item) => asString(item.ReservationID ?? item.id))
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0) {
    return items;
  }

  const extras = new Map<string, Record<string, unknown>>();
  let keys: Record<string, unknown>[] = ids.map((id) => ({
    ReservationID: id,
  }));

  for (let attempt = 0; attempt < 3 && keys.length > 0; attempt += 1) {
    const nextKeys: Record<string, unknown>[] = [];
    for (let offset = 0; offset < keys.length; offset += 100) {
      const chunk = keys.slice(offset, offset + 100);
      const result = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: {
              Keys: chunk,
              ProjectionExpression: TRACKER_FLAG_ATTRIBUTES.join(', '),
            },
          },
        }),
      );
      const page = result.Responses?.[tableName] ?? [];
      for (const item of page) {
        extras.set(asString(item.ReservationID), item);
      }
      nextKeys.push(...(result.UnprocessedKeys?.[tableName]?.Keys ?? []));
    }
    keys = nextKeys;
  }

  return items.map((item) => {
    const extra = extras.get(asString(item.ReservationID ?? item.id));
    return extra ? { ...item, ...extra } : item;
  });
};

export const handler = async (event: HttpEvent) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) return denied;
  }

  const bookingsTable = process.env.BOOKINGS_TABLE || 'yalla-bookings';
  const visitsTable = process.env.VISITS_TABLE || 'yalla-visits';
  const window = resolveTrackerDateWindow({
    date: event.queryStringParameters?.date,
    from: event.queryStringParameters?.from,
    to: event.queryStringParameters?.to,
    today: getTodayInMadrid(),
  });
  if (!window.ok) {
    return buildHttpResponse(400, { message: window.error });
  }

  try {
    const checkInDates = listDatesInRange(window.from, window.to);
    const visitDates = listDatesInRange(
      addDaysToDateString(window.from, -CHECK_IN_LOOKBACK_DAYS),
      window.to,
    );
    const [bookingGroups, visitGroups] = await Promise.all([
      Promise.all(checkInDates.map((day) => queryCheckIns(bookingsTable, day))),
      Promise.all(
        visitDates.map((day) => queryVisitsForScheduledDate(visitsTable, day)),
      ),
    ]);
    const confirmed = bookingGroups.flat().filter(shouldIncludeBooking);
    const bookings = await hydrateTrackerFlags(bookingsTable, confirmed);
    const visits = visitGroups.flat();
    const items = bookings
      .map((item) => mapCheckInTrackerRow(item, visits))
      .sort((left, right) => {
        const date = left.checkInDate.localeCompare(right.checkInDate);
        if (date !== 0) {
          return date;
        }
        const property = left.property.localeCompare(right.property, 'es');
        if (property !== 0) {
          return property;
        }
        return left.guestName.localeCompare(right.guestName, 'es');
      });

    return buildHttpResponse(200, {
      date: window.from,
      from: window.from,
      to: window.to,
      items,
      count: items.length,
      ...(window.from === window.to
        ? { activity: summarizeDayActivity(bookings, visits, window.from) }
        : {}),
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to load check-in tracker.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
