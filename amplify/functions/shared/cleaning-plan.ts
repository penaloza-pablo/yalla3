import { GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './visit-task-utils';

export const CLEANING_VISIT_TYPE_ID =
  process.env.CLEANING_VISIT_TYPE_ID || 'visit_type_cleaning';

export const PLAN_STATUSES = new Set(['DRAFT', 'READY']);

export const isDateOnly = (value?: string) =>
  Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()));

export const normalizeStartTime = (value?: string) => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return '';
  }
  const match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return '';
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return '';
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const scanAllItems = async (tableName: string) => {
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const items: Record<string, unknown>[] = [];

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    items.push(...((result.Items as Record<string, unknown>[]) ?? []));
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  return items;
};

export const getPlanByDate = async (tableName: string, plannedDate: string) => {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { id: plannedDate },
    }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? undefined;
};

export const queryCleaningVisitsForDate = async (
  visitsTable: string,
  scheduledDate: string,
) => {
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const items: Record<string, unknown>[] = [];

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: visitsTable,
        IndexName: 'scheduledDate-scheduledStartTime-index',
        KeyConditionExpression: '#scheduledDate = :scheduledDate',
        ExpressionAttributeNames: { '#scheduledDate': 'scheduledDate' },
        ExpressionAttributeValues: { ':scheduledDate': scheduledDate },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    items.push(...((result.Items as Record<string, unknown>[]) ?? []));
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  return items.filter((visit) => {
    const visitTypeId =
      typeof visit.visitTypeId === 'string' ? visit.visitTypeId : '';
    const status =
      typeof visit.status === 'string' ? visit.status.toUpperCase() : '';
    return visitTypeId === CLEANING_VISIT_TYPE_ID && status !== 'CANCELLED';
  });
};
