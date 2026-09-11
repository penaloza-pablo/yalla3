import { BatchGetCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { isEarlyCheckInEnabled } from './bookings-planner';
import { queryVisitsForScheduledDate } from './cleaning-plan';
import { yallaAliasForListingId } from './property-identity';
import { loadSlackSecrets, slackApi } from './slack';
import { escapeMrkdwn } from './slack-cleaning';
import {
  SLACK_NOTIFICATION_IDS,
  isSlackNotificationEnabled,
} from './slack-notifications';
import {
  docClient,
  getNowTimeInMadrid,
  getTodayInMadrid,
} from './visit-task-utils';

export const EARLY_CHECK_IN_READY_FIELD = 'EarlyCheckInReadyNotified';
export const EARLY_CHECK_IN_NOTIFY_TIME = '11:00';

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const isConfirmedBooking = (item: Record<string, unknown>) =>
  asString(item.Status).toLowerCase() === 'confirmed';

const isEarlyCheckInOn = (item: Record<string, unknown>) =>
  item.EarlyCheckInOn === true ||
  item.earlyCheckInOn === true ||
  isEarlyCheckInEnabled(item.EarlyCheckIn ?? item.earlyCheckIn);

type PropertyOption = {
  id: string;
  nickname: string;
  listingNickname: string;
  title: string;
};

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
        IndexName: 'CheckInDate-index',
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
      items.push(...((result.Responses?.[tableName] as Record<string, unknown>[]) ?? []));
      nextKeys.push(...(result.UnprocessedKeys?.[tableName]?.Keys ?? []));
    }
    pending = nextKeys;
  }
  return items;
};

const listProperties = async (tableName: string) => {
  const items: PropertyOption[] = [];
  if (!tableName) {
    return items;
  }
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    for (const item of result.Items ?? []) {
      const id = asString(item.id);
      if (!id) {
        continue;
      }
      items.push({
        id,
        nickname: asString(item.nickname),
        listingNickname: asString(item.listingNickname),
        title: asString(item.title),
      });
    }
    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);
  return items;
};

export const resolveBookingPropertyId = (
  listingId: string,
  listingNickname: string,
  properties: PropertyOption[],
) => {
  if (listingId) {
    const byId = properties.find((property) => property.id === listingId);
    if (byId) {
      return byId.id;
    }
  }
  const alias = yallaAliasForListingId(listingId);
  const nick = (alias || listingNickname).trim().toLowerCase();
  if (!nick) {
    return listingId;
  }
  const byNickname = properties.find((property) => {
    const labels = [
      property.listingNickname,
      property.nickname,
      property.title,
    ]
      .join(' ')
      .toLowerCase();
    return (
      property.listingNickname.toLowerCase() === nick ||
      property.nickname.toLowerCase() === nick ||
      labels.includes(nick)
    );
  });
  return byNickname?.id || listingId;
};

const visitsForProperty = (
  visits: Record<string, unknown>[],
  propertyId: string,
  listingId: string,
) => {
  const ids = new Set(
    [propertyId, listingId, yallaAliasForListingId(listingId)].filter(Boolean),
  );
  return visits.filter((visit) => ids.has(asString(visit.propertyId)));
};

const allVisitsCompleted = (visits: Record<string, unknown>[]) =>
  visits.length > 0 &&
  visits.every((visit) => asString(visit.status).toUpperCase() === 'COMPLETED');

const markNotified = async (
  bookingsTable: string,
  reservationId: string,
  today: string,
) => {
  await docClient.send(
    new UpdateCommand({
      TableName: bookingsTable,
      Key: { ReservationID: reservationId },
      UpdateExpression: 'SET #field = :today',
      ExpressionAttributeNames: { '#field': EARLY_CHECK_IN_READY_FIELD },
      ExpressionAttributeValues: { ':today': today },
    }),
  );
};

const earlyCheckInReadyMessage = (label: string, guestName: string) =>
  `${escapeMrkdwn(label)} lista para Early check-in. Guest: ${escapeMrkdwn(guestName)}`;

