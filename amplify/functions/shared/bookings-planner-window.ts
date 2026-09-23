import { BatchGetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { plannerWindowEnd } from './bookings-planner';
import { listDatesInRange } from './date-range';
import { docClient, getTodayInMadrid } from './visit-task-utils';

const queryCheckInDate = async (tableName: string, checkInDate: string) => {
  const items: Record<string, unknown>[] = [];
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
    items.push(...((result.Items as Record<string, unknown>[]) ?? []));
    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);
  return items;
};

const hydrateBookingsById = async (tableName: string, ids: string[]) => {
  const extras = new Map<string, Record<string, unknown>>();
  let keys: Record<string, unknown>[] = ids.map((id) => ({ ReservationID: id }));

  for (let attempt = 0; attempt < 3 && keys.length > 0; attempt += 1) {
    const nextKeys: Record<string, unknown>[] = [];
    for (let offset = 0; offset < keys.length; offset += 100) {
      const chunk = keys.slice(offset, offset + 100);
      const result = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: { Keys: chunk },
          },
        }),
      );
      for (const item of result.Responses?.[tableName] ?? []) {
        extras.set(String(item.ReservationID ?? ''), item);
      }
      nextKeys.push(...(result.UnprocessedKeys?.[tableName]?.Keys ?? []));
    }
    keys = nextKeys;
  }

  return ids
    .map((id) => extras.get(id))
    .filter((item): item is Record<string, unknown> => Boolean(item));
};

export const listPlannerWindowBookings = async (
  tableName: string,
  today = getTodayInMadrid(),
) => {
  const dates = listDatesInRange(today, plannerWindowEnd(today));
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const date of dates) {
    const page = await queryCheckInDate(tableName, date);
    for (const item of page) {
      const id = String(item.ReservationID ?? '').trim();
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return hydrateBookingsById(tableName, ids);
};
