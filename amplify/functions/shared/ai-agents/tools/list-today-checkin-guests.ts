import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient, getTodayInMadrid } from '../../visit-task-utils';
import type { AgentTool, CoverageItem, ToolResult } from '../types';

const CHECK_IN_INDEX = 'CheckInDate-index';

const skippedStatus = (status: string) => {
  const normalized = status.trim().toLowerCase();
  return (
    normalized === 'inquiry' ||
    normalized === 'cancelled' ||
    normalized === 'canceled' ||
    normalized === 'declined'
  );
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const listTodayCheckinGuestsTool: AgentTool = {
  name: 'list_today_checkin_guests',
  description:
    'Lists guests with a check-in date equal to today in Europe/Madrid. Returns names and booking ids. Skips inquiry and cancelled reservations.',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  execute: async (): Promise<ToolResult> => {
    const tableName = process.env.BOOKINGS_TABLE || 'yalla-bookings';
    const dateIso = getTodayInMadrid();
    const items: Record<string, unknown>[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const result = await docClient.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: CHECK_IN_INDEX,
          KeyConditionExpression: 'CheckInDate = :checkInDate',
          ExpressionAttributeValues: { ':checkInDate': dateIso },
          ProjectionExpression:
            'ReservationID, GuestName, ListingNickname, #status',
          ExpressionAttributeNames: { '#status': 'Status' },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      items.push(...((result.Items as Record<string, unknown>[]) ?? []));
      exclusiveStartKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (exclusiveStartKey);

    const guests: Array<{
      reservationId: string;
      guestName: string;
      listingNickname: string;
    }> = [];
    const planned: CoverageItem[] = [];
    const unchecked: CoverageItem[] = [];

    for (const item of items) {
      const reservationId = asString(item.ReservationID) || crypto.randomUUID();
      const status = asString(item.Status);
      const guestName = asString(item.GuestName);
      const listingNickname = asString(item.ListingNickname);
      if (skippedStatus(status)) {
        unchecked.push({
          id: reservationId,
          label: guestName || reservationId,
          reason: `Booking status ${status || 'unknown'} was excluded.`,
          source: `yalla-bookings CheckInDate=${dateIso}`,
        });
        continue;
      }
      if (!guestName) {
        unchecked.push({
          id: reservationId,
          label: listingNickname || reservationId,
          reason: 'Booking has no guest name.',
          source: `yalla-bookings CheckInDate=${dateIso}`,
        });
        continue;
      }
      guests.push({ reservationId, guestName, listingNickname });
      planned.push({
        id: reservationId,
        label: guestName,
        detail: listingNickname || undefined,
        source: `yalla-bookings CheckInDate=${dateIso} GuestName`,
      });
    }

    guests.sort((left, right) =>
      left.guestName.localeCompare(right.guestName, 'es'),
    );

    return {
      content: {
        businessDate: dateIso,
        timezone: 'Europe/Madrid',
        guests: guests.map((guest) => ({
          guestName: guest.guestName,
          reservationId: guest.reservationId,
        })),
        skippedCount: unchecked.length,
      },
      coverage: { planned, unchecked },
    };
  },
};
