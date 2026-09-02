import { getActorEmail } from '../shared/cognito-auth';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { resolvePermissions } from '../shared/rbac-store';

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
  if (!tableName) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  try {
    const email = await getActorEmail(event);
    if (!email || email === 'system') {
      return buildHttpResponse(401, { message: 'Unauthorized' });
    }
    const resolved = await resolvePermissions(tableName, email);
    return buildHttpResponse(200, {
      email,
      ...resolved,
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to resolve permissions.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
