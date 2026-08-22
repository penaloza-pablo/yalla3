import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { scanAllItems } from '../shared/cleaning-plan';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
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

  const includeInactive = event.queryStringParameters?.includeInactive === 'true';

  try {
    const allItems = await scanAllItems(tableName);
    const items = allItems
      .filter((entry) => includeInactive || entry.active !== false)
      .sort((a, b) => {
        const nameA = typeof a.name === 'string' ? a.name : '';
        const nameB = typeof b.name === 'string' ? b.name : '';
        return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
      });
    return buildHttpResponse(200, { items, count: items.length });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read cleaners.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
