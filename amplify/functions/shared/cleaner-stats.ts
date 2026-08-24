import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { CLEANING_VISIT_TYPE_ID, getPlanByDate } from './cleaning-plan';
import { normalizeStatus, nowIso } from './dynamo-http';
import { docClient, putItem } from './visit-task-utils';

export const TREND_WINDOW = 10;

export type CleanerCompletion = {
  visitId: string;
  date: string;
  completedAt: string;
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asNumber = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const incidentsTable = () => process.env.CLEANING_INCIDENTS_TABLE || '';
const cleanersTable = () => process.env.CLEANERS_TABLE || '';
const plansTable = () => process.env.CLEANING_PLANS_TABLE || '';

export const computeStarRating = (
  cleanings: number,
  uniqueIncidentVisits: number,
) => {
  if (cleanings <= 0) {
    return 5;
  }
  const withIncidents = Math.min(Math.max(0, uniqueIncidentVisits), cleanings);
  return Math.round(((cleanings - withIncidents) / cleanings) * 5 * 10) / 10;
};

export const dateOnly = (value: unknown) => asString(value).slice(0, 10);

export const isCleaningVisit = (visit: Record<string, unknown>) =>
  asString(visit.visitTypeId) === CLEANING_VISIT_TYPE_ID;

const normalizeCompletions = (value: unknown): CleanerCompletion[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      const visitId = asString(item.visitId);
      if (!visitId) {
        return null;
      }
      return {
        visitId,
        date: dateOnly(item.date) || dateOnly(item.completedAt),
        completedAt: asString(item.completedAt) || dateOnly(item.date),
      } satisfies CleanerCompletion;
    })
    .filter((entry): entry is CleanerCompletion => Boolean(entry));
};

export const getCleanerById = async (cleanerId: string) => {
  const tableName = cleanersTable();
  if (!tableName || !cleanerId) {
    return undefined;
  }
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { id: cleanerId },
    }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? undefined;
};

export const queryIncidentsForCleaner = async (cleanerId: string) => {
  const tableName = incidentsTable();
  if (!tableName || !cleanerId) {
    return [];
  }
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'cleanerId-createdAt-index',
        KeyConditionExpression: 'cleanerId = :cleanerId',
        ExpressionAttributeValues: { ':cleanerId': cleanerId },
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

export const findCleanerIdForVisit = async (
  visit: Record<string, unknown>,
  cleanerIdOverride?: string,
) => {
  const override = asString(cleanerIdOverride);
  if (override) {
    return override;
  }
  const tableName = plansTable();
  const date = dateOnly(visit.scheduledDate);
  const visitId = asString(visit.id);
  if (!tableName || !date || !visitId) {
    return '';
  }
  const plan = await getPlanByDate(tableName, date);
  const items = Array.isArray(plan?.items) ? plan.items : [];
  const match = items.find((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    return asString(item.visitId) === visitId;
  }) as Record<string, unknown> | undefined;
  return asString(match?.cleanerId);
};

export const refreshCleanerRatings = async (cleanerId: string) => {
  const tableName = cleanersTable();
  const cleaner = await getCleanerById(cleanerId);
  if (!tableName || !cleaner) {
    return;
  }
  const incidents = await queryIncidentsForCleaner(cleanerId);
  const uniqueVisitIds = new Set(
    incidents.map((item) => asString(item.visitId)).filter(Boolean),
  );
  const cleaningsCount = Math.max(0, Math.trunc(asNumber(cleaner.cleaningsCount)));
  const recentCompletions = normalizeCompletions(
    cleaner.recentCompletions,
  ).slice(0, TREND_WINDOW);
  const trendIncidentVisits = recentCompletions.filter((entry) =>
    uniqueVisitIds.has(entry.visitId),
  ).length;
  await putItem(tableName, {
    ...cleaner,
    incidentsCount: incidents.length,
    uniqueIncidentVisitCount: uniqueVisitIds.size,
    historicalRating: computeStarRating(cleaningsCount, uniqueVisitIds.size),
    trendRating: computeStarRating(
      recentCompletions.length,
      trendIncidentVisits,
    ),
    recentCompletions,
    updatedAt: nowIso(),
  });
};

export const recordCleaningCompletion = async (
  visit: Record<string, unknown>,
  cleanerIdOverride?: string,
) => {
  if (!isCleaningVisit(visit)) {
    return;
  }
  if (normalizeStatus(asString(visit.status)) !== 'COMPLETED') {
    return;
  }
  const tableName = cleanersTable();
  const visitId = asString(visit.id);
  const cleanerId = await findCleanerIdForVisit(visit, cleanerIdOverride);
  if (!tableName || !visitId || !cleanerId) {
    return;
  }
  const cleaner = await getCleanerById(cleanerId);
  if (!cleaner) {
    return;
  }
  const recentCompletions = normalizeCompletions(cleaner.recentCompletions);
  if (recentCompletions.some((entry) => entry.visitId === visitId)) {
    await refreshCleanerRatings(cleanerId);
    return;
  }
  await putItem(tableName, {
    ...cleaner,
    cleaningsCount: Math.max(0, Math.trunc(asNumber(cleaner.cleaningsCount))) + 1,
    recentCompletions: [
      {
        visitId,
        date: dateOnly(visit.scheduledDate),
        completedAt: asString(visit.closedAt) || nowIso(),
      },
      ...recentCompletions,
    ].slice(0, TREND_WINDOW),
    updatedAt: nowIso(),
  });
  await refreshCleanerRatings(cleanerId);
};
