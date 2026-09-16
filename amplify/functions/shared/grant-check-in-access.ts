import { BatchGetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  blockingVisitsForListing,
  bookingHasEarlyCheckIn,
  CHECK_IN_LOOKBACK_DAYS,
  readTrackerFlags,
  shouldIncludeBooking,
  toDateOnly,
} from './check-in-tracker';
import { queryVisitsForScheduledDate } from './cleaning-plan';
import { addDaysToDateString } from './date-range';
import { nowIso } from './dynamo-http';
import {
  CHECK_IN_TIME_ACTOR,
  checkInTimeFromBooking,
  isCheckInTimeDue,
} from './check-in-time';
import {
  EARLY_CHECK_IN_ACCESS_FIELD,
  EARLY_CHECK_IN_READY_FIELD,
  notifyEarlyCheckInAccessEnabled,
} from './slack-early-check-in';
import {
  docClient,
  getNowTimeInMadrid,
  getTodayInMadrid,
} from './visit-task-utils';

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();

const CHECK_IN_DATE_INDEX = 'CheckInDate-index';

const queryBookingsForCheckInDate = async (
  tableName: string,
  checkInDate: string,
) => {
  const keys: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: CHECK_IN_DATE_INDEX,
        KeyConditionExpression: 'CheckInDate = :checkInDate',
        ExpressionAttributeValues: { ':checkInDate': checkInDate },
        ProjectionExpression: 'ReservationID',
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of result.Items ?? []) {
      const id = asString(item.ReservationID);
      if (id) {
        keys.push({ ReservationID: id });
      }
    }
    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  const items: Record<string, unknown>[] = [];
  let pending = keys;
  for (let attempt = 0; attempt < 3 && pending.length > 0; attempt += 1) {
    const nextKeys: Record<string, unknown>[] = [];
    for (let offset = 0; offset < pending.length; offset += 100) {
      const chunk = pending.slice(offset, offset + 100);
      const result = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: { Keys: chunk },
          },
        }),
      );
      items.push(
        ...((result.Responses?.[tableName] as Record<string, unknown>[]) ?? []),
      );
      nextKeys.push(...(result.UnprocessedKeys?.[tableName]?.Keys ?? []));
    }
    pending = nextKeys;
  }
  return items;
};

const loadVisitsForCheckInDay = async (
  visitsTable: string,
  checkInDate: string,
) => {
  const lookback = addDaysToDateString(checkInDate, -CHECK_IN_LOOKBACK_DAYS);
  const [todayVisits, lookbackVisits] = await Promise.all([
    queryVisitsForScheduledDate(visitsTable, checkInDate),
    lookback !== checkInDate
      ? queryVisitsForScheduledDate(visitsTable, lookback)
      : Promise.resolve([]),
  ]);
  return [...lookbackVisits, ...todayVisits];
};

export const shouldAutoGrantAccess = ({
  booking,
  visits,
  today,
  nowTime,
}: {
  booking: Record<string, unknown>;
  visits: Record<string, unknown>[];
  today: string;
  nowTime: string;
}) => {
  if (!shouldIncludeBooking(booking)) {
    return false;
  }
  if (readTrackerFlags(booking).accessGranted) {
    return false;
  }
  if (toDateOnly(booking.CheckInDate) !== today) {
    return false;
  }
  if (!isCheckInTimeDue(nowTime, checkInTimeFromBooking(booking))) {
    return false;
  }
  const listingId = asString(booking.ListingID ?? booking.listingId);
  return blockingVisitsForListing(visits, today, listingId).length === 0;
};

const persistAccessGranted = async (
  bookingsTable: string,
  reservationId: string,
  occurredAt: string,
) => {
  await docClient.send(
    new UpdateCommand({
      TableName: bookingsTable,
      Key: { ReservationID: reservationId },
      UpdateExpression: `
        SET CheckInAccessGranted = :granted,
            CheckInAccessGrantedAt = :at,
            CheckInAccessGrantedBy = :by,
            UpdatedAt = :updatedAt
      `,
      ExpressionAttributeValues: {
        ':granted': true,
        ':at': occurredAt,
        ':by': CHECK_IN_TIME_ACTOR,
        ':updatedAt': occurredAt,
      },
    }),
  );
};

const persistAccessNotified = async (
  bookingsTable: string,
  reservationId: string,
  today: string,
) => {
  await docClient.send(
    new UpdateCommand({
      TableName: bookingsTable,
      Key: { ReservationID: reservationId },
      UpdateExpression: 'SET #field = :today',
      ExpressionAttributeNames: { '#field': EARLY_CHECK_IN_ACCESS_FIELD },
      ExpressionAttributeValues: { ':today': today },
    }),
  );
};

export const grantDueCheckInAccess = async (options?: {
  today?: string;
  nowTime?: string;
}): Promise<{ granted: string[]; skipped: number }> => {
  const visitsTable = process.env.TABLE_NAME;
  const bookingsTable = process.env.BOOKINGS_TABLE || 'yalla-bookings';
  if (!visitsTable) {
    throw new Error('TABLE_NAME is not configured.');
  }

  const today = options?.today ?? getTodayInMadrid();
  const nowTime = options?.nowTime ?? getNowTimeInMadrid();
  const bookings = await queryBookingsForCheckInDate(bookingsTable, today);
  const visits = await loadVisitsForCheckInDay(visitsTable, today);
  const granted: string[] = [];
  let skipped = 0;
  const occurredAt = nowIso();

  for (const booking of bookings) {
    const reservationId = asString(booking.ReservationID);
    if (!reservationId) {
      continue;
    }
    if (!shouldAutoGrantAccess({ booking, visits, today, nowTime })) {
      skipped += 1;
      continue;
    }
    await persistAccessGranted(bookingsTable, reservationId, occurredAt);
    granted.push(reservationId);

    const readyNotified = asString(booking[EARLY_CHECK_IN_READY_FIELD]) === today;
    const accessNotified =
      asString(booking[EARLY_CHECK_IN_ACCESS_FIELD]) === today;
    if (bookingHasEarlyCheckIn(booking) && readyNotified && !accessNotified) {
      try {
        const posted = await notifyEarlyCheckInAccessEnabled(booking);
        if (posted) {
          await persistAccessNotified(bookingsTable, reservationId, today);
        }
      } catch (error) {
        console.error(
          `Failed to notify early check-in access for ${reservationId}`,
          error,
        );
      }
    }
  }

  return { granted, skipped };
};
