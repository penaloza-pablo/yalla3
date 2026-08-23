import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import {
  normalizeCleaningTypes,
  scanAllItems,
} from '../shared/cleaning-plan';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
};

export const handler = async (event: HttpEvent) => {
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
    const items = (await scanAllItems(tableName))
      .map((item) => {
        const id = typeof item.id === 'string' ? item.id : '';
        const propertyId =
          typeof item.propertyId === 'string' ? item.propertyId : id;
        const nickname =
          typeof item.nickname === 'string' && item.nickname.trim()
            ? item.nickname
            : id;
        return {
          id,
          propertyId,
          nickname,
          cleaningTypes: normalizeCleaningTypes(item.cleaningTypes),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        };
      })
      .sort((a, b) =>
        a.nickname.localeCompare(b.nickname, undefined, { sensitivity: 'base' }),
      );
    return buildHttpResponse(200, { items, count: items.length });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read property cleaning details.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
