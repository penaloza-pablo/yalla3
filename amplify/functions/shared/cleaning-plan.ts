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

export type CleaningTypeRecord = {
  id: string;
  name: string;
  price: number;
  durationHours: number;
  isDefault: boolean;
};

const timeToMinutes = (value: string) => {
  const normalized = normalizeStartTime(value);
  if (!normalized) {
    return null;
  }
  const [hours, minutes] = normalized.split(':').map(Number);
  return hours * 60 + minutes;
};

export const addHoursToTime = (startTime: string, durationHours: number) => {
  const startMinutes = timeToMinutes(startTime);
  if (startMinutes === null || !Number.isFinite(durationHours) || durationHours <= 0) {
    return '';
  }
  const added = Math.round(durationHours * 60);
  const total = (startMinutes + added) % (24 * 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const normalizeDurationHours = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.round(numeric * 100) / 100;
};

export const normalizePrice = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return Math.round(numeric * 100) / 100;
};

const newCleaningTypeId = () =>
  `CT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const normalizeCleaningTypes = (value: unknown): CleaningTypeRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const types = value
    .map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const durationHours = normalizeDurationHours(item.durationHours);
      if (!name || durationHours <= 0) {
        return null;
      }
      const id =
        typeof item.id === 'string' && item.id.trim()
          ? item.id.trim()
          : newCleaningTypeId();
      return {
        id,
        name,
        price: normalizePrice(item.price),
        durationHours,
        isDefault: Boolean(item.isDefault),
      } satisfies CleaningTypeRecord;
    })
    .filter((entry): entry is CleaningTypeRecord => Boolean(entry));

  if (types.length === 0) {
    return [];
  }
  const defaultIndex = types.findIndex((entry) => entry.isDefault);
  return types.map((entry, index) => ({
    ...entry,
    isDefault: defaultIndex >= 0 ? index === defaultIndex : index === 0,
  }));
};

export const resolveCleaningType = (
  types: CleaningTypeRecord[],
  preferredId?: string,
) => {
  if (types.length === 0) {
    return undefined;
  }
  const preferred = preferredId?.trim();
  if (preferred) {
    const match = types.find((entry) => entry.id === preferred);
    if (match) {
      return match;
    }
  }
  return types.find((entry) => entry.isDefault) ?? types[0];
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
