import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { scanAllItems } from '../shared/cleaning-plan';
import {
  asString,
  buildMonthDetail,
  listVisibleMonthIds,
} from '../shared/maintenance-billing';

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
  const incidentsTable = process.env.INCIDENTS_TABLE;
  const billingTable = process.env.BILLING_TABLE;
  const visitsTable = process.env.VISITS_TABLE;
  const settingsTable = process.env.SETTINGS_TABLE;
  const visitTypesTable = process.env.VISIT_TYPES_TABLE;
  const propertiesTable = process.env.PROPERTIES_TABLE;
  if (!tableName) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const includeInactive = event.queryStringParameters?.includeInactive === 'true';

  try {
    const [providers, incidents] = await Promise.all([
      scanAllItems(tableName),
      incidentsTable ? scanAllItems(incidentsTable) : Promise.resolve([]),
    ]);
    const incidentCounts = new Map<string, number>();
    for (const incident of incidents) {
      const providerId = asString(incident.providerId);
      if (!providerId || providerId === '__other__') {
        continue;
      }
      incidentCounts.set(providerId, (incidentCounts.get(providerId) ?? 0) + 1);
    }

    const jobCounts = new Map<string, number>();
    if (
      billingTable &&
      visitsTable &&
      settingsTable &&
      visitTypesTable &&
      propertiesTable
    ) {
      for (const monthId of listVisibleMonthIds()) {
        const detail = await buildMonthDetail({
          monthId,
          billingTable,
          visitsTable,
          settingsTable,
          providersTable: tableName,
          visitTypesTable,
          propertiesTable,
        });
        for (const line of detail.lines) {
          if (line.source !== 'visit' || !line.providerId) {
            continue;
          }
          jobCounts.set(
            line.providerId,
            (jobCounts.get(line.providerId) ?? 0) + 1,
          );
        }
      }
    }

    const items = providers
      .filter((entry) => includeInactive || entry.active !== false)
      .map((entry): Record<string, unknown> => {
        const id = asString(entry.id);
        return {
          ...entry,
          jobsCount: jobCounts.get(id) ?? 0,
          incidentsCount: incidentCounts.get(id) ?? 0,
        };
      })
      .sort((a, b) =>
        asString(a.name).localeCompare(asString(b.name), undefined, {
          sensitivity: 'base',
        }),
      );
    return buildHttpResponse(200, { items, count: items.length });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read maintenance providers.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
