import {
  GetCommand,
  PutCommand,
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  HISTORIC_ACCOUNT_ID,
  HISTORIC_SCHEMA_VERSION,
  MAP_SORT_KEY,
  actualSortKey,
  benchmarkSortKey,
  eventSortKey,
  planActualWrite,
  revisionSortKey,
  sourcePartitionKey,
  type ActualWritePlan,
} from './finance-historic';
import {
  metricReviewsEqual,
  parseMetricReviewMap,
  type MetricCorrection,
  type MetricReviewMap,
} from './historic-metric-review';
import { docClient } from './visit-task-utils';

type MetricMap = Record<string, string | null>;

export type HistoricActualItem = {
  propertyId: string;
  sk: string;
  accountId: string;
  period: string;
  currency: 'EUR';
  amountUnit: 'major';
  schemaVersion: number;
  dataOrigin: 'legacy_excel' | 'yalla_native';
  metrics: MetricMap;
  qualityFlags: string[];
  provenance?: Record<string, unknown>;
  propertyKey?: string;
  nickname?: string;
  sourceSha256?: string;
  metricReview?: MetricReviewMap;
  metricCorrections?: Record<string, MetricCorrection>;
  updatedAt: string;
};

const isConditionalFailure = (error: unknown) =>
  error instanceof Error && error.name === 'ConditionalCheckFailedException';

const asMetrics = (value: unknown): MetricMap => {
  if (!value || typeof value !== 'object') return {};
  const metrics: MetricMap = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    metrics[key] = typeof entry === 'string' ? entry : null;
  }
  return metrics;
};

export const getHistoricItem = async (
  tableName: string,
  propertyId: string,
  sk: string,
) => {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { propertyId, sk },
    }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? null;
};

export const queryHistoricPrefix = async (
  tableName: string,
  propertyId: string,
  prefix: string,
) => {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'propertyId = :propertyId AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: {
          ':propertyId': propertyId,
          ':prefix': prefix,
        },
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

export const queryActualRange = async (
  tableName: string,
  propertyId: string,
  fromPeriod: string,
  toPeriod: string,
) => {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression:
          'propertyId = :propertyId AND sk BETWEEN :from AND :to',
        ExpressionAttributeValues: {
          ':propertyId': propertyId,
          ':from': actualSortKey(fromPeriod),
          ':to': actualSortKey(toPeriod),
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    items.push(...((result.Items as Record<string, unknown>[]) ?? []));
    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);
  return items.filter((item) => String(item.sk ?? '').startsWith('ACTUAL#'));
};

export const writeCurrentActual = async (
  tableName: string,
  item: HistoricActualItem,
): Promise<ActualWritePlan> => {
  const existing = await getHistoricItem(tableName, item.propertyId, item.sk);
  const existingReview = parseMetricReviewMap(existing?.metricReview);
  const reviewsMatch =
    item.metricReview === undefined ||
    metricReviewsEqual(existingReview, item.metricReview);
  const plan = planActualWrite(
    existing
      ? {
          dataOrigin: String(existing.dataOrigin ?? ''),
          metrics: asMetrics(existing.metrics),
        }
      : null,
    { dataOrigin: item.dataOrigin, metrics: item.metrics },
    { reviewsMatch },
  );
  if (plan === 'skip') return 'skip';
  if (plan === 'revise' && existing) {
    const updatedAt = String(existing.updatedAt ?? item.updatedAt);
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          ...existing,
          sk: revisionSortKey(item.period, updatedAt),
        },
      }),
    );
  }
  try {
    await docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: item,
        ...(plan === 'insert'
          ? {
              ConditionExpression:
                'attribute_not_exists(propertyId) AND attribute_not_exists(sk)',
            }
          : {}),
      }),
    );
  } catch (error) {
    if (!isConditionalFailure(error)) throw error;
    return writeCurrentActual(tableName, item);
  }
  return plan;
};

export const emptyActualItem = (
  input: Omit<HistoricActualItem, 'accountId' | 'currency' | 'amountUnit' | 'schemaVersion' | 'sk'> & {
    sk?: string;
  },
): HistoricActualItem => ({
  accountId: HISTORIC_ACCOUNT_ID,
  currency: 'EUR',
  amountUnit: 'major',
  schemaVersion: HISTORIC_SCHEMA_VERSION,
  sk: input.sk ?? actualSortKey(input.period),
  ...input,
});

export const getPropertyMap = async (tableName: string, propertyKey: string) =>
  getHistoricItem(tableName, sourcePartitionKey(propertyKey), MAP_SORT_KEY);

export const putPropertyMap = async (
  tableName: string,
  item: Record<string, unknown>,
) => {
  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: item,
      ConditionExpression:
        'attribute_not_exists(propertyId) AND attribute_not_exists(sk)',
    }),
  );
};

export const putBenchmark = async (
  tableName: string,
  propertyId: string,
  benchmarkKey: string,
  item: Record<string, unknown>,
) => {
  const sk = benchmarkSortKey(benchmarkKey);
  const existing = await getHistoricItem(tableName, propertyId, sk);
  if (existing) return 'skip' as const;
  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: { ...item, propertyId, sk },
      ConditionExpression:
        'attribute_not_exists(propertyId) AND attribute_not_exists(sk)',
    }),
  );
  return 'insert' as const;
};

export const putHistoricEvent = async (
  tableName: string,
  item: Record<string, unknown>,
) => {
  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: item,
    }),
  );
};

export const deleteHistoricEvent = async (
  tableName: string,
  propertyId: string,
  date: string,
  eventId: string,
) => {
  await docClient.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { propertyId, sk: eventSortKey(date, eventId) },
    }),
  );
};
