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

export const cancelVisitTasksOnVisitCancel = async (
  tasksTable: string,
  visitId: string,
) => {
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const cancelled: Record<string, unknown>[] = [];

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
      const taskId = typeof task.id === 'string' ? task.id : '';
      if (!taskId) {
        continue;
      }
      const status = normalizeStatus(
        typeof task.status === 'string' ? task.status : '',
      );
      if (status !== 'PENDING' && status !== 'BLOCKED') {
        continue;
      }
      const updatedAt = nowIso();
      await docClient.send(
        new UpdateCommand({
          TableName: tasksTable,
          Key: { id: taskId },
          UpdateExpression:
            'SET #status = :status, #updatedAt = :updatedAt',
          ExpressionAttributeNames: {
            '#status': 'status',
            '#updatedAt': 'updatedAt',
          },
          ExpressionAttributeValues: {
            ':status': 'CANCELLED',
            ':updatedAt': updatedAt,
          },
        }),
      );
      cancelled.push({
        ...task,
        status: 'CANCELLED',
        updatedAt,
      });
    }
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  return cancelled;
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

export const visitHasOpenTasks = async (tasksTable: string, visitId: string) => {
  let lastEvaluatedKey: Record<string, unknown> | undefined;

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
      if (
        status !== 'COMPLETED' &&
        status !== 'DISMISS' &&
        status !== 'CANCELLED'
      ) {
        return true;
      }
    }
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  return false;
};

export const putItem = async (tableName: string, item: Record<string, unknown>) =>
  docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: item,
    }),
  );

export const USER_EDIT_SYNC_METADATA = {
  lastUpdateSource: 'Yalla',
  syncStatus: 'Pending',
} as const;

/** Never SET or REMOVE on user-originated frontend updates. */
export const PRESERVED_SYNC_FIELDS = new Set([
  'guestyTaskId',
  'lastSyncedToGuestyAt',
  'lastSyncedToGuestyHash',
  'origin',
  'rawGuestyPayload',
  'lastGuestyEventType',
]);

export type UserOriginatedPatch = {
  set: Record<string, unknown>;
  remove?: string[];
};

export const withUserEditSyncMetadata = (
  fields: Record<string, unknown>,
  timestamp = nowIso(),
) => ({
  ...fields,
  ...USER_EDIT_SYNC_METADATA,
  updatedAt: timestamp,
});

export const patchUserOriginatedRecord = async (
  tableName: string,
  id: string,
  patch: UserOriginatedPatch,
) => {
  const timestamp = nowIso();
  const setFields = withUserEditSyncMetadata(patch.set, timestamp);

  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const setParts: string[] = [];
  let setIdx = 0;

  for (const [field, value] of Object.entries(setFields)) {
    if (PRESERVED_SYNC_FIELDS.has(field) || value === undefined) {
      continue;
    }
    const nameKey = `#s${setIdx}`;
    const valueKey = `:s${setIdx}`;
    names[nameKey] = field;
    values[valueKey] = value;
    setParts.push(`${nameKey} = ${valueKey}`);
    setIdx += 1;
  }

  const removeFields = (patch.remove ?? []).filter(
    (field) => !PRESERVED_SYNC_FIELDS.has(field),
  );
  const removeParts = removeFields.map((field, removeIdx) => {
    const nameKey = `#r${removeIdx}`;
    names[nameKey] = field;
    return nameKey;
  });

  const expressionParts: string[] = [];
  if (setParts.length > 0) {
    expressionParts.push(`SET ${setParts.join(', ')}`);
  }
  if (removeParts.length > 0) {
    expressionParts.push(`REMOVE ${removeParts.join(', ')}`);
  }

  if (expressionParts.length === 0) {
    return;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { id },
      UpdateExpression: expressionParts.join(' '),
      ExpressionAttributeNames: names,
      ...(Object.keys(values).length > 0
        ? { ExpressionAttributeValues: values }
        : {}),
    }),
  );
};

export const mergeUserEditResponseItem = (
  existing: Record<string, unknown>,
  patch: UserOriginatedPatch,
  timestamp = nowIso(),
): Record<string, unknown> => {
  const item: Record<string, unknown> = {
    ...existing,
    ...patch.set,
    ...USER_EDIT_SYNC_METADATA,
    updatedAt: timestamp,
  };
  for (const field of patch.remove ?? []) {
    delete item[field];
  }
  return item;
};

const TASK_STATUSES_SYNC_DUE_DATE = new Set(['PENDING', 'BLOCKED', 'CANCELLED']);

export const syncVisitTaskDueDates = async (
  tasksTable: string,
  visitId: string,
  dueDate: string,
) => {
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  let updated = 0;
  const trimmedDueDate = dueDate.trim();

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
      const taskId = typeof task.id === 'string' ? task.id : '';
      if (!taskId) {
        continue;
      }
      const status = normalizeStatus(
        typeof task.status === 'string' ? task.status : '',
      );
      if (!TASK_STATUSES_SYNC_DUE_DATE.has(status)) {
        continue;
      }
      await patchUserOriginatedRecord(tasksTable, taskId, {
        set: { dueDate: trimmedDueDate },
      });
      updated += 1;
    }
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  return updated;
};

export type BulkVisitTaskInput = {
  title?: string;
  description?: string;
  priority?: string;
};

export const createVisitTasksBulk = async (
  tasksTable: string,
  visit: Record<string, unknown>,
  tasks: BulkVisitTaskInput[],
) => {
  const visitId = typeof visit.id === 'string' ? visit.id : '';
  const propertyId =
    typeof visit.propertyId === 'string' ? visit.propertyId : '';
  const teamId = typeof visit.teamId === 'string' ? visit.teamId : '';
  const assignedUserId =
    typeof visit.assignedUserId === 'string' ? visit.assignedUserId : '';
  const dueDate =
    typeof visit.scheduledDate === 'string' ? visit.scheduledDate : '';
  const timestamp = nowIso();
  const created: Record<string, unknown>[] = [];

  for (const draft of tasks) {
    const title = draft.title?.trim();
    if (!title) {
      continue;
    }
    const priority = normalizeStatus(draft.priority);
    const item: Record<string, unknown> = {
      id: await getNextSequentialId(tasksTable, 'TASK'),
      propertyId,
      visitId,
      teamId,
      assignedUserId: assignedUserId || undefined,
      title,
      description: draft.description?.trim() ?? '',
      status: 'PENDING',
      priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'].includes(priority)
        ? priority
        : 'MEDIUM',
      dueDate: dueDate || undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await putItem(tasksTable, item);
    created.push(item);
  }

  return created;
};
