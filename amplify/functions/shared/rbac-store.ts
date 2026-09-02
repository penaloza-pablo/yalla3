import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  ADMIN_ROLE_ID,
  ROLE_SEEDS,
  allPermissionKeys,
  isKnownRoleId,
} from './rbac-catalog';
import { nowIso } from './dynamo-http';
import { docClient, putItem } from './visit-task-utils';

export const rolePk = (id: string) => `ROLE#${id}`;
export const userPk = (email: string) => `USER#${normalizeEmail(email)}`;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export type RoleRecord = {
  id: string;
  name: string;
  permissions: string[];
};

export type UserRoleRecord = {
  email: string;
  roleId: string;
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
  const permissions =
    id === ADMIN_ROLE_ID ? allPermissionKeys() : asStringArray(item.permissions);
  return {
    id,
    name: typeof item.name === 'string' ? item.name : id,
    permissions,
  };
};

export const listRoles = async (tableName: string): Promise<RoleRecord[]> => {
  await ensureRolesSeeded(tableName);
  const items = await scanByType(tableName, 'ROLE');
  const byId = new Map(items.map((item) => [String(item.id ?? ''), item]));
  return ROLE_SEEDS.map((seed) => {
    const stored = byId.get(seed.id);
    return stored
      ? toRoleRecord(stored)
      : {
          id: seed.id,
          name: seed.name,
          permissions:
            seed.id === ADMIN_ROLE_ID ? allPermissionKeys() : seed.permissions,
        };
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
    }))
    .filter((entry) => entry.email && isKnownRoleId(entry.roleId));
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
}> => {
  await ensureRolesSeeded(tableName);
  const normalized = normalizeEmail(email);
  const assignment = await getItemByPk(tableName, userPk(normalized));
  const assignedRoleId =
    typeof assignment?.roleId === 'string' ? assignment.roleId : '';

  if (assignedRoleId && isKnownRoleId(assignedRoleId)) {
    const role = await getItemByPk(tableName, rolePk(assignedRoleId));
    const record = role
      ? toRoleRecord(role)
      : ROLE_SEEDS.find((seed) => seed.id === assignedRoleId);
    return {
      roleId: assignedRoleId,
      roleName: record?.name ?? assignedRoleId,
      permissions:
        assignedRoleId === ADMIN_ROLE_ID
          ? allPermissionKeys()
          : (record?.permissions ?? []),
      bootstrap: false,
    };
  }

  if (!(await hasAdminAssignment(tableName))) {
    const admin = ROLE_SEEDS[0];
    return {
      roleId: ADMIN_ROLE_ID,
      roleName: admin.name,
      permissions: allPermissionKeys(),
      bootstrap: true,
    };
  }

  return {
    roleId: null,
    roleName: null,
    permissions: [],
    bootstrap: false,
  };
};