const propertyLabel = (
  booking: Record<string, unknown>,
  propertyId: string,
  properties: PropertyOption[],
) => {
  const property = properties.find((item) => item.id === propertyId);
  return (
    asString(booking.ListingNickname) ||
    property?.nickname ||
    property?.listingNickname ||
    property?.title ||
    yallaAliasForListingId(asString(booking.ListingID)) ||
    propertyId
  );
};

export type EarlyCheckInReadyResult = {
  skipped?: string;
  sent: Array<{
    reservationId: string;
    propertyId: string;
    guestName: string;
    reason: 'visits_completed' | 'no_visits';
  }>;
  pending: Array<{
    reservationId: string;
    propertyId: string;
    reason: string;
  }>;
};

export const notifyEarlyCheckInReady = async (options?: {
  ignoreElevenAm?: boolean;
}): Promise<EarlyCheckInReadyResult> => {
  if (
    !(await isSlackNotificationEnabled(
      SLACK_NOTIFICATION_IDS.earlyCheckInReady,
    ))
  ) {
    console.log('Early check-in ready notify skipped: automation disabled.');
    return { skipped: 'disabled', sent: [], pending: [] };
  }

  const visitsTable = process.env.TABLE_NAME;
  const bookingsTable = process.env.BOOKINGS_TABLE || 'yalla-bookings';
  const propertiesTable = process.env.PROPERTIES_TABLE || 'yalla-properties';
  if (!visitsTable) {
    throw new Error('TABLE_NAME is not configured.');
  }

  const { warningsChannelId } = await loadSlackSecrets();
  if (!warningsChannelId) {
    console.error(
      'Early check-in ready notify skipped: missing warningsChannelId in yalla/slack.',
    );
    return { skipped: 'missing_channel', sent: [], pending: [] };
  }

  const today = getTodayInMadrid();
  const nowTime = getNowTimeInMadrid();
  const bookings = (await queryBookingsForCheckInDate(bookingsTable, today)).filter(
    (item) => isConfirmedBooking(item) && isEarlyCheckInOn(item),
  );
  const visits = await queryVisitsForScheduledDate(visitsTable, today);
  const properties = await listProperties(propertiesTable);
  const sent: EarlyCheckInReadyResult['sent'] = [];
  const pending: EarlyCheckInReadyResult['pending'] = [];

  for (const booking of bookings) {
    const reservationId = asString(booking.ReservationID);
    const listingId = asString(booking.ListingID);
    if (!reservationId || !listingId) {
      continue;
    }
    if (asString(booking[EARLY_CHECK_IN_READY_FIELD]) === today) {
      continue;
    }
    const propertyId = resolveBookingPropertyId(
      listingId,
      asString(booking.ListingNickname),
      properties,
    );
    const propertyVisits = visitsForProperty(visits, propertyId, listingId);
    const guestName =
      asString(booking.GuestName) || asString(booking.ListingNickname) || reservationId;
    const label = propertyLabel(booking, propertyId, properties);

    if (propertyVisits.length === 0) {
      if (!options?.ignoreElevenAm && nowTime < EARLY_CHECK_IN_NOTIFY_TIME) {
        pending.push({
          reservationId,
          propertyId,
          reason: `waiting_until_${EARLY_CHECK_IN_NOTIFY_TIME}`,
        });
        continue;
      }
      const text = earlyCheckInReadyMessage(label, guestName);
      await slackApi('chat.postMessage', {
        channel: warningsChannelId,
        text,
      });
      await markNotified(bookingsTable, reservationId, today);
      sent.push({
        reservationId,
        propertyId,
        guestName,
        reason: 'no_visits',
      });
      continue;
    }

    if (!allVisitsCompleted(propertyVisits)) {
      pending.push({
        reservationId,
        propertyId,
        reason: 'open_visits',
      });
      continue;
    }

    const text = earlyCheckInReadyMessage(label, guestName);
    await slackApi('chat.postMessage', {
      channel: warningsChannelId,
      text,
    });
    await markNotified(bookingsTable, reservationId, today);
    sent.push({
      reservationId,
      propertyId,
      guestName,
      reason: 'visits_completed',
    });
  }

  return { sent, pending };
};
