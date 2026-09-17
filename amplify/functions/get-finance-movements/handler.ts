import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { scanAllItems } from '../shared/cleaning-plan';
import { isMovementItemRecord, isMovementScheduleRecord } from '../shared/finance-services';
import { materializeCurrentMovementMonth } from '../shared/finance-movements-store';

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
    await materializeCurrentMovementMonth(tableName);
    const records = await scanAllItems(tableName);
    const schedules = records
      .filter(isMovementScheduleRecord)
      .sort((a, b) => {
        const descriptionA = typeof a.description === 'string' ? a.description : '';
        const descriptionB = typeof b.description === 'string' ? b.description : '';
        if (descriptionA !== descriptionB) {
          return descriptionA.localeCompare(descriptionB);
        }
        return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
      });
    const items = records
      .filter(isMovementItemRecord)
      .sort((a, b) => {
        const dateA = typeof a.date === 'string' ? a.date : '';
        const dateB = typeof b.date === 'string' ? b.date : '';
        if (dateA !== dateB) {
          return dateB.localeCompare(dateA);
        }
        const createdA = typeof a.createdAt === 'string' ? a.createdAt : '';
        const createdB = typeof b.createdAt === 'string' ? b.createdAt : '';
        return createdB.localeCompare(createdA);
      });
    return buildHttpResponse(200, {
      schedules,
      items,
      count: items.length,
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read finance movements.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
