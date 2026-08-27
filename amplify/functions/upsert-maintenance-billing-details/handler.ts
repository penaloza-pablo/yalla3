import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import {
  SETTINGS_ID,
  asNumber,
  asString,
  asVisitTypeHours,
  ensureSettings,
} from '../shared/maintenance-billing';
import { putItem } from '../shared/visit-task-utils';

type Payload = {
  monthlyHoursPool?: number;
  hourlyCost?: number;
  defaultProviderId?: string;
  defaultProviderName?: string;
  visitTypeHours?: unknown;
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

  const settingsTable = process.env.TABLE_NAME;
  const providersTable = process.env.PROVIDERS_TABLE;
  const visitTypesTable = process.env.VISIT_TYPES_TABLE;
  if (!settingsTable || !providersTable || !visitTypesTable) {
    return buildHttpResponse(500, {
      message: 'Maintenance billing details tables are not configured.',
    });
  }

  const payload = parseBody<Payload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }

  try {
    const current = await ensureSettings({
      settingsTable,
      providersTable,
      visitTypesTable,
    });
    const monthlyHoursPool =
      asNumber(payload.monthlyHoursPool) ?? current.monthlyHoursPool;
    const hourlyCost = asNumber(payload.hourlyCost) ?? current.hourlyCost;
    if (monthlyHoursPool === null || monthlyHoursPool < 0) {
      return buildHttpResponse(400, {
        message: 'monthlyHoursPool must be a positive number.',
      });
    }
    if (hourlyCost === null || hourlyCost < 0) {
      return buildHttpResponse(400, {
        message: 'hourlyCost must be a positive number.',
      });
    }
    const timestamp = nowIso();
    const item = {
      ...current,
      id: SETTINGS_ID,
      monthlyHoursPool,
      hourlyCost,
      defaultProviderId:
        asString(payload.defaultProviderId) || current.defaultProviderId,
      defaultProviderName:
        asString(payload.defaultProviderName) || current.defaultProviderName,
      visitTypeHours:
        payload.visitTypeHours === undefined
          ? current.visitTypeHours
          : asVisitTypeHours(payload.visitTypeHours),
      updatedAt: timestamp,
    };
    await putItem(settingsTable, item);
    await recordActivityLog(event, {
      feature: LOG_FEATURES.MAINTENANCE_SETTINGS,
      action: 'update',
      entityId: SETTINGS_ID,
      entityName: 'Billing details',
      summary: `updated maintenance billing details ${quoted(SETTINGS_ID)}`,
    });
    return buildHttpResponse(200, { item });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save maintenance billing details.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
