import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import {
  buildMonthDetail,
  currentMonthId,
  deriveMonthStatus,
  isMonthId,
  listVisibleMonthIds,
} from '../shared/maintenance-billing';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
};

const billingContext = () => {
  const billingTable = process.env.TABLE_NAME;
  const visitsTable = process.env.VISITS_TABLE;
  const settingsTable = process.env.SETTINGS_TABLE;
  const providersTable = process.env.PROVIDERS_TABLE;
  const visitTypesTable = process.env.VISIT_TYPES_TABLE;
  const propertiesTable = process.env.PROPERTIES_TABLE;
  if (
    !billingTable ||
    !visitsTable ||
    !settingsTable ||
    !providersTable ||
    !visitTypesTable ||
    !propertiesTable
  ) {
    return null;
  }
  return {
    billingTable,
    visitsTable,
    settingsTable,
    providersTable,
    visitTypesTable,
    propertiesTable,
  };
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

  const context = billingContext();
  if (!context) {
    return buildHttpResponse(500, {
      message: 'Maintenance billing tables are not configured.',
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
        persistSummary: true,
        ...context,
      });
      return buildHttpResponse(200, {
        month: detail.month,
        lines: detail.lines,
        settings: detail.settings,
        count: detail.lines.length,
      });
    }

    const months = [];
    let remainingHours = 0;
    let hoursPool = 0;
    let validatedHours = 0;
    for (const id of listVisibleMonthIds()) {
      const detail = await buildMonthDetail({
        monthId: id,
        persistSummary: true,
        ...context,
      });
      months.push({
        ...detail.month,
        status: deriveMonthStatus(id, detail.month.status),
      });
      if (id === currentMonthId()) {
        hoursPool = detail.settings.monthlyHoursPool;
        validatedHours = detail.month.validatedHours;
        remainingHours = hoursPool - validatedHours;
      }
    }
    return buildHttpResponse(200, {
      months,
      count: months.length,
      hoursPool,
      validatedHours,
      remainingHours,
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read maintenance billing.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
