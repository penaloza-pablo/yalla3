import {
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { isKnownRoleId } from '../shared/rbac-catalog';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import {
  getItemByPk,
  normalizeEmail,
  userPk,
} from '../shared/rbac-store';
import { docClient, putItem } from '../shared/visit-task-utils';

const cognito = new CognitoIdentityProviderClient({});

type Payload = {
  email?: string;
  username?: string;
  roleId?: string | null;
  name?: string;
};

const findUsernameByEmail = async (userPoolId: string, email: string) => {
  const result = await cognito.send(
    new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${email.replace(/"/g, '')}"`,
      Limit: 1,
    }),
  );
  return result.Users?.[0]?.Username?.trim() || '';
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
  const userPoolId = process.env.USER_POOL_ID;
  if (!tableName) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const payload = parseBody<Payload>(event.body);
  const email = payload?.email ? normalizeEmail(payload.email) : '';
  if (!email || !email.includes('@')) {
    return buildHttpResponse(400, { message: 'email is required.' });
  }

  const existing = await getItemByPk(tableName, userPk(email));
  const hasRoleInPayload = Object.prototype.hasOwnProperty.call(
    payload ?? {},
    'roleId',
  );
  const hasNameInPayload = typeof payload?.name === 'string';
  const nextName = hasNameInPayload
    ? payload?.name?.trim() ?? ''
    : typeof existing?.name === 'string'
      ? existing.name
      : '';
  let nextRoleId = hasRoleInPayload
    ? (payload?.roleId?.trim() ?? '')
    : typeof existing?.roleId === 'string'
      ? existing.roleId
      : '';

  if (nextRoleId && !isKnownRoleId(nextRoleId)) {
    return buildHttpResponse(400, { message: 'Unknown role.' });
  }

  try {
    if (hasNameInPayload && nextName && userPoolId) {
      const username =
        payload?.username?.trim() ||
        (await findUsernameByEmail(userPoolId, email));
      if (username) {
        try {
          await cognito.send(
            new AdminUpdateUserAttributesCommand({
              UserPoolId: userPoolId,
              Username: username,
              UserAttributes: [{ Name: 'name', Value: nextName }],
            }),
          );
        } catch {
          // Cognito may reject `name` if the pool schema is email-only.
          // The Dynamo display name still persists below.
        }
      }
    }

    if (!nextRoleId && !nextName) {
      await docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { pk: userPk(email) },
        }),
      );
      return buildHttpResponse(200, { email, roleId: null, name: '' });
    }

    await putItem(tableName, {
      pk: userPk(email),
      type: 'USER',
      email,
      roleId: nextRoleId,
      name: nextName,
      updatedAt: nowIso(),
    });
    return buildHttpResponse(200, {
      email,
      roleId: nextRoleId || null,
      name: nextName,
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to update user.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
