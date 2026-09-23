import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { scanAllItems } from './cleaning-plan';
import { nowIso } from './dynamo-http';
import {
  asOverrides,
  asString,
  getMonthRecord,
  getSettingsRecord,
  isBillingMaintenanceVisit,
  isMonthId,
  maintenanceVisitPrice,
  normalizeSettings,
} from './maintenance-billing';
import {
  asStringList,
  reportGroupById,
  reportGroupForMember,
  resolveReportGroups,
  type GroupableProperty,
} from './property-groups';
import {
  isPropertyReportEligible,
  reportScopeForProperty,
} from './property-reports';
import { docClient } from './visit-task-utils';

export const CASE_STATUSES = ['KNOWN', 'QUARANTINE', 'CLOSED'] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const QUARANTINE_DAYS = 30;
const QUARANTINE_MS = QUARANTINE_DAYS * 24 * 60 * 60 * 1000;

export type CaseDestination = {
  propertyId: string;
  propertyName: string;
  memberIds: string[];
};

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

export const asCaseStatus = (value: unknown): CaseStatus | '' => {
  const status = asString(value).toUpperCase();
  return CASE_STATUSES.includes(status as CaseStatus)
    ? (status as CaseStatus)
    : '';
};

export const shouldAutoCloseCase = (
  item: Record<string, unknown>,
  now = Date.now(),
) => {
  if (asCaseStatus(item.status) !== 'QUARANTINE') {
    return false;
  }
  const started = asString(item.quarantineStartedAt);
  const startedMs = Date.parse(started);
  if (!started || !Number.isFinite(startedMs)) {
    return false;
  }
  if (now - startedMs < QUARANTINE_MS) {
    return false;
  }
  const lastIssue = asString(item.lastIssueAt);
  const lastIssueMs = Date.parse(lastIssue);
  if (lastIssue && Number.isFinite(lastIssueMs) && lastIssueMs >= startedMs) {
    return false;
  }
  return true;
};

export const loadProperties = (tableName: string) => scanAllItems(tableName);

const asGroupable = (item: Record<string, unknown>): GroupableProperty => ({
  id: asString(item.id),
  nickname: asString(item.nickname) || null,
  listingNickname: asString(item.listingNickname) || null,
  title: asString(item.title) || null,
  type: asString(item.type) || null,
  memberIds: item.memberIds,
  memberNames: item.memberNames,
  system: item.system,
  active: item.active,
});

export const resolveCaseDestination = (
  propertyId: string,
  properties: Record<string, unknown>[],
): CaseDestination | null => {
  const id = propertyId.trim();
  if (!id) {
    return null;
  }
  const groupable = properties.map(asGroupable);
  const groups = resolveReportGroups(groupable);
  const group = reportGroupById(groups, id) ?? reportGroupForMember(groups, id);
  if (group) {
    return {
      propertyId: group.id,
      propertyName: group.name,
      memberIds: unique([group.id, ...group.memberIds]),
    };
  }
  const property = properties.find((entry) => asString(entry.id) === id);
  if (!property || !isPropertyReportEligible(property, groups)) {
    return null;
  }
  const scope = reportScopeForProperty(property);
  return {
    propertyId: scope.id,
    propertyName: scope.name,
    memberIds: unique(scope.memberIds),
  };
};

export const propertyInScope = (propertyId: string, memberIds: string[]) =>
  Boolean(propertyId) && memberIds.includes(propertyId);

export const queryByPartition = async (params: {
  tableName: string;
  indexName: string;
  partitionName: string;
  partitionValue: string;
  scanForward?: boolean;
}) => {
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const items: Record<string, unknown>[] = [];
  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: params.tableName,
        IndexName: params.indexName,
        KeyConditionExpression: '#pk = :pk',
        ExpressionAttributeNames: { '#pk': params.partitionName },
        ExpressionAttributeValues: { ':pk': params.partitionValue },
        ExclusiveStartKey: lastEvaluatedKey,
        ScanIndexForward: params.scanForward ?? false,
      }),
    );
    items.push(...((result.Items as Record<string, unknown>[]) ?? []));
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);
  return items;
};

