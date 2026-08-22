import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import {
  getPlanByDate,
  isDateOnly,
  normalizeStartTime,
  queryCleaningVisitsForDate,
} from '../shared/cleaning-plan';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import {
  docClient,
  patchUserOriginatedRecord,
  putItem,
} from '../shared/visit-task-utils';

const lambdaClient = new LambdaClient({});

type PlanItemInput = {
  visitId?: string;
  cleanerId?: string;
  startTime?: string;
  qualityReview?: boolean;
};

type PlanPayload = {
  plannedDate?: string;
  action?: 'save' | 'ready' | 'reopen';
  items?: PlanItemInput[];
};

type SavedPlanItem = {
  visitId: string;
  propertyId: string;
  cleanerId: string;
  startTime: string;
  qualityReview: boolean;
};

const loadCleaner = async (tableName: string | undefined, cleanerId: string) => {
  if (!tableName || !cleanerId) {
    return undefined;
  }
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { id: cleanerId },
    }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? undefined;
};

const invokeGuestyStartTimeSync = async (visitId: string) => {
  const functionName = process.env.SYNC_TASK_TO_GUESTY_FUNCTION;
  if (!functionName) {
    return { ok: false, error: 'SYNC_TASK_TO_GUESTY_FUNCTION is not configured.' };
  }

  const response = await lambdaClient.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(
        JSON.stringify({
          tableName: process.env.VISITS_TABLE || 'yalla-visits',
          id: visitId,
        }),
      ),
    }),
  );

  const payloadText = response.Payload
    ? Buffer.from(response.Payload).toString('utf8')
    : '';
  if (response.FunctionError) {
    return {
      ok: false,
      error: payloadText || response.FunctionError,
    };
  }

  return { ok: true };
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

  const plansTable = process.env.TABLE_NAME;
  const visitsTable = process.env.VISITS_TABLE;
  const cleanersTable = process.env.CLEANERS_TABLE;
  if (!plansTable || !visitsTable) {
    return buildHttpResponse(500, {
      message: 'TABLE_NAME or VISITS_TABLE is not configured.',
    });
  }

  const payload = parseBody<PlanPayload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }

  const plannedDate = payload.plannedDate?.trim();
  if (!isDateOnly(plannedDate)) {
    return buildHttpResponse(400, { message: 'plannedDate is required.' });
  }

  const action = payload.action?.trim().toLowerCase() || 'save';
  if (action !== 'save' && action !== 'ready' && action !== 'reopen') {
    return buildHttpResponse(400, { message: 'Invalid action.' });
  }

  try {
    const existing = await getPlanByDate(plansTable, plannedDate as string);
    const currentStatus =
      typeof existing?.status === 'string' ? existing.status.toUpperCase() : 'DRAFT';

    if (currentStatus === 'READY' && action === 'save') {
      return buildHttpResponse(400, {
        message: 'Ready plans cannot be edited. Reopen the plan first.',
      });
    }

    const visits = await queryCleaningVisitsForDate(
      visitsTable,
      plannedDate as string,
    );
    const visitById = new Map(
      visits
        .filter((visit) => typeof visit.id === 'string')
        .map((visit) => [visit.id as string, visit]),
    );

    const incomingItems = Array.isArray(payload.items)
      ? payload.items
      : action === 'reopen' && Array.isArray(existing?.items)
        ? (existing.items as PlanItemInput[])
        : [];
    const normalizedItems: SavedPlanItem[] = [];

    for (const draft of incomingItems) {
      const visitId = draft.visitId?.trim();
      if (!visitId) {
        continue;
      }
      const visit = visitById.get(visitId);
      if (!visit) {
        continue;
      }
      const cleanerId = draft.cleanerId?.trim() ?? '';
      if (cleanerId && action !== 'reopen') {
        const cleaner = await loadCleaner(cleanersTable, cleanerId);
        if (!cleaner || cleaner.active === false) {
          return buildHttpResponse(400, {
            message: `Cleaner ${cleanerId} is not available.`,
            visitId,
          });
        }
      }
      const startTime = normalizeStartTime(draft.startTime);
      normalizedItems.push({
        visitId,
        propertyId:
          typeof visit.propertyId === 'string' ? visit.propertyId : '',
        cleanerId,
        startTime,
        qualityReview: Boolean(draft.qualityReview),
      });
    }

    if (action === 'ready') {
      const missing = visits.filter((visit) => {
        const visitId = typeof visit.id === 'string' ? visit.id : '';
        const saved = normalizedItems.find((item) => item.visitId === visitId);
        return !saved?.cleanerId || !saved.startTime;
      });
      if (missing.length > 0) {
        return buildHttpResponse(400, {
          message:
            'Every cleaning visit needs a cleaner and a start time before the plan can be marked ready.',
          missingCount: missing.length,
        });
      }
    }

    const nextStatus =
      action === 'ready' ? 'READY' : action === 'reopen' ? 'DRAFT' : 'DRAFT';
    const timestamp = nowIso();
    const item: Record<string, unknown> = {
      id: plannedDate,
      plannedDate,
      status: nextStatus,
      items: normalizedItems,
      createdAt:
        (typeof existing?.createdAt === 'string' ? existing.createdAt : undefined) ??
        timestamp,
      updatedAt: timestamp,
    };

    if (nextStatus === 'READY') {
      item.readyAt = timestamp;
    } else if (typeof existing?.readyAt === 'string') {
      item.readyAt = existing.readyAt;
    }

    await putItem(plansTable, item);

    const syncedVisitIds: string[] = [];
    const syncErrors: { visitId: string; error: string }[] = [];

    if (action !== 'reopen') {
      for (const planItem of normalizedItems) {
        const visit = visitById.get(planItem.visitId);
        if (!visit || !planItem.startTime) {
          continue;
        }
        const currentStart =
          typeof visit.scheduledStartTime === 'string'
            ? visit.scheduledStartTime
            : '';
        if (currentStart === planItem.startTime) {
          continue;
        }

        await patchUserOriginatedRecord(visitsTable, planItem.visitId, {
          set: { scheduledStartTime: planItem.startTime },
        });

        const guestyTaskId =
          typeof visit.guestyTaskId === 'string' ? visit.guestyTaskId : '';
        if (!guestyTaskId) {
          continue;
        }

        try {
          const syncResult = await invokeGuestyStartTimeSync(planItem.visitId);
          if (!syncResult.ok) {
            syncErrors.push({
              visitId: planItem.visitId,
              error: syncResult.error || 'Guesty sync failed.',
            });
            continue;
          }
          syncedVisitIds.push(planItem.visitId);
        } catch (error) {
          syncErrors.push({
            visitId: planItem.visitId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const summaryAction =
      action === 'ready'
        ? `marked cleaning plan ${quoted(plannedDate)} as ready`
        : action === 'reopen'
          ? `reopened cleaning plan ${quoted(plannedDate)}`
          : `saved cleaning plan ${quoted(plannedDate)}`;

    await recordActivityLog(event, {
      feature: LOG_FEATURES.CLEANING_PLAN,
      action,
      entityId: plannedDate,
      entityName: plannedDate,
      summary: summaryAction,
    });

    return buildHttpResponse(200, {
      item,
      syncedVisitIds,
      syncErrors,
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save cleaning plan.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
