import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import { isDateOnly } from '../shared/cleaning-plan';
import { isPlanDateTooFarAhead } from '../shared/date-range';
import {
  getPlanByDate,
  loadAgent,
  minutesBetweenTimes,
  normalizeStartTime,
  queryMaintenanceTeamVisitsForDate,
  resolveMaintenanceTeamId,
} from '../shared/maintenance-plan';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { invokeGuestyTaskSync } from '../shared/guesty-sync';
import {
  getTodayInMadrid,
  patchUserOriginatedRecord,
  putItem,
} from '../shared/visit-task-utils';

type PlanItemInput = {
  visitId?: string;
  agentId?: string;
  startTime?: string;
  endTime?: string;
};

type PlanPayload = {
  plannedDate?: string;
  action?: 'save' | 'ready' | 'reopen';
  items?: PlanItemInput[];
};

type SavedPlanItem = {
  visitId: string;
  propertyId: string;
  agentId: string;
  startTime: string;
  endTime: string;
};

const invokeGuestyStartTimeSync = async (visitId: string) =>
  invokeGuestyTaskSync({
    tableName: process.env.VISITS_TABLE || 'yalla-visits',
    id: visitId,
  });

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
  const agentsTable = process.env.AGENTS_TABLE;
  const teamsTable = process.env.TEAMS_TABLE;
  if (!plansTable || !visitsTable || !teamsTable) {
    return buildHttpResponse(500, {
      message: 'TABLE_NAME, VISITS_TABLE, or TEAMS_TABLE is not configured.',
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

    if (
      action === 'ready' &&
      isPlanDateTooFarAhead(plannedDate as string, getTodayInMadrid())
    ) {
      return buildHttpResponse(400, {
        message: 'Days more than two days ahead can only be saved as a draft.',
      });
    }

    const teamId = await resolveMaintenanceTeamId(teamsTable);
    const visits = await queryMaintenanceTeamVisitsForDate(
      visitsTable,
      plannedDate as string,
      teamId,
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
      const agentId = draft.agentId?.trim() ?? '';
      if (agentId && action !== 'reopen') {
        const agent = await loadAgent(agentsTable, agentId);
        if (!agent || agent.active === false) {
          return buildHttpResponse(400, {
            message: `Agent ${agentId} is not available.`,
            visitId,
          });
        }
      }
      const startTime = normalizeStartTime(draft.startTime);
      const endTime = normalizeStartTime(draft.endTime);
      const propertyId =
        typeof visit.propertyId === 'string' ? visit.propertyId : '';
      normalizedItems.push({
        visitId,
        propertyId,
        agentId,
        startTime,
        endTime,
      });
    }

    if (action === 'ready') {
      const missing = visits.filter((visit) => {
        const visitId = typeof visit.id === 'string' ? visit.id : '';
        const saved = normalizedItems.find((item) => item.visitId === visitId);
        return !saved?.agentId || !saved.startTime || !saved.endTime;
      });
      if (missing.length > 0) {
        return buildHttpResponse(400, {
          message:
            'Every maintenance visit needs an agent, a start time, and an end time before the plan can be marked ready.',
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
        if (!visit || (!planItem.startTime && !planItem.endTime)) {
          continue;
        }
        const currentStart =
          typeof visit.scheduledStartTime === 'string'
            ? visit.scheduledStartTime
            : '';
        const currentEnd =
          typeof visit.scheduledEndTime === 'string'
            ? visit.scheduledEndTime
            : '';
        const currentDurationMinutes = Number(visit.estimatedDurationMinutes);
        const durationMinutes =
          planItem.startTime && planItem.endTime
            ? minutesBetweenTimes(planItem.startTime, planItem.endTime)
            : undefined;
        const startChanged =
          Boolean(planItem.startTime) && currentStart !== planItem.startTime;
        const endChanged =
          Boolean(planItem.endTime) && currentEnd !== planItem.endTime;
        const durationChanged =
          durationMinutes !== undefined &&
          currentDurationMinutes !== durationMinutes;
        if (!startChanged && !endChanged && !durationChanged) {
          continue;
        }

        const setFields: Record<string, unknown> = {};
        if (planItem.startTime) {
          setFields.scheduledStartTime = planItem.startTime;
        }
        if (planItem.endTime) {
          setFields.scheduledEndTime = planItem.endTime;
        }
        if (durationMinutes !== undefined) {
          setFields.estimatedDurationMinutes = durationMinutes;
        }

        await patchUserOriginatedRecord(visitsTable, planItem.visitId, {
          set: setFields,
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
          await patchUserOriginatedRecord(visitsTable, planItem.visitId, {
            set: setFields,
          });
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
        ? `marked maintenance plan ${quoted(plannedDate)} as ready`
        : action === 'reopen'
          ? `reopened maintenance plan ${quoted(plannedDate)}`
          : `saved maintenance plan ${quoted(plannedDate)}`;

    await recordActivityLog(event, {
      feature: LOG_FEATURES.MAINTENANCE_PLAN,
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
      message: 'Failed to save maintenance plan.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