export const getCase = async (tableName: string, id: string) => {
  const result = await docClient.send(
    new GetCommand({ TableName: tableName, Key: { id } }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? undefined;
};

export const updateCaseFields = async (
  tableName: string,
  id: string,
  set: Record<string, unknown>,
  remove: string[] = [],
) => {
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  const setParts: string[] = [];
  let index = 0;
  const fields: Record<string, unknown> = { ...set, updatedAt: nowIso() };
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }
    const nameKey = `#s${index}`;
    const valueKey = `:s${index}`;
    names[nameKey] = field;
    values[valueKey] = value;
    setParts.push(`${nameKey} = ${valueKey}`);
    index += 1;
  }
  const removeParts = remove
    .filter((field) => fields[field] === undefined)
    .map((field, removeIndex) => {
      const nameKey = `#r${removeIndex}`;
      names[nameKey] = field;
      return nameKey;
    });
  let expression = `SET ${setParts.join(', ')}`;
  if (removeParts.length > 0) {
    expression += ` REMOVE ${removeParts.join(', ')}`;
  }
  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { id },
      UpdateExpression: expression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  );
};

export const closeExpiredCase = async (
  tableName: string,
  item: Record<string, unknown>,
) => {
  const id = asString(item.id);
  if (!id || !shouldAutoCloseCase(item)) {
    return item;
  }
  const closedAt = nowIso();
  await updateCaseFields(tableName, id, {
    status: 'CLOSED',
    closedAt,
  });
  return { ...item, status: 'CLOSED', closedAt, updatedAt: closedAt };
};

export const matchesCaseQuery = (
  item: Record<string, unknown>,
  query: string,
  propertyId: string,
) => {
  if (propertyId && asString(item.propertyId) !== propertyId) {
    return false;
  }
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const haystack = [item.title, item.description, item.propertyName, item.id]
    .map((value) => asString(value).toLowerCase())
    .join(' ');
  return haystack.includes(needle);
};

export const caseEvents = (tableName: string, caseId: string) =>
  queryByPartition({
    tableName,
    indexName: 'caseId-createdAt-index',
    partitionName: 'caseId',
    partitionValue: caseId,
    scanForward: true,
  });

export const publicCase = (item: Record<string, unknown>) => ({
  id: asString(item.id),
  title: asString(item.title),
  description: asString(item.description),
  status: asCaseStatus(item.status),
  propertyId: asString(item.propertyId),
  propertyName: asString(item.propertyName),
  lastIssueAt: asString(item.lastIssueAt) || undefined,
  quarantineStartedAt: asString(item.quarantineStartedAt) || undefined,
  closedAt: asString(item.closedAt) || undefined,
  visitIds: asStringList(item.visitIds),
  movementIds: asStringList(item.movementIds),
  taskIds: asStringList(item.taskIds),
  createdAt: asString(item.createdAt) || undefined,
  updatedAt: asString(item.updatedAt) || undefined,
  createdBy: asString(item.createdBy) || undefined,
});

export const loadVisitCost = async (params: {
  visit: Record<string, unknown>;
  billingTable?: string;
  settingsTable?: string;
  settings?: ReturnType<typeof normalizeSettings>;
  months: Map<string, Record<string, unknown> | undefined>;
}) => {
  const id = asString(params.visit.id);
  const base = {
    id,
    title: asString(params.visit.title) || id,
    scheduledDate: asString(params.visit.scheduledDate),
    propertyId: asString(params.visit.propertyId),
    price: null as number | null,
    includedInMaintenance: false,
  };
  if (
    !params.billingTable ||
    !params.settings ||
    !isBillingMaintenanceVisit(params.visit)
  ) {
    return base;
  }
  const monthId = base.scheduledDate.slice(0, 7);
  if (!isMonthId(monthId)) {
    return base;
  }
  if (!params.months.has(monthId)) {
    params.months.set(
      monthId,
      await getMonthRecord(params.billingTable, monthId),
    );
  }
  const month = params.months.get(monthId);
  const override = asOverrides(month?.overrides)[id];
  const price = maintenanceVisitPrice(params.visit, params.settings, override);
  return {
    ...base,
    price,
    includedInMaintenance: price !== null,
  };
};

export const loadSettings = async (settingsTable?: string) => {
  if (!settingsTable) {
    return undefined;
  }
  return normalizeSettings(await getSettingsRecord(settingsTable));
};
