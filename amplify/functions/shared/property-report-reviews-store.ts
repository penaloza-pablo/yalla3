import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { reviewsForReservationIds } from './property-report-reviews';
import { docClient } from './visit-task-utils';

export const scanReviewsForReport = async (tableName: string) => {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'ReviewID, ReservationID, GuestName, #S, Rating',
        ExpressionAttributeNames: { '#S': 'Status' },
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

export const loadReviewsForReservations = async (
  tableName: string,
  reservationIds: Iterable<string>,
) => {
  const ids = [...reservationIds].map((id) => id.trim()).filter(Boolean);
  if (ids.length === 0) {
    return [];
  }
  const items = await scanReviewsForReport(tableName);
  return reviewsForReservationIds(items, ids);
};
