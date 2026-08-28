import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { scanAllItems } from './cleaning-plan';
import {
  docClient,
  getNextSequentialId,
  getTodayInMadrid,
  putItem,
} from './visit-task-utils';

export const DEFAULT_MAINTENANCE_VISIT_TYPE_IDS = [
  'visit_type_maintenance',
  'visit_type_deep_property_check',
  'visit_type_property_check',
  'visit_type_fixings',
  'visit_type_emergency',
];

const parseVisitTypeIds = (value?: string) =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

export const MAINTENANCE_VISIT_TYPE_IDS =
  parseVisitTypeIds(process.env.MAINTENANCE_VISIT_TYPE_IDS).length > 0
    ? parseVisitTypeIds(process.env.MAINTENANCE_VISIT_TYPE_IDS)
    : DEFAULT_MAINTENANCE_VISIT_TYPE_IDS;

export const MAINTENANCE_VISIT_TYPE_ID =
  process.env.MAINTENANCE_VISIT_TYPE_ID || MAINTENANCE_VISIT_TYPE_IDS[0];
export const SETTINGS_ID = 'GLOBAL';
export const VISIBLE_PAST_MONTHS = 3;
export const DEFAULT_HOURS_POOL = 100;
export const DEFAULT_HOURLY_COST = 24;
export const DEFAULT_PROVIDER_NAME = 'Sebas Aular';
export const OTHER_PROVIDER_ID = '__other__';
export const DEFAULT_VISIT_TYPE_HOURS = [
  { id: 'visit_type_deep_property_check', name: 'Deep property check', hours: 1 },
  { id: 'visit_type_property_check', name: 'Property check', hours: 1 },
];

export const BILLING_STATUSES = [
  'TO_ESTIMATE',
  'WAITING_APPROVAL',
  'APPROVED',
  'BILLED',
  'PAID',
] as const;

export type MaintenanceBillingStatus = (typeof BILLING_STATUSES)[number];
export type BillingMonthStatus = 'CURRENT' | 'PENDING_TO_CLOSE' | 'CLOSED';
export type BillingLineSource = 'visit' | 'manual' | 'group';

export type VisitTypeHours = {
  visitTypeId: string;
  visitTypeName: string;
  hours: number;
};

export type MaintenanceSettings = {
  id: string;
  monthlyHoursPool: number;
  hourlyCost: number;
  defaultProviderId: string;
  defaultProviderName: string;
  visitTypeHours: VisitTypeHours[];
};

export type LineOverride = {
  providerId?: string;
  providerName?: string;
  hours?: number | null;
  price?: number | null;
  hoursDisabled?: boolean;
  billingStatus?: MaintenanceBillingStatus;
};

export type ManualBillingLine = {
  id: string;
  date: string;
  propertyId: string;
  property: string;
  providerId: string;
  providerName: string;
  hours: number;
  hoursDisabled: boolean;
  price: number;
  billingStatus: MaintenanceBillingStatus;
};

export type MergedBillingGroup = {
  id: string;
  title: string;
  date: string;
  propertyId: string;
  property: string;
  visitTypeId: string;
  visitTypeName: string;
  providerId: string;
  providerName: string;
  hours: number | null;
  hoursDisabled: boolean;
  price: number | null;
  billingStatus: MaintenanceBillingStatus;
  visitIds: string[];
  manualLineIds: string[];
};

export type MaintenanceBillingMember = {
  id: string;
  source: 'visit' | 'manual';
  visitId: string;
  title: string;
  date: string;
  status: string;
  propertyId: string;
  visitTypeName: string;
  billingStatus: MaintenanceBillingStatus;
};

export type MaintenanceBillingLine = {
  id: string;
  source: BillingLineSource;
  visitId: string;
  title: string;
  visitTypeId: string;
  visitTypeName: string;
  propertyId: string;
  property: string;
  date: string;
  status: string;
  providerId: string;
  providerName: string;
  hours: number | null;
  hoursDisabled: boolean;
  price: number | null;
  billingStatus: MaintenanceBillingStatus;
  isManual: boolean;
  members?: MaintenanceBillingMember[];
};

