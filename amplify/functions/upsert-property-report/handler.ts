import { GetCommand } from '@aws-sdk/lib-dynamodb';
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
import { docClient, putItem } from '../shared/visit-task-utils';
import { resolveYallaPropertyLabelFromRecord } from '../shared/property-identity';
import {
  asString,
  deriveReportStatus,
  emptyReportRecord,
  getPropertyById,
  isMonthIdValue,
  isPhase1Month,
  isPhase1Property,
  type PropertyReportStatus,
} from '../shared/property-reports';

type Payload = {
  propertyId?: string;
  monthId?: string;
  action?: string;
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
  const propertiesTable = process.env.PROPERTIES_TABLE;
  if (!tableName || !propertiesTable) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const payload = parseBody<Payload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }

  const propertyId = payload.propertyId?.trim() ?? '';
  const monthId = payload.monthId?.trim() ?? '';
  const action = asString(payload.action).toLowerCase();
  if (!propertyId || !isMonthIdValue(monthId) || !isPhase1Month(monthId)) {
    return buildHttpResponse(400, {
      message: 'propertyId and a phase-1 monthId are required.',
    });
  }

  const property = await getPropertyById(propertiesTable, propertyId);
  if (!property || !isPhase1Property(property)) {
    return buildHttpResponse(404, {
      message: 'Property is not available in this Property Reports phase.',
    });
  }

  const found = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { propertyId, monthId },
    }),
  );
  const existing = found.Item as Record<string, unknown> | undefined;
  const currentStatus = deriveReportStatus(monthId, asString(existing?.status));

  let nextStatus: PropertyReportStatus | null = null;
  if (action === 'ready') {
    if (currentStatus !== 'PENDING_TO_CLOSE') {
      return buildHttpResponse(400, {
        message: 'Only a pending month can be marked ready to close.',
      });
    }
    nextStatus = 'READY_TO_CLOSE';
  } else if (action === 'close') {
    if (currentStatus !== 'READY_TO_CLOSE') {
      return buildHttpResponse(400, {
        message: 'Only a month marked ready to close can be closed.',
      });
    }
    nextStatus = 'CLOSED';
  } else if (action === 'reopen') {
    if (currentStatus !== 'CLOSED' && currentStatus !== 'READY_TO_CLOSE') {
      return buildHttpResponse(400, {
        message: 'Only a closed or ready month can be reopened.',
      });
    }
    nextStatus = 'PENDING_TO_CLOSE';
  } else {
    return buildHttpResponse(400, {
      message: 'action must be ready, close, or reopen.',
    });
  }

  const timestamp = nowIso();
  const item: Record<string, unknown> = {
    ...(existing ?? emptyReportRecord(propertyId, monthId, nextStatus)),
    propertyId,
    monthId,
    status: nextStatus,
    updatedAt: timestamp,
  };
  if (nextStatus === 'CLOSED') {
    item.closedAt = timestamp;
  } else {
    delete item.closedAt;
  }

  try {
    await putItem(tableName, item);
    const name = `${resolveYallaPropertyLabelFromRecord(property, propertyId)} ${monthId}`;
    await recordActivityLog(event, {
      feature: LOG_FEATURES.PROPERTY_REPORTS,
      action: nextStatus === 'CLOSED' ? 'close' : action,
      entityId: `${propertyId}#${monthId}`,
      entityName: name,
      summary:
        nextStatus === 'CLOSED'
          ? `closed property report ${quoted(name)}`
          : nextStatus === 'READY_TO_CLOSE'
            ? `marked property report ready ${quoted(name)}`
            : `reopened property report ${quoted(name)}`,
    });
    return buildHttpResponse(200, { item });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to update the property report.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
