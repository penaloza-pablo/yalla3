import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { normalizeStatus, nowIso } from './dynamo-http';

export const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const BUSINESS_TIMEZONE = 'Europe/Madrid';

export const getTodayInMadrid = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE }).format(
    new Date(),
  );

export const TERMINAL_VISIT_STATUSES = new Set(['COMPLETED', 'CANCELLED']);

export const resolveVisitStatus = (visit: {
  status?: string;
  scheduledDate?: string;
}) => {
  const current = normalizeStatus(visit.status);
  if (TERMINAL_VISIT_STATUSES.has(current)) {
    return current;
  }
  const scheduledDate = visit.scheduledDate?.trim() ?? '';
  if (!scheduledDate) {
    return 'SCHEDULED';
  }
  if (scheduledDate < getTodayInMadrid()) {
    return 'OVERDUE';
  }
  return 'SCHEDULED';
};

export const getNextSequentialId = async (
  tableName: string,
  prefix: string,
) => {
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  let maxValue = 0;
  const pattern = new RegExp(`^${prefix}-(\\d+)$`, 'i');

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'id',
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    (result.Items ?? []).forEach((entry) => {
      const id = typeof entry.id === 'string' ? entry.id : '';
      const match = id.match(pattern);
      if (!match) {
        return;
      }
      const value = Number(match[1]);
      if (Number.isFinite(value)) {
        maxValue = Math.max(maxValue, value);
      }
    });
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  return `${prefix}-${String(maxValue + 1).padStart(3, '0')}`;
};

export const persistVisitStatusIfNeeded = async (
  tableName: string,
  item: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const nextStatus = resolveVisitStatus({
    status: typeof item.status === 'string' ? item.status : '',
    scheduledDate:
      typeof item.scheduledDate === 'string' ? item.scheduledDate : '',
  });
  const current = normalizeStatus(
    typeof item.status === 'string' ? item.status : '',
  );
  if (current === nextStatus) {
    return { ...item, status: nextStatus };
  }
  const updatedAt = nowIso();
  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { id: item.id },
      UpdateExpression: 'SET #status = :status, #updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status',
        '#updatedAt': 'updatedAt',
      },
      ExpressionAttributeValues: {
        ':status': nextStatus,
        ':updatedAt': updatedAt,
      },
    }),
  );
  return { ...item, status: nextStatus, updatedAt };
};

export const releaseVisitTasksOnCancel = async (
  tasksTable: string,
  visitId: string,
) => {
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const released: Record<string, unknown>[] = [];

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: tasksTable,
        IndexName: 'visitId-createdAt-index',
        KeyConditionExpression: '#visitId = :visitId',
        ExpressionAttributeNames: { '#visitId': 'visitId' },
        ExpressionAttributeValues: { ':visitId': visitId },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    for (const task of result.Items ?? []) {
      const status = normalizeStatus(
        typeof task.status === 'string' ? task.status : '',
      );
      if (status === 'COMPLETED') {
        continue;
      }
      if (status !== 'PENDING' && status !== 'BLOCKED') {
        continue;
      }
      const updatedAt = nowIso();
      await docClient.send(
        new UpdateCommand({
          TableName: tasksTable,
          Key: { id: task.id },
          UpdateExpression:
            'REMOVE #visitId SET #status = :status, #updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#visitId': 'visitId',
            '#status': 'status',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':status': 'UNASSIGNED',
            ':updatedAt': updatedAt,
          },
        }),
      );
      released.push({
        ...task,
        status: 'UNASSIGNED',
        updatedAt,
        visitId: undefined,
      });
    }
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  return released;
};

/** Task totals for a visit (same set as the visit detail task list). */
export const getTaskCountsForVisit = async (
  tasksTable: string,
  visitId: string,
) => {
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  let total = 0;
  let completed = 0;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: tasksTable,
        IndexName: 'visitId-createdAt-index',
        KeyConditionExpression: '#visitId = :visitId',
        ExpressionAttributeNames: { '#visitId': 'visitId' },
        ExpressionAttributeValues: { ':visitId': visitId },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    for (const task of result.Items ?? []) {
      total += 1;
      const status = normalizeStatus(
        typeof task.status === 'string' ? task.status : '',
      );
      if (status === 'COMPLETED') {
        completed += 1;
      }
    }
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  return { total, completed };
};

export const putItem = async (tableName: string, item: Record<string, unknown>) =>
  docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: item,
    }),
  );
