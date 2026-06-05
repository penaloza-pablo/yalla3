import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  normalizeStatus,
  nowIso,
  parseBody,
} from '../shared/dynamo-http';
import {
  docClient,
  getNextSequentialId,
  putItem,
  TERMINAL_VISIT_STATUSES,
} from '../shared/visit-task-utils';

type TaskPayload = {
  id?: string;
  propertyId?: string;
  visitId?: string | null;
  teamId?: string;
  assignedUserId?: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  dueDate?: string;
  action?: 'dismiss' | 'assign';
  assignVisitId?: string;
  closedBy?: string;
  createdAt?: string;
};

const VALID_PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
const VALID_TASK_STATUSES = new Set([
  'UNASSIGNED',
  'DISMISS',
  'PENDING',
  'BLOCKED',
  'COMPLETED',
  'CANCELLED',
]);
const TERMINAL_TASK_STATUSES = new Set(['COMPLETED', 'CANCELLED']);

const normalizePriority = (value?: string) => {
  const normalized = normalizeStatus(value);
  return VALID_PRIORITIES.has(normalized) ? normalized : 'MEDIUM';
};

const loadVisit = async (visitsTable: string, visitId: string) => {
  const result = await docClient.send(
    new GetCommand({ TableName: visitsTable, Key: { id: visitId } }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? undefined;
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  body?: string;
}) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  const tasksTable = process.env.TABLE_NAME;
  const visitsTable = process.env.VISITS_TABLE;
  if (!tasksTable || !visitsTable) {
    return buildHttpResponse(500, {
      message: 'TABLE_NAME or VISITS_TABLE is not configured.',
    });
  }

  const payload = parseBody<TaskPayload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }

  const action = payload.action?.trim().toLowerCase();
  const isUpdate = Boolean(payload.id?.trim());
  let existing: Record<string, unknown> | undefined;

  if (isUpdate) {
    const found = await docClient.send(
      new GetCommand({
        TableName: tasksTable,
        Key: { id: payload.id?.trim() },
      }),
    );
    if (!found.Item) {
      return buildHttpResponse(404, { message: 'Task not found.' });
    }
    existing = found.Item as Record<string, unknown>;
    const existingStatus = normalizeStatus(
      typeof existing.status === 'string' ? existing.status : '',
    );
    if (TERMINAL_TASK_STATUSES.has(existingStatus) && action !== 'assign') {
      return buildHttpResponse(400, {
        message: 'Completed tasks cannot be edited.',
      });
    }
  }

  const timestamp = nowIso();

  if (action === 'dismiss' && existing) {
    await docClient.send(
      new UpdateCommand({
        TableName: tasksTable,
        Key: { id: existing.id },
        UpdateExpression:
          'SET #status = :status, #updatedAt = :updatedAt REMOVE #visitId',
        ExpressionAttributeNames: {
          '#status': 'status',
          '#updatedAt': 'updatedAt',
          '#visitId': 'visitId',
        },
        ExpressionAttributeValues: {
          ':status': 'DISMISS',
          ':updatedAt': timestamp,
        },
      }),
    );
    const item: Record<string, unknown> = {
      ...existing,
      status: 'DISMISS',
      updatedAt: timestamp,
    };
    delete item.visitId;
    return buildHttpResponse(200, { item });
  }

  if (action === 'assign' || payload.assignVisitId?.trim()) {
    const assignVisitId = payload.assignVisitId?.trim() ?? payload.visitId?.trim();
    if (!assignVisitId || !existing) {
      return buildHttpResponse(400, {
        message: 'assignVisitId and task id are required for assignment.',
      });
    }
    const visit = await loadVisit(visitsTable, assignVisitId);
    if (!visit) {
      return buildHttpResponse(404, { message: 'Visit not found.' });
    }
    const visitStatus = normalizeStatus(
      typeof visit.status === 'string' ? visit.status : '',
    );
    if (TERMINAL_VISIT_STATUSES.has(visitStatus)) {
      return buildHttpResponse(400, {
        message: 'Cannot assign tasks to a completed or cancelled visit.',
      });
    }
    const visitPropertyId =
      typeof visit.propertyId === 'string' ? visit.propertyId : '';
    const visitTeamId = typeof visit.teamId === 'string' ? visit.teamId : '';
    const taskPropertyId =
      payload.propertyId?.trim() ??
      (typeof existing.propertyId === 'string' ? existing.propertyId : '');
    const taskTeamId =
      payload.teamId?.trim() ??
      (typeof existing.teamId === 'string' ? existing.teamId : '');

    if (taskPropertyId && taskPropertyId !== visitPropertyId) {
      return buildHttpResponse(400, {
        message: 'Task propertyId must match the visit propertyId.',
      });
    }
    if (taskTeamId && taskTeamId !== visitTeamId) {
      return buildHttpResponse(400, {
        message: 'Task teamId must match the visit teamId.',
      });
    }

    await docClient.send(
      new UpdateCommand({
        TableName: tasksTable,
        Key: { id: existing.id },
        UpdateExpression:
          'SET #visitId = :visitId, #propertyId = :propertyId, #teamId = :teamId, #status = :status, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
          '#visitId': 'visitId',
          '#propertyId': 'propertyId',
          '#teamId': 'teamId',
          '#status': 'status',
          '#updatedAt': 'updatedAt',
        },
        ExpressionAttributeValues: {
          ':visitId': assignVisitId,
          ':propertyId': visitPropertyId,
          ':teamId': visitTeamId,
          ':status': 'PENDING',
          ':updatedAt': timestamp,
        },
      }),
    );
    const item = {
      ...existing,
      visitId: assignVisitId,
      propertyId: visitPropertyId,
      teamId: visitTeamId,
      status: 'PENDING',
      updatedAt: timestamp,
    };
    return buildHttpResponse(200, { item });
  }

  const propertyId = payload.propertyId?.trim();
  const teamId = payload.teamId?.trim();
  const visitId = payload.visitId?.trim();
  const title = payload.title?.trim();

  if (!isUpdate) {
    if (!title) {
      return buildHttpResponse(400, { message: 'title is required.' });
    }
    if (!visitId && (!propertyId || !teamId)) {
      return buildHttpResponse(400, {
        message: 'propertyId and teamId are required when visitId is missing.',
      });
    }
  }

  let status = normalizeStatus(payload.status);
  if (!status && !isUpdate) {
    status = visitId ? 'PENDING' : 'UNASSIGNED';
  } else if (!status && existing) {
    status = normalizeStatus(
      typeof existing.status === 'string' ? existing.status : '',
    );
  }

  if (!VALID_TASK_STATUSES.has(status)) {
    return buildHttpResponse(400, { message: 'Invalid task status.' });
  }

  if (status === 'COMPLETED') {
    const item = {
      ...(existing ?? {}),
      id: isUpdate ? payload.id?.trim() : await getNextSequentialId(tasksTable, 'TASK'),
      propertyId: propertyId ?? existing?.propertyId ?? '',
      visitId: visitId ?? existing?.visitId,
      teamId: teamId ?? existing?.teamId ?? '',
      assignedUserId:
        payload.assignedUserId?.trim() ??
        (typeof existing?.assignedUserId === 'string'
          ? existing.assignedUserId
          : undefined),
      title: title ?? (typeof existing?.title === 'string' ? existing.title : ''),
      description:
        payload.description?.trim() ??
        (typeof existing?.description === 'string' ? existing.description : ''),
      status: 'COMPLETED',
      priority: normalizePriority(
        payload.priority ??
          (typeof existing?.priority === 'string' ? existing.priority : undefined),
      ),
      dueDate:
        payload.dueDate?.trim() ??
        (typeof existing?.dueDate === 'string' ? existing.dueDate : undefined),
      closedAt: timestamp,
      closedBy: payload.closedBy?.trim() ?? undefined,
      createdAt:
        (typeof existing?.createdAt === 'string'
          ? existing.createdAt
          : undefined) ?? timestamp,
      updatedAt: timestamp,
    };
    await putItem(tasksTable, item);
    return buildHttpResponse(200, { item });
  }

  const item: Record<string, unknown> = {
    id: isUpdate ? payload.id?.trim() : await getNextSequentialId(tasksTable, 'TASK'),
    propertyId: propertyId ?? existing?.propertyId ?? '',
    teamId: teamId ?? existing?.teamId ?? '',
    assignedUserId:
      payload.assignedUserId?.trim() ??
      (typeof existing?.assignedUserId === 'string'
        ? existing.assignedUserId
        : undefined),
    title: title ?? (typeof existing?.title === 'string' ? existing.title : ''),
    description:
      payload.description?.trim() ??
      (typeof existing?.description === 'string' ? existing.description : ''),
    status,
    priority: normalizePriority(
      payload.priority ??
        (typeof existing?.priority === 'string' ? existing.priority : undefined),
    ),
    dueDate:
      payload.dueDate?.trim() ??
      (typeof existing?.dueDate === 'string' ? existing.dueDate : undefined),
    createdAt:
      (typeof existing?.createdAt === 'string' ? existing.createdAt : undefined) ??
      timestamp,
    updatedAt: timestamp,
  };

  if (visitId) {
    const visit = await loadVisit(visitsTable, visitId);
    if (!visit) {
      return buildHttpResponse(404, { message: 'Visit not found.' });
    }
    item.visitId = visitId;
    item.propertyId =
      typeof visit.propertyId === 'string' ? visit.propertyId : item.propertyId;
    item.teamId = typeof visit.teamId === 'string' ? visit.teamId : item.teamId;
    if (!isUpdate || status === 'UNASSIGNED' || status === 'DISMISS') {
      item.status = 'PENDING';
    }
    if (
      !item.assignedUserId &&
      typeof visit.assignedUserId === 'string' &&
      visit.assignedUserId
    ) {
      item.assignedUserId = visit.assignedUserId;
    }
  } else if (status !== 'UNASSIGNED' && status !== 'DISMISS') {
    delete item.visitId;
  }

  if (status === 'DISMISS' || status === 'UNASSIGNED') {
    delete item.visitId;
  }
  if (!item.visitId) {
    delete item.visitId;
  }

  try {
    await putItem(tasksTable, item);
    return buildHttpResponse(200, { item });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save task.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
