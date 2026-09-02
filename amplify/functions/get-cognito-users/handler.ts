import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { listRoles, listUserAssignments } from '../shared/rbac-store';

const client = new CognitoIdentityProviderClient({});

const attr = (user: UserType, name: string) =>
  user.Attributes?.find((entry) => entry.Name === name)?.Value?.trim() ?? '';

const displayName = (user: UserType, email: string) => {
  const name = attr(user, 'name');
  if (name) return name;
  const given = attr(user, 'given_name');
  const family = attr(user, 'family_name');
  return [given, family].filter(Boolean).join(' ') || email;
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | string[] | undefined>;
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
  const userPoolId = process.env.USER_POOL_ID;
  if (!tableName || !userPoolId) {
    return buildHttpResponse(500, {
      message: 'TABLE_NAME or USER_POOL_ID is not configured.',
    });
  }

  try {
    const [roles, assignments] = await Promise.all([
      listRoles(tableName),
      listUserAssignments(tableName),
    ]);
    const roleNameById = new Map(roles.map((role) => [role.id, role.name]));
    const roleByEmail = new Map(
      assignments.map((entry) => [entry.email, entry.roleId]),
    );

    const users: UserType[] = [];
    let paginationToken: string | undefined;
    do {
      const result = await client.send(
        new ListUsersCommand({
          UserPoolId: userPoolId,
          Limit: 60,
          PaginationToken: paginationToken,
        }),
      );
      users.push(...(result.Users ?? []));
      paginationToken = result.PaginationToken;
    } while (paginationToken);

    const items = users
      .map((user) => {
        const email = attr(user, 'email').toLowerCase();
        if (!email) {
          return null;
        }
        const roleId = roleByEmail.get(email) ?? null;
        return {
          username: user.Username ?? email,
          email,
          name: displayName(user, email),
          status: user.UserStatus ?? '',
          enabled: user.Enabled !== false,
          roleId,
          roleName: roleId ? (roleNameById.get(roleId) ?? roleId) : null,
        };
      })
      .filter((entry) => entry !== null)
      .sort((left, right) => left.email.localeCompare(right.email));

    return buildHttpResponse(200, { items, count: items.length, roles });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to list users.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
