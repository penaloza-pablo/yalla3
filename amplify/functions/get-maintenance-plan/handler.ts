import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { isDateOnly } from '../shared/cleaning-plan';
import {
  getPlanByDate,
  queryMaintenanceTeamVisitsForDate,
  resolveMaintenanceTeamId,
  scanAllItems,
} from '../shared/maintenance-plan';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
};

type PlanItem = {
  visitId?: string;
  propertyId?: string;
  agentId?: string;
  startTime?: string;
  endTime?: string;
};

const asPlanItems = (value: unknown): PlanItem[] =>
  Array.isArray(value) ? (value as PlanItem[]) : [];

const mergePlanRows = (
  visits: Record<string, unknown>[],
  plan: Record<string, unknown> | undefined,
) => {
  const savedByVisitId = new Map(
    asPlanItems(plan?.items)
      .filter((item) => typeof item.visitId === 'string' && item.visitId)
      .map((item) => [item.visitId as string, item]),
  );

  return visits
    .map((visit) => {
      const visitId = typeof visit.id === 'string' ? visit.id : '';
      const saved = savedByVisitId.get(visitId);
      const visitStart =
        typeof visit.scheduledStartTime === 'string'
          ? visit.scheduledStartTime
          : '';
      const visitEnd =
        typeof visit.scheduledEndTime === 'string' ? visit.scheduledEndTime : '';
      const propertyId =
        typeof visit.propertyId === 'string' ? visit.propertyId : '';
      return {
        visitId,
        propertyId,
        title: typeof visit.title === 'string' ? visit.title : '',
        visitStatus: typeof visit.status === 'string' ? visit.status : '',
        visitStartTime: visitStart,
        visitEndTime: visitEnd,
        agentId: saved?.agentId?.trim() ?? '',
        startTime: saved?.startTime?.trim() || visitStart,
        endTime: saved?.endTime?.trim() || visitEnd,
        guestyTaskId:
          typeof visit.guestyTaskId === 'string' ? visit.guestyTaskId : '',
      };
    })
    .sort((a, b) => {
      const timeA = a.startTime || a.visitStartTime || '';
      const timeB = b.startTime || b.visitStartTime || '';
      if (timeA !== timeB) {
        return timeA.localeCompare(timeB);
      }
      return a.title.localeCompare(b.title);
    });
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

  const plansTable = process.env.TABLE_NAME;
  const visitsTable = process.env.VISITS_TABLE;
  const teamsTable = process.env.TEAMS_TABLE;
  if (!plansTable || !visitsTable || !teamsTable) {
    return buildHttpResponse(500, {
      message: 'TABLE_NAME, VISITS_TABLE, or TEAMS_TABLE is not configured.',
    });
  }

  const params = event.queryStringParameters ?? {};
  const list = params.list?.trim() === 'true';
  const plannedDate = params.date?.trim() ?? params.plannedDate?.trim();

  try {
    if (list) {
      const items = (await scanAllItems(plansTable)).sort((a, b) => {
        const dateA = typeof a.id === 'string' ? a.id : '';
        const dateB = typeof b.id === 'string' ? b.id : '';
        return dateB.localeCompare(dateA);
      });
      return buildHttpResponse(200, { items, count: items.length });
    }

    if (!isDateOnly(plannedDate)) {
      return buildHttpResponse(400, {
        message: 'Provide date=YYYY-MM-DD or list=true.',
      });
    }

    const teamId = await resolveMaintenanceTeamId(teamsTable);
    const [visits, plan] = await Promise.all([
      queryMaintenanceTeamVisitsForDate(
        visitsTable,
        plannedDate as string,
        teamId,
      ),
      getPlanByDate(plansTable, plannedDate as string),
    ]);
    const rows = mergePlanRows(visits, plan);

    return buildHttpResponse(200, {
      plannedDate,
      plan: plan ?? null,
      status: typeof plan?.status === 'string' ? plan.status : 'DRAFT',
      teamId,
      rows,
      count: rows.length,
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read maintenance plan.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
