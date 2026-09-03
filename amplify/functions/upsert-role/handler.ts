import {
  ADMIN_ROLE_ID,
  allPermissionKeys,
  isKnownPermission,
  isKnownRoleId,
} from '../shared/rbac-catalog';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { getItemByPk, rolePk, toRoleRecord } from '../shared/rbac-store';
import { putItem } from '../shared/visit-task-utils';

type Payload = {
  id?: string;
  name?: string;
  permissions?: unknown;
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
}) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) return denied;
  }

  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const payload = parseBody<Payload>(event.body);
  const roleId = payload?.id?.trim() ?? '';
  if (!isKnownRoleId(roleId)) {
    return buildHttpResponse(400, { message: 'Unknown role.' });
  }

  const existing = await getItemByPk(tableName, rolePk(roleId));
  if (!existing) {
    return buildHttpResponse(404, { message: 'Role not found.' });
  }

  const hasNameInPayload = typeof payload?.name === 'string';
  const nextName = hasNameInPayload
    ? payload?.name?.trim() ?? ''
    : typeof existing.name === 'string'
      ? existing.name.trim()
      : roleId;
  if (!nextName) {
    return buildHttpResponse(400, { message: 'name is required.' });
  }

  const permissions =
    roleId === ADMIN_ROLE_ID
      ? allPermissionKeys()
      : Array.isArray(payload?.permissions)
        ? payload.permissions.filter(
            (entry): entry is string =>
              typeof entry === 'string' && isKnownPermission(entry),
          )
        : Array.isArray(existing.permissions)
          ? existing.permissions.filter(
              (entry): entry is string =>
                typeof entry === 'string' && isKnownPermission(entry),
            )
          : [];

  const item = {
    ...existing,
    pk: rolePk(roleId),
    type: 'ROLE',
    id: roleId,
    name: nextName,
    permissions,
    updatedAt: nowIso(),
  };

  try {
    await putItem(tableName, item);
    return buildHttpResponse(200, { item: toRoleRecord(item) });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save role.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
