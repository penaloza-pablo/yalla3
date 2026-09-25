import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { isDashboardLayoutId } from './dashboard-layout';
import {
  DEFAULT_NAV_MODE,
  parseNavMode,
  type NavMode,
} from './nav-mode';
import {
  ADMIN_ROLE_ID,
  ROLE_SEEDS,
  PERMISSIONS_CATALOG_VERSION,
  allPermissionKeys,
  applyPermissionCatalog,
  isKnownRoleId,
  withAdminLockedPages,
  withDefaultActOnOthers,
  withDefaultCleaningPlanOverride,
} from './rbac-catalog';
import {
  DEFAULT_TODAY_VIEWS,
  resolveTodayViews,
  type TodayViewMode,
} from './today-views';
import { nowIso } from './dynamo-http';
import { docClient, putItem } from './visit-task-utils';

export const rolePk = (id: string) => `ROLE#${id}`;
export const userPk = (email: string) => `USER#${normalizeEmail(email)}`;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export type RoleRecord = {
  id: string;
  name: string;
  permissions: string[];
  dashboardLayoutId?: string;
  navMode: NavMode;
  todayViews: TodayViewMode[];
};

const chromeOf = (item?: {
  navMode?: unknown;
  todayViews?: unknown;
}) => ({
  navMode: parseNavMode(item?.navMode),
  todayViews: resolveTodayViews(item?.todayViews),
});

const roleFromSeed = (seed: (typeof ROLE_SEEDS)[number]): RoleRecord => ({
  id: seed.id,
  name: seed.name,
  permissions:
    seed.id === ADMIN_ROLE_ID ? allPermissionKeys() : seed.permissions,
  navMode: DEFAULT_NAV_MODE,
  todayViews: [...DEFAULT_TODAY_VIEWS],
});

export type UserRoleRecord = {
  email: string;
  roleId: string;
  name: string;
};

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

export const scanByType = async (
  tableName: string,
  type: 'ROLE' | 'USER',
): Promise<Record<string, unknown>[]> => {
  const items: Record<string, unknown>[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: '#type = :type',
        ExpressionAttributeNames: { '#type': 'type' },
        ExpressionAttributeValues: { ':type': type },
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

export const getItemByPk = async (
  tableName: string,
  pk: string,
): Promise<Record<string, unknown> | null> => {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { pk },
    }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? null;
};

export const ensureRolesSeeded = async (tableName: string) => {
  for (const seed of ROLE_SEEDS) {
    const existing = await getItemByPk(tableName, rolePk(seed.id));
    if (existing) {
      continue;
    }
    await putItem(tableName, {
      pk: rolePk(seed.id),
      type: 'ROLE',
      id: seed.id,
      name: seed.name,
      permissions:
        seed.id === ADMIN_ROLE_ID ? allPermissionKeys() : seed.permissions,
      updatedAt: nowIso(),
    });
  }
};

export const toRoleRecord = (item: Record<string, unknown>): RoleRecord => {
  const id = typeof item.id === 'string' ? item.id : '';
  const permissions = withAdminLockedPages(
    id,
    withDefaultCleaningPlanOverride(
      id,
      withDefaultActOnOthers(
        id,
        applyPermissionCatalog(
          asStringArray(item.permissions),
          item.permissionsCatalogVersion,
        ),
        item.permissionsCatalogVersion,
      ),
      item.permissionsCatalogVersion,
    ),
  );
  return {
    id,
    name: typeof item.name === 'string' ? item.name : id,
    permissions,
    dashboardLayoutId: isDashboardLayoutId(item.dashboardLayoutId)
      ? item.dashboardLayoutId
      : undefined,
    ...chromeOf({ navMode: item.navMode, todayViews: item.todayViews }),
  };
};

export const listRoles = async (tableName: string): Promise<RoleRecord[]> => {
  await ensureRolesSeeded(tableName);
  const items = await scanByType(tableName, 'ROLE');
  const byId = new Map(items.map((item) => [String(item.id ?? ''), item]));
  return ROLE_SEEDS.map((seed) => {
    const stored = byId.get(seed.id);
    return stored ? toRoleRecord(stored) : roleFromSeed(seed);
  });
};

export const listUserAssignments = async (
  tableName: string,
): Promise<UserRoleRecord[]> => {
  const items = await scanByType(tableName, 'USER');
  return items
    .map((item) => ({
      email: typeof item.email === 'string' ? normalizeEmail(item.email) : '',
      roleId: typeof item.roleId === 'string' ? item.roleId : '',
      name: typeof item.name === 'string' ? item.name.trim() : '',
    }))
    .filter(
      (entry) =>
        entry.email && (isKnownRoleId(entry.roleId) || entry.name.length > 0),
    );
};

export const hasAdminAssignment = async (tableName: string) => {
  const assignments = await listUserAssignments(tableName);
  return assignments.some((entry) => entry.roleId === ADMIN_ROLE_ID);
};

export const resolvePermissions = async (
  tableName: string,
  email: string,
): Promise<{
      roleId: string | null;
      roleName: string | null;
      permissions: string[];
      bootstrap: boolean;
      dashboardLayoutId?: string;
      navMode: NavMode;
      todayViews: TodayViewMode[];
    }> => {
  await ensureRolesSeeded(tableName);
  const normalized = normalizeEmail(email);
  const assignment = await getItemByPk(tableName, userPk(normalized));
  const assignedRoleId =
    typeof assignment?.roleId === 'string' ? assignment.roleId : '';

  if (assignedRoleId && isKnownRoleId(assignedRoleId)) {
    const role = await getItemByPk(tableName, rolePk(assignedRoleId));
    const seed = ROLE_SEEDS.find((entry) => entry.id === assignedRoleId);
    const record: RoleRecord | undefined = role
      ? toRoleRecord(role)
      : seed
        ? roleFromSeed(seed)
        : undefined;
    return {
      roleId: assignedRoleId,
      roleName: record?.name ?? assignedRoleId,
      permissions: record?.permissions ?? [],
      bootstrap: false,
      dashboardLayoutId: record?.dashboardLayoutId,
      navMode: record?.navMode ?? DEFAULT_NAV_MODE,
      todayViews: record?.todayViews ?? [...DEFAULT_TODAY_VIEWS],
    };
  }

  if (!(await hasAdminAssignment(tableName))) {
    const admin = ROLE_SEEDS[0];
    return {
      roleId: ADMIN_ROLE_ID,
      roleName: admin.name,
      permissions: allPermissionKeys(),
      bootstrap: true,
      navMode: DEFAULT_NAV_MODE,
      todayViews: [...DEFAULT_TODAY_VIEWS],
    };
  }

  return {
    roleId: null,
    roleName: null,
    permissions: [],
    bootstrap: false,
    navMode: DEFAULT_NAV_MODE,
    todayViews: [...DEFAULT_TODAY_VIEWS],
  };
};