export const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const isMaintenanceVisitType = (visitTypeId?: string) => {
  const id = asString(visitTypeId);
  return Boolean(id) && MAINTENANCE_VISIT_TYPE_IDS.includes(id);
};

export const asNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const isMonthId = (value?: string) =>
  Boolean(value && /^\d{4}-\d{2}$/.test(value.trim()));

export const currentMonthId = () => getTodayInMadrid().slice(0, 7);

export const shiftMonthId = (monthId: string, offset: number) => {
  const [year, month] = monthId.split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const listVisibleMonthIds = () => {
  const current = currentMonthId();
  const ids = [current];
  for (let offset = 1; offset <= VISIBLE_PAST_MONTHS; offset += 1) {
    ids.push(shiftMonthId(current, -offset));
  }
  return ids;
};

export const datesInMonth = (monthId: string) => {
  const [year, month] = monthId.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates: string[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    dates.push(`${monthId}-${String(day).padStart(2, '0')}`);
  }
  return dates;
};

export const deriveMonthStatus = (
  monthId: string,
  storedStatus?: string,
): BillingMonthStatus => {
  if (asString(storedStatus).toUpperCase() === 'CLOSED') {
    return 'CLOSED';
  }
  return monthId >= currentMonthId() ? 'CURRENT' : 'PENDING_TO_CLOSE';
};

export const isBillingStatus = (
  value: unknown,
): value is MaintenanceBillingStatus =>
  BILLING_STATUSES.includes(String(value) as MaintenanceBillingStatus);

export const nextBillingStatus = (current: MaintenanceBillingStatus) => {
  const index = BILLING_STATUSES.indexOf(current);
  if (index < 0 || index >= BILLING_STATUSES.length - 1) {
    return null;
  }
  return BILLING_STATUSES[index + 1];
};

export const isApprovedOrAbove = (status: string) =>
  status === 'APPROVED' || status === 'BILLED' || status === 'PAID';

export const getMonthRecord = async (tableName: string, monthId: string) => {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { id: monthId },
    }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? undefined;
};

export const asOverrides = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, LineOverride>;
  }
  return value as Record<string, LineOverride>;
};

export const asManualLines = (value: unknown): ManualBillingLine[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): ManualBillingLine | null => {
      const item = (entry ?? {}) as Record<string, unknown>;
      const id = asString(item.id);
      const date = asString(item.date).slice(0, 10);
      const price = asNumber(item.price);
      if (!id || !date || price === null) {
        return null;
      }
      return {
        id,
        date,
        propertyId: asString(item.propertyId),
        property: asString(item.property) || asString(item.propertyId),
        providerId: asString(item.providerId),
        providerName: asString(item.providerName) || asString(item.providerId),
        hours: 0,
        hoursDisabled: true,
        price,
        billingStatus: isBillingStatus(item.billingStatus)
          ? item.billingStatus
          : 'WAITING_APPROVAL',
      };
    })
    .filter((entry): entry is ManualBillingLine => entry !== null);
};

const uniqueIds = (values: string[]) =>
  [...new Set(values.map((value) => asString(value)).filter(Boolean))];

