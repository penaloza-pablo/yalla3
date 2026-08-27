import { scanAllItems } from '../shared/cleaning-plan';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { ensureSettings } from '../shared/maintenance-billing';

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

  const settingsTable = process.env.TABLE_NAME;
  const providersTable = process.env.PROVIDERS_TABLE;
  const visitTypesTable = process.env.VISIT_TYPES_TABLE;
  if (!settingsTable || !providersTable || !visitTypesTable) {
    return buildHttpResponse(500, {
      message: 'Maintenance billing details tables are not configured.',
    });
  }

  try {
    const [item, visitTypes] = await Promise.all([
      ensureSettings({
        settingsTable,
        providersTable,
        visitTypesTable,
      }),
      scanAllItems(visitTypesTable),
    ]);
    return buildHttpResponse(200, {
      item,
      visitTypes: visitTypes
        .map((entry) => ({
          id: String(entry.id ?? ''),
          name: String(entry.name ?? entry.id ?? ''),
          active: entry.active !== false,
        }))
        .filter((entry) => entry.id)
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        ),
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read maintenance billing details.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
