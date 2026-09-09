import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { scanAllItems } from '../shared/cleaning-plan';
import { isBillingItemRecord, isScheduleRecord } from '../shared/finance-services';
import { materializeCurrentMonth } from '../shared/finance-services-store';

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
    await materializeCurrentMonth(tableName);
    const records = await scanAllItems(tableName);
    const schedules = records
      .filter(isScheduleRecord)
      .sort((a, b) => {
        const titleA = typeof a.title === 'string' ? a.title : '';
        const titleB = typeof b.title === 'string' ? b.title : '';
        if (titleA !== titleB) {
          return titleA.localeCompare(titleB);
        }
        return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''));
      });
    const billingItems = records
      .filter(isBillingItemRecord)
      .sort((a, b) => {
        const dateA = String(a.billingDate ?? '');
        const dateB = String(b.billingDate ?? '');
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB);
        }
        return String(a.title ?? '').localeCompare(String(b.title ?? ''));
      });
    return buildHttpResponse(200, {
      schedules,
      billingItems,
      items: schedules,
      count: schedules.length,
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read finance services.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
