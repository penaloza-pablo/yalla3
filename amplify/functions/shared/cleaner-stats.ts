import {
  BatchGetCommand,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  CLEANING_VISIT_TYPE_ID,
  getPlanByDate,
  scanAllItems,
} from './cleaning-plan';
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
const visitsTable = () => process.env.VISITS_TABLE || '';

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

const batchGetVisitsById = async (tableName: string, ids: string[]) => {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  const visits = new Map<string, Record<string, unknown>>();
  for (let index = 0; index < uniqueIds.length; index += 100) {
    let keys = uniqueIds.slice(index, index + 100).map((id) => ({ id }));
    let attempts = 0;
    while (keys.length > 0 && attempts < 5) {
      const result = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: { Keys: keys },
          },
        }),
      );
      for (const item of result.Responses?.[tableName] ?? []) {
        const id = asString(item.id);
        if (id) {
          visits.set(id, item);
        }
      }
      const unprocessed =
        result.UnprocessedKeys?.[tableName]?.Keys?.map((key) => ({
          id: asString(key.id),
        })).filter((key) => key.id) ?? [];
      keys = unprocessed;
      attempts += 1;
    }
  }
  return visits;
};

const sortCompletions = (entries: CleanerCompletion[]) =>
  entries
    .slice()
    .sort((left, right) =>
      `${right.completedAt} ${right.date}`.localeCompare(
        `${left.completedAt} ${left.date}`,
      ),
    );

export const reconcileCleanerStatsFromPlans = async () => {
  const plansName = plansTable();
  const visitsName = visitsTable();
  const cleanersName = cleanersTable();
  if (!plansName || !visitsName || !cleanersName) {
    throw new Error(
      'CLEANING_PLANS_TABLE, VISITS_TABLE, or CLEANERS_TABLE is not configured.',
    );
  }

  const planItems = await scanAllItems(plansName);
  const assignments: Array<{
    visitId: string;
    cleanerId: string;
    date: string;
  }> = [];
  for (const plan of planItems) {
    const date = dateOnly(plan.plannedDate) || dateOnly(plan.id);
    const items = Array.isArray(plan.items) ? plan.items : [];
    for (const entry of items) {
      const item = (entry ?? {}) as Record<string, unknown>;
      const visitId = asString(item.visitId);
      const cleanerId = asString(item.cleanerId);
      if (!visitId || !cleanerId) {
        continue;
      }
      assignments.push({ visitId, cleanerId, date });
    }
  }

  const visitById = await batchGetVisitsById(
    visitsName,
    assignments.map((entry) => entry.visitId),
  );
  const completionsByCleaner = new Map<string, CleanerCompletion[]>();
  for (const assignment of assignments) {
    const visit = visitById.get(assignment.visitId);
    if (!visit || !isCleaningVisit(visit)) {
      continue;
    }
    if (normalizeStatus(asString(visit.status)) !== 'COMPLETED') {
      continue;
    }
    const current = completionsByCleaner.get(assignment.cleanerId) ?? [];
    if (current.some((entry) => entry.visitId === assignment.visitId)) {
      continue;
    }
    current.push({
      visitId: assignment.visitId,
      date: dateOnly(visit.scheduledDate) || assignment.date,
      completedAt:
        asString(visit.closedAt) || asString(visit.updatedAt) || assignment.date,
    });
    completionsByCleaner.set(assignment.cleanerId, current);
  }

  const cleanerRecords = await scanAllItems(cleanersName);
  let updated = 0;
  let completions = 0;
  for (const cleaner of cleanerRecords) {
    const cleanerId = asString(cleaner.id);
    if (!cleanerId) {
      continue;
    }
    const cleanerCompletions = sortCompletions(
      completionsByCleaner.get(cleanerId) ?? [],
    );
    completions += cleanerCompletions.length;
    await putItem(cleanersName, {
      ...cleaner,
      cleaningsCount: cleanerCompletions.length,
      recentCompletions: cleanerCompletions.slice(0, TREND_WINDOW),
      updatedAt: nowIso(),
    });
    await refreshCleanerRatings(cleanerId);
    updated += 1;
  }

  return {
    cleanersUpdated: updated,
    completedAssignments: completions,
    plannedAssignments: assignments.length,
  };
};
