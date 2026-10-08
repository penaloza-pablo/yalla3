import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { docClient } from '../shared/visit-task-utils';
import {
  YALLA_SERVICES,
  mapServiceHealth,
  publicServiceCatalog,
} from '../shared/yalla-services';

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | string[] | undefined>;
}) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }
  if (isHttp && event.requestContext?.http?.method !== 'GET') {
    return buildHttpResponse(405, { message: 'Method not allowed.' });
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
    const stored = new Map<string, Record<string, unknown>>();
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const page = await docClient.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      for (const item of page.Items ?? []) {
        const id = typeof item.serviceId === 'string' ? item.serviceId : '';
        if (id) {
          stored.set(id, item);
        }
      }
      exclusiveStartKey = page.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (exclusiveStartKey);

    const items = YALLA_SERVICES.map((service) =>
      mapServiceHealth(service, stored.get(service.id)),
    );
    return buildHttpResponse(200, {
      catalog: publicServiceCatalog(),
      items,
      schedule: ['08:00', '14:00', '20:00'],
      timezone: 'Europe/Madrid',
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to load Yalla Services.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
