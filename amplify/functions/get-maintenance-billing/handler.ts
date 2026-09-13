import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { isHiddenBillingMonth } from '../shared/billing-months';
import {
  buildMonthDetail,
  currentMonthId,
  deriveMonthStatus,
  ensureSettings,
  isMonthId,
  listMonthSummaries,
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
      if (isHiddenBillingMonth(monthId)) {
        return buildHttpResponse(404, { message: 'Month is not available.' });
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

    const [months, settings] = await Promise.all([
      listMonthSummaries(context),
      ensureSettings({
        settingsTable: context.settingsTable,
        providersTable: context.providersTable,
        visitTypesTable: context.visitTypesTable,
      }),
    ]);
    const current = months.find((item) => item.id === currentMonthId());
    const hoursPool = settings.monthlyHoursPool;
    const validatedHours = current?.validatedHours ?? 0;
    return buildHttpResponse(200, {
      months: months.map((item) => ({
        ...item,
        status: deriveMonthStatus(item.id, item.status),
      })),
      count: months.length,
      hoursPool,
      validatedHours,
      remainingHours: hoursPool - validatedHours,
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read maintenance billing.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
