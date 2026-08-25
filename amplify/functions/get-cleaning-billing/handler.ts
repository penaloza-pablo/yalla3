import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import {
  buildMonthDetail,
  deriveMonthStatus,
  isMonthId,
  listVisibleMonthIds,
} from '../shared/cleaning-billing';

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

  const billingTable = process.env.TABLE_NAME;
  const visitsTable = process.env.VISITS_TABLE;
  const plansTable = process.env.CLEANING_PLANS_TABLE;
  const detailsTable = process.env.PROPERTY_CLEANING_DETAILS_TABLE;
  if (!billingTable || !visitsTable || !plansTable) {
    return buildHttpResponse(500, {
      message: 'Cleaning billing tables are not configured.',
    });
  }

  const monthId = event.queryStringParameters?.month?.trim();

  try {
    if (monthId) {
      if (!isMonthId(monthId)) {
        return buildHttpResponse(400, { message: 'month must be YYYY-MM.' });
      }
      const detail = await buildMonthDetail({
        monthId,
        billingTable,
        visitsTable,
        plansTable,
        detailsTable: detailsTable || '',
        persistSummary: true,
      });
      return buildHttpResponse(200, {
        month: detail.month,
        lines: detail.lines,
        count: detail.lines.length,
      });
    }

    const months = [];
    for (const id of listVisibleMonthIds()) {
      const detail = await buildMonthDetail({
        monthId: id,
        billingTable,
        visitsTable,
        plansTable,
        detailsTable: detailsTable || '',
        persistSummary: true,
      });
      months.push({
        ...detail.month,
        status: deriveMonthStatus(id, detail.month.status),
      });
    }
    return buildHttpResponse(200, {
      months,
      count: months.length,
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read cleaning billing.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
