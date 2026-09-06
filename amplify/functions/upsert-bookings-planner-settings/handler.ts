import {
  LOG_FEATURES,
  recordActivityLog,
} from '../shared/activity-log';
import {
  applyPlannerWindow,
  getPlannerSettings,
  putPlannerSettings,
} from '../shared/bookings-planner-apply';
import { normalizePlannerSettings } from '../shared/bookings-planner';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';

type SettingsPayload = {
  plannerEnabled?: boolean;
  rules?: unknown;
  applyWindow?: boolean;
  syncGuesty?: boolean;
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
  const bookingsTable = process.env.BOOKINGS_TABLE || 'yalla-bookings';
  if (!tableName) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const payload = parseBody<SettingsPayload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }

  try {
    const current = await getPlannerSettings(tableName);
    const next = normalizePlannerSettings({
      ...current,
      plannerEnabled:
        payload.plannerEnabled === undefined
          ? current.plannerEnabled
          : payload.plannerEnabled === true,
      rules: payload.rules === undefined ? current.rules : payload.rules,
    });
    const item = await putPlannerSettings(tableName, next);
    const shouldApply =
      payload.applyWindow !== false && next.plannerEnabled;
    const applied = shouldApply
      ? await applyPlannerWindow({
          bookingsTable,
          settings: next,
          syncGuesty: payload.syncGuesty !== false,
        })
      : { count: 0, updated: 0, synced: 0, errors: [] as string[] };

    await recordActivityLog(event, {
      feature: LOG_FEATURES.BOOKINGS_SETTINGS,
      action: 'update',
      summary: next.plannerEnabled
        ? `enabled bookings planner and applied ${applied.updated} reservations`
        : 'disabled bookings planner',
    });

    return buildHttpResponse(200, { item, applied });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save bookings planner settings.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
