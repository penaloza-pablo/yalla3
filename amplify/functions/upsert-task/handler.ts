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
  normalizeStatus,
  nowIso,
  parseBody, rejectIfUnauthenticated } from '../shared/dynamo-http';
import {
  docClient,
  getNextSequentialId,
  mergeUserEditResponseItem,
  patchUserOriginatedRecord,
  putItem,
  TERMINAL_VISIT_STATUSES,
  withUserEditSyncMetadata,
} from '../shared/visit-task-utils';
import { hasGuestyTaskId, invokeGuestyTaskSync } from '../shared/guesty-sync';

type TaskPayload = {
  id?: string;
  propertyId?: string;
  visitId?: string | null;
  teamId?: string;
  assignedUserId?: string;
  title?: string;
  titleEs?: string;
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

const getVisitScheduledDate = (visit: Record<string, unknown>) =>
  typeof visit.scheduledDate === 'string' ? visit.scheduledDate.trim() : '';

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
    const taskId = typeof existing.id === 'string' ? existing.id : '';
    const dismissPatch = {
      set: { status: 'DISMISS' },
      remove: ['visitId'],
    };
    await patchUserOriginatedRecord(tasksTable, taskId, dismissPatch);
    const item = mergeUserEditResponseItem(existing, dismissPatch, timestamp);
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

    const visitDueDate = getVisitScheduledDate(visit);
    const taskId = typeof existing.id === 'string' ? existing.id : '';
    const assignSet: Record<string, unknown> = {
      visitId: assignVisitId,
      propertyId: visitPropertyId,
      teamId: visitTeamId,
      status: 'PENDING',
    };
    if (visitDueDate) {
      assignSet.dueDate = visitDueDate;
    }
    const assignPatch = { set: assignSet };
    await patchUserOriginatedRecord(tasksTable, taskId, assignPatch);
    const item = mergeUserEditResponseItem(existing, assignPatch, timestamp);
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

  const taskId = isUpdate
    ? payload.id?.trim()
    : await getNextSequentialId(tasksTable, 'TASK');

  const editableFields: Record<string, unknown> = {
    propertyId: propertyId ?? existing?.propertyId ?? '',
    teamId: teamId ?? existing?.teamId ?? '',
    assignedUserId:
      payload.assignedUserId?.trim() ??
      (typeof existing?.assignedUserId === 'string'
        ? existing.assignedUserId
        : undefined),
    title: title ?? (typeof existing?.title === 'string' ? existing.title : ''),
    titleEs:
      payload.titleEs?.trim() ??
      (typeof existing?.titleEs === 'string' ? existing.titleEs : ''),
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
  };

  if (status === 'COMPLETED') {
    editableFields.status = 'COMPLETED';
    editableFields.closedAt = timestamp;
    editableFields.closedBy = payload.closedBy?.trim() ?? undefined;
  }

  const removeFields: string[] = [];
  let linkedVisit: Record<string, unknown> | undefined;

  if (
    visitId &&
    status !== 'UNASSIGNED' &&
    status !== 'DISMISS'
  ) {
    linkedVisit = await loadVisit(visitsTable, visitId);
    if (!linkedVisit) {
      return buildHttpResponse(404, { message: 'Visit not found.' });
    }
    editableFields.visitId = visitId;
    editableFields.propertyId =
      typeof linkedVisit.propertyId === 'string'
        ? linkedVisit.propertyId
        : editableFields.propertyId;
    editableFields.teamId =
      typeof linkedVisit.teamId === 'string'
        ? linkedVisit.teamId
        : editableFields.teamId;
    if (!isUpdate) {
      editableFields.status = 'PENDING';
    }
    if (
      !editableFields.assignedUserId &&
      typeof linkedVisit.assignedUserId === 'string' &&
      linkedVisit.assignedUserId
    ) {
      editableFields.assignedUserId = linkedVisit.assignedUserId;
    }
    const visitDueDate = getVisitScheduledDate(linkedVisit);
    if (visitDueDate && !payload.dueDate?.trim()) {
      editableFields.dueDate = visitDueDate;
    }
  } else if (isUpdate) {
    removeFields.push('visitId');
  }

  try {
    let item: Record<string, unknown>;

    if (isUpdate && existing && taskId) {
      await patchUserOriginatedRecord(tasksTable, taskId, {
        set: editableFields,
        remove: removeFields.length > 0 ? removeFields : undefined,
      });
      item = mergeUserEditResponseItem(
        existing,
        { set: editableFields, remove: removeFields },
        timestamp,
      );
      item.id = taskId;
    } else {
      item = {
        id: taskId,
        ...editableFields,
        createdAt: timestamp,
        ...withUserEditSyncMetadata({}, timestamp),
      };
      if (!item.visitId) {
        delete item.visitId;
      }
      await putItem(tasksTable, item);
    }

    const taskTitle =
      typeof item.title === 'string' && item.title.trim()
        ? item.title
        : typeof item.id === 'string'
          ? item.id
          : 'task';
    const taskStatus =
      typeof item.status === 'string' ? item.status.toLowerCase() : '';
    await recordActivityLog(event, {
      feature: LOG_FEATURES.OPERATIONS,
      action: isUpdate ? 'update' : 'create',
      entityId: typeof item.id === 'string' ? item.id : undefined,
      entityName: taskTitle,
      summary: isUpdate
        ? taskStatus === 'completed' || taskStatus === 'cancelled' || taskStatus === 'dismiss'
          ? `marked task ${quoted(taskTitle)} as ${taskStatus}`
          : `updated task ${quoted(taskTitle)}`
        : `created task ${quoted(taskTitle)}`,
    });

    if (isUpdate && typeof item.id === 'string' && hasGuestyTaskId(item)) {
      try {
        const syncResult = await invokeGuestyTaskSync({
          tableName: tasksTable,
          id: item.id,
        });
        if (!syncResult.ok) {
          console.error('Failed to sync task to Guesty', syncResult.error);
        }
      } catch (error) {
        console.error('Failed to sync task to Guesty', error);
      }
    }

    return buildHttpResponse(200, { item });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save task.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
