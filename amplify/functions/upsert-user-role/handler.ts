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
import { normalizeEmail, userPk } from '../shared/rbac-store';
import { docClient, putItem } from '../shared/visit-task-utils';

type Payload = {
  email?: string;
  roleId?: string | null;
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
  const email = payload?.email ? normalizeEmail(payload.email) : '';
  if (!email || !email.includes('@')) {
    return buildHttpResponse(400, { message: 'email is required.' });
  }

  const roleId = payload?.roleId?.trim() ?? '';

  try {
    if (!roleId) {
      await docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { pk: userPk(email) },
        }),
      );
      return buildHttpResponse(200, { email, roleId: null });
    }

    if (!isKnownRoleId(roleId)) {
      return buildHttpResponse(400, { message: 'Unknown role.' });
    }

    await putItem(tableName, {
      pk: userPk(email),
      type: 'USER',
      email,
      roleId,
      updatedAt: nowIso(),
    });
    return buildHttpResponse(200, { email, roleId });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to assign role.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