export const newMergedGroupId = () =>
  `MBG-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const asMergedGroups = (value: unknown): MergedBillingGroup[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry): MergedBillingGroup | null => {
      const item = (entry ?? {}) as Record<string, unknown>;
      const id = asString(item.id);
      const date = asString(item.date).slice(0, 10);
      const propertyId = asString(item.propertyId);
      const visitIds = uniqueIds(
        Array.isArray(item.visitIds) ? (item.visitIds as unknown[]).map(asString) : [],
      );
      const manualLineIds = uniqueIds(
        Array.isArray(item.manualLineIds)
          ? (item.manualLineIds as unknown[]).map(asString)
          : [],
      );
      if (!id || !date || !propertyId || visitIds.length + manualLineIds.length < 1) {
        return null;
      }
      return {
        id,
        title: asString(item.title) || asString(item.property) || propertyId,
        date,
        propertyId,
        property: asString(item.property) || propertyId,
        visitTypeId: asString(item.visitTypeId),
        visitTypeName: asString(item.visitTypeName),
        providerId: asString(item.providerId),
        providerName: asString(item.providerName) || asString(item.providerId),
        hours: asNumber(item.hours),
        hoursDisabled: Boolean(item.hoursDisabled),
        price: asNumber(item.price),
        billingStatus: isBillingStatus(item.billingStatus)
          ? item.billingStatus
          : 'TO_ESTIMATE',
        visitIds,
        manualLineIds,
      };
    })
    .filter((entry): entry is MergedBillingGroup => entry !== null);
};

export const asVisitTypeHours = (value: unknown): VisitTypeHours[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      const visitTypeId = asString(item.visitTypeId);
      const hours = asNumber(item.hours);
      if (!visitTypeId || hours === null || hours < 0) {
        return null;
      }
      return {
        visitTypeId,
        visitTypeName: asString(item.visitTypeName) || visitTypeId,
        hours,
      } satisfies VisitTypeHours;
    })
    .filter((entry): entry is VisitTypeHours => Boolean(entry));
};

const queryVisitsForDate = async (visitsTable: string, scheduledDate: string) => {
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
      asString(visit.visitTypeId) || asString(visit.visit_type_id);
    return isMaintenanceVisitType(visitTypeId);
  });
};

export const loadMaintenanceVisitsForMonth = async (
  visitsTable: string,
  monthId: string,
) => {
  const perDay = await Promise.all(
    datesInMonth(monthId).map((date) => queryVisitsForDate(visitsTable, date)),
  );
  return perDay.flat().filter((visit) => {
    return asString(visit.status).toUpperCase() !== 'CANCELLED';
  });
};

const propertyLabel = (item: Record<string, unknown>, fallback: string) =>
  asString(item.ListingNickname) ||
  asString(item.listingNickname) ||
  asString(item.nickname) ||
  asString(item.Nickname) ||
  asString(item.title) ||
  fallback;

export const loadPropertyLabels = async (propertiesTable: string) => {
  if (!propertiesTable) {
    return new Map<string, string>();
  }
  const items = await scanAllItems(propertiesTable);
  return new Map(
    items.map((item) => {
      const id = asString(item.id);
      return [id, propertyLabel(item, id)] as const;
    }),
  );
};

export const getSettingsRecord = async (tableName: string) => {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { id: SETTINGS_ID },
    }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? undefined;
};

export const normalizeSettings = (
  stored: Record<string, unknown> | undefined,
  fallback?: Partial<MaintenanceSettings>,
): MaintenanceSettings => ({
  id: SETTINGS_ID,
  monthlyHoursPool:
    asNumber(stored?.monthlyHoursPool) ??
    fallback?.monthlyHoursPool ??
    DEFAULT_HOURS_POOL,
  hourlyCost:
    asNumber(stored?.hourlyCost) ?? fallback?.hourlyCost ?? DEFAULT_HOURLY_COST,
  defaultProviderId:
    asString(stored?.defaultProviderId) || fallback?.defaultProviderId || '',
  defaultProviderName:
    asString(stored?.defaultProviderName) ||
    fallback?.defaultProviderName ||
    DEFAULT_PROVIDER_NAME,
  visitTypeHours:
    asVisitTypeHours(stored?.visitTypeHours).length > 0
      ? asVisitTypeHours(stored?.visitTypeHours)
      : (fallback?.visitTypeHours ?? []),
});

export const ensureDefaultProvider = async (providersTable: string) => {
  const providers = await scanAllItems(providersTable);
  const existing = providers.find(
    (item) =>
      asString(item.name).toLowerCase() === DEFAULT_PROVIDER_NAME.toLowerCase(),
  );
  if (existing) {
    return {
      id: asString(existing.id),
      name: asString(existing.name) || DEFAULT_PROVIDER_NAME,
    };
  }
  const timestamp = new Date().toISOString();
  const id = await getNextSequentialId(providersTable, 'PROVIDER');
  const item = {
    id,
    name: DEFAULT_PROVIDER_NAME,
    active: true,
    jobsCount: 0,
    incidentsCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await putItem(providersTable, item);
  return { id, name: DEFAULT_PROVIDER_NAME };
};

export const matchVisitTypeHours = (visitTypes: Record<string, unknown>[]) => {
  const mappings: VisitTypeHours[] = [];
  for (const seed of DEFAULT_VISIT_TYPE_HOURS) {
    const target = seed.name.toLowerCase();
    const match = visitTypes.find(
      (item) =>
        asString(item.id) === seed.id ||
        asString(item.name).toLowerCase() === target,
    );
    if (match) {
      mappings.push({
        visitTypeId: asString(match.id),
        visitTypeName: asString(match.name) || seed.name,
        hours: seed.hours,
      });
    }
  }
  return mappings;
};

export const ensureSettings = async (params: {
  settingsTable: string;
  providersTable: string;
  visitTypesTable: string;
}) => {
  const stored = await getSettingsRecord(params.settingsTable);
  if (stored) {
    return normalizeSettings(stored);
  }
  const [provider, visitTypes] = await Promise.all([
    ensureDefaultProvider(params.providersTable),
    scanAllItems(params.visitTypesTable),
  ]);
  const timestamp = new Date().toISOString();
  const settings: MaintenanceSettings & Record<string, unknown> = {
    id: SETTINGS_ID,
    monthlyHoursPool: DEFAULT_HOURS_POOL,
    hourlyCost: DEFAULT_HOURLY_COST,
    defaultProviderId: provider.id,
    defaultProviderName: provider.name,
    visitTypeHours: matchVisitTypeHours(visitTypes),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await putItem(params.settingsTable, settings);
  return normalizeSettings(settings);
};

const resolveVisitLine = (
  visit: Record<string, unknown>,
  settings: MaintenanceSettings,
  override: LineOverride,
  propertyById: Map<string, string>,
  visitTypeById: Map<string, string>,
): MaintenanceBillingLine => {
  const visitId = asString(visit.id);
  const propertyId = asString(visit.propertyId);
  const visitTypeId = asString(visit.visitTypeId);
  const mapping = settings.visitTypeHours.find(
    (entry) => entry.visitTypeId === visitTypeId,
  );
  const hoursDisabled = Boolean(override.hoursDisabled);
  const mappedHours = mapping ? mapping.hours : null;
  const hours = hoursDisabled
    ? 0
    : override.hours === undefined
      ? mappedHours
      : override.hours;
  const computedPrice =
    hours !== null && hours > 0 ? roundMoney(hours * settings.hourlyCost) : null;
  const price = hoursDisabled
    ? asNumber(override.price)
    : (asNumber(override.price) ?? computedPrice);
  const providerId =
    asString(override.providerId) || settings.defaultProviderId;
  const providerName =
    asString(override.providerName) ||
    settings.defaultProviderName ||
    providerId;
  return {
    id: visitId,
    source: 'visit',
    visitId,
    visitTypeId,
    visitTypeName:
      visitTypeById.get(visitTypeId) ||
      mapping?.visitTypeName ||
      asString(visit.visitTypeName) ||
      visitTypeId,
    propertyId,
    property:
      propertyById.get(propertyId) ||
      asString(visit.Property) ||
      asString(visit.property) ||
      propertyId,
    title:
      asString(visit.title) ||
      asString(visit.Title) ||
      propertyById.get(propertyId) ||
      asString(visit.Property) ||
      asString(visit.property) ||
      visitId,
    date: asString(visit.scheduledDate).slice(0, 10),
    status: asString(visit.status).toUpperCase(),
    providerId,
    providerName,
    hours,
    hoursDisabled,
    price,
    billingStatus: isBillingStatus(override.billingStatus)
      ? override.billingStatus
      : 'TO_ESTIMATE',
    isManual: false,
  };
};

const toBillingMember = (
  line: MaintenanceBillingLine,
): MaintenanceBillingMember => ({
  id: line.id,
  source: line.source === 'manual' ? 'manual' : 'visit',
  visitId: line.visitId,
  title: line.title,
  date: line.date,
  status: line.status,
  propertyId: line.propertyId,
  visitTypeName: line.visitTypeName,
  billingStatus: line.billingStatus,
});

const resolveGroupLine = (
  group: MergedBillingGroup,
  members: MaintenanceBillingLine[],
  settings: MaintenanceSettings,
): MaintenanceBillingLine => {
  const hoursDisabled = Boolean(group.hoursDisabled);
  const hours = hoursDisabled
    ? 0
    : group.hours === undefined
      ? null
      : group.hours;
  const computedPrice =
    hours !== null && hours > 0 ? roundMoney(hours * settings.hourlyCost) : null;
  const price = hoursDisabled
    ? asNumber(group.price)
    : (asNumber(group.price) ?? computedPrice);
  const providerId = asString(group.providerId) || settings.defaultProviderId;
  const providerName =
    asString(group.providerName) ||
    settings.defaultProviderName ||
    providerId;
  return {
    id: group.id,
    source: 'group',
    visitId: '',
    title: asString(group.title) || group.property || group.propertyId,
    visitTypeId: asString(group.visitTypeId),
    visitTypeName: asString(group.visitTypeName) || asString(group.visitTypeId),
    propertyId: group.propertyId,
    property: group.property || group.propertyId,
    date: group.date,
    status: 'GROUPED',
    providerId,
    providerName,
    hours,
    hoursDisabled,
    price,
    billingStatus: isBillingStatus(group.billingStatus)
      ? group.billingStatus
      : 'TO_ESTIMATE',
    isManual: false,
    members: members
      .slice()
      .sort((a, b) => {
        if (a.date !== b.date) {
          return a.date.localeCompare(b.date);
        }
        return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      })
      .map(toBillingMember),
  };
};

export const flattenMergeSelection = (selected: MaintenanceBillingLine[]) => {
  const visitIds: string[] = [];
  const manualLineIds: string[] = [];
  const groupIds: string[] = [];
  for (const line of selected) {
    if (line.source === 'group') {
      groupIds.push(line.id);
      for (const member of line.members ?? []) {
        if (member.source === 'manual') {
          manualLineIds.push(member.id);
        } else {
          visitIds.push(member.visitId || member.id);
        }
      }
    } else if (line.source === 'manual') {
      manualLineIds.push(line.id);
    } else {
      visitIds.push(line.visitId || line.id);
    }
  }
  return {
    visitIds: uniqueIds(visitIds),
    manualLineIds: uniqueIds(manualLineIds),
    groupIds: uniqueIds(groupIds),
  };
};

const summarizeLines = (lines: MaintenanceBillingLine[]) => {
  const approved = lines.filter((line) => isApprovedOrAbove(line.billingStatus));
  const total = approved.reduce((sum, line) => sum + (line.price ?? 0), 0);
  const validatedHours = approved.reduce(
    (sum, line) => sum + (line.hours ?? 0),
    0,
  );
  const missingPrice = lines.filter((line) => line.price === null).length;
  return {
    lineCount: lines.length,
    completedCount: approved.length,
    warningCount: missingPrice,
    total: roundMoney(total),
    validatedHours,
  };
};

export const buildMonthDetail = async (params: {
  monthId: string;
  billingTable: string;
  visitsTable: string;
  settingsTable: string;
  providersTable: string;
  visitTypesTable: string;
  propertiesTable: string;
  persistSummary?: boolean;
}) => {
  const stored = await getMonthRecord(params.billingTable, params.monthId);
  const status = deriveMonthStatus(params.monthId, asString(stored?.status));

  if (status === 'CLOSED' && Array.isArray(stored?.snapshotLines)) {
    const lines = stored.snapshotLines as MaintenanceBillingLine[];
    const summary = summarizeLines(lines);
    return {
      month: {
        id: params.monthId,
        status,
        closedAt: asString(stored?.closedAt) || undefined,
        canClose: false,
        canReopen: true,
        canEdit: false,
        ...summary,
      },
      lines,
      stored,
      settings: normalizeSettings(undefined),
    };
  }

  const [visits, settings, propertyById, visitTypes] = await Promise.all([
    loadMaintenanceVisitsForMonth(params.visitsTable, params.monthId),
    ensureSettings({
      settingsTable: params.settingsTable,
      providersTable: params.providersTable,
      visitTypesTable: params.visitTypesTable,
    }),
    loadPropertyLabels(params.propertiesTable),
    scanAllItems(params.visitTypesTable),
  ]);
  const visitTypeById = new Map(
    visitTypes.map((item) => [asString(item.id), asString(item.name) || asString(item.id)]),
  );
  const overrides = asOverrides(stored?.overrides);
  const visitLines = visits.map((visit) =>
    resolveVisitLine(
      visit,
      settings,
      overrides[asString(visit.id)] ?? {},
      propertyById,
      visitTypeById,
    ),
  );
  const manualLines: MaintenanceBillingLine[] = asManualLines(
    stored?.manualLines,
  ).map((item) => ({
    id: item.id,
    source: 'manual' as const,
    visitId: '',
    title: item.property || item.propertyId,
    visitTypeId: '',
    visitTypeName: '',
    propertyId: item.propertyId,
    property: item.property || item.propertyId,
    date: item.date,
    status: 'COMPLETED',
    providerId: item.providerId,
    providerName: item.providerName,
    hours: 0,
    hoursDisabled: true,
    price: item.price,
    billingStatus: item.billingStatus,
    isManual: true,
  }));
  const mergedGroups = asMergedGroups(stored?.mergedGroups);
  const groupedVisitIds = new Set(mergedGroups.flatMap((group) => group.visitIds));
  const groupedManualIds = new Set(
    mergedGroups.flatMap((group) => group.manualLineIds),
  );
  const visitById = new Map(visitLines.map((line) => [line.visitId, line]));
  const manualById = new Map(manualLines.map((line) => [line.id, line]));
  const groupLines = mergedGroups.map((group) => {
    const members = [
      ...group.visitIds
        .map((id) => visitById.get(id))
        .filter((line): line is MaintenanceBillingLine => Boolean(line)),
      ...group.manualLineIds
        .map((id) => manualById.get(id))
        .filter((line): line is MaintenanceBillingLine => Boolean(line)),
    ];
    return resolveGroupLine(group, members, settings);
  });

  const lines = [
    ...visitLines.filter((line) => !groupedVisitIds.has(line.visitId)),
    ...manualLines.filter((line) => !groupedManualIds.has(line.id)),
    ...groupLines,
  ].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.property.localeCompare(b.property, undefined, {
      sensitivity: 'base',
    });
  });
  const summary = summarizeLines(lines);
  const canClose =
    status === 'PENDING_TO_CLOSE' &&
    lines.length > 0 &&
    lines.every((line) => isApprovedOrAbove(line.billingStatus));
  const month = {
    id: params.monthId,
    status,
    closedAt: undefined as string | undefined,
    canClose,
    canReopen: false,
    canEdit: status !== 'CLOSED',
    ...summary,
  };

  if (params.persistSummary) {
    const timestamp = new Date().toISOString();
    const next: Record<string, unknown> = {
      ...(stored ?? {}),
      id: params.monthId,
      overrides: asOverrides(stored?.overrides),
      manualLines: asManualLines(stored?.manualLines),
      mergedGroups: asMergedGroups(stored?.mergedGroups),
      summary,
      createdAt: asString(stored?.createdAt) || timestamp,
      updatedAt: timestamp,
    };
    if (asString(stored?.status).toUpperCase() === 'CLOSED') {
      next.status = 'CLOSED';
    }
    Object.keys(next).forEach((key) => {
      if (next[key] === undefined) {
        delete next[key];
      }
    });
    await putItem(params.billingTable, next);
  }

  return { month, lines, stored, settings };
};
