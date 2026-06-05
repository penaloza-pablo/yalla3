import { GetCommand } from '@aws-sdk/lib-dynamodb';
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
  cancelVisitTasksOnVisitCancel,
  releaseVisitTasksOnCancel,
  resolveVisitStatus,
  TERMINAL_VISIT_STATUSES,
  visitHasOpenTasks,
} from '../shared/visit-task-utils';

type VisitPayload = {
  id?: string;
  propertyId?: string;
  visitTypeId?: string;
  teamId?: string;
  assignedUserId?: string;
  scheduledDate?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  status?: string;
  priority?: string;
  title?: string;
  description?: string;
  estimatedDurationMinutes?: number;
  actualDurationHours?: number;
  appliesToHourBank?: boolean;
  specialHours?: boolean;
  startedAt?: string;
  closedAt?: string;
  closedBy?: string;
  cancelTaskAction?: 'release' | 'cancel';
  createdAt?: string;
  updatedAt?: string;
};

const VALID_PRIORITIES = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
const VALID_VISIT_STATUSES = new Set([
  'SCHEDULED',
  'OVERDUE',
  'COMPLETED',
  'CANCELLED',
]);

const normalizePriority = (value?: string) => {
  const normalized = normalizeStatus(value);
  return VALID_PRIORITIES.has(normalized) ? normalized : 'MEDIUM';
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  body?: string;
}) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  const visitsTable = process.env.TABLE_NAME;
  const tasksTable = process.env.TASKS_TABLE;
  if (!visitsTable) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const payload = parseBody<VisitPayload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }

  const isUpdate = Boolean(payload.id?.trim());
  let existing: Record<string, unknown> | undefined;

  if (isUpdate) {
    const found = await docClient.send(
      new GetCommand({
        TableName: visitsTable,
        Key: { id: payload.id?.trim() },
      }),
    );
    if (!found.Item) {
      return buildHttpResponse(404, { message: 'Visit not found.' });
    }
    existing = found.Item as Record<string, unknown>;
    const existingStatus = normalizeStatus(
      typeof existing.status === 'string' ? existing.status : '',
    );
    if (TERMINAL_VISIT_STATUSES.has(existingStatus)) {
      return buildHttpResponse(400, {
        message: 'Completed or cancelled visits cannot be edited.',
      });
    }
  }

  const propertyId = payload.propertyId?.trim();
  const visitTypeId = payload.visitTypeId?.trim();
  const teamId = payload.teamId?.trim();
  const scheduledDate = payload.scheduledDate?.trim();
  const title = payload.title?.trim();

  if (!isUpdate) {
    if (!propertyId || !visitTypeId || !teamId || !scheduledDate) {
      return buildHttpResponse(400, {
        message:
          'propertyId, visitTypeId, teamId, and scheduledDate are required.',
      });
    }
  }

  const requestedStatus = normalizeStatus(payload.status);
  let status = requestedStatus;
  if (!status && !isUpdate) {
    status = resolveVisitStatus({ scheduledDate: scheduledDate ?? '' });
  } else if (!status && existing) {
    status = normalizeStatus(
      typeof existing.status === 'string' ? existing.status : '',
    );
  }

  if (status && !VALID_VISIT_STATUSES.has(status)) {
    return buildHttpResponse(400, { message: 'Invalid visit status.' });
  }

  if (status === 'COMPLETED') {
    const hours =
      payload.actualDurationHours ??
      (typeof existing?.actualDurationHours === 'number'
        ? existing.actualDurationHours
        : undefined);
    if (hours === undefined || hours === null || Number.isNaN(Number(hours))) {
      return buildHttpResponse(400, {
        message: 'actualDurationHours is required when completing a visit.',
      });
    }
    const visitIdForTasks = payload.id?.trim();
    if (tasksTable && visitIdForTasks) {
      const hasOpenTasks = await visitHasOpenTasks(tasksTable, visitIdForTasks);
      if (hasOpenTasks) {
        return buildHttpResponse(400, {
          message:
            'All visit tasks must be completed or dismissed before completing the visit.',
        });
      }
    }
  }

  const timestamp = nowIso();
  const mergedScheduledDate =
    scheduledDate ??
    (typeof existing?.scheduledDate === 'string'
      ? existing.scheduledDate
      : '');
  if (!mergedScheduledDate) {
    return buildHttpResponse(400, { message: 'scheduledDate is required.' });
  }

  if (!TERMINAL_VISIT_STATUSES.has(status)) {
    status = resolveVisitStatus({
      status,
      scheduledDate: mergedScheduledDate,
    });
  }

  const item: Record<string, unknown> = {
    id: isUpdate ? payload.id?.trim() : await getNextSequentialId(visitsTable, 'VISIT'),
    propertyId: propertyId ?? existing?.propertyId ?? '',
    visitTypeId: visitTypeId ?? existing?.visitTypeId ?? '',
    teamId: teamId ?? existing?.teamId ?? '',
    assignedUserId:
      payload.assignedUserId?.trim() ??
      (typeof existing?.assignedUserId === 'string'
        ? existing.assignedUserId
        : ''),
    scheduledDate: mergedScheduledDate,
    scheduledStartTime:
      payload.scheduledStartTime?.trim() ??
      (typeof existing?.scheduledStartTime === 'string'
        ? existing.scheduledStartTime
        : ''),
    scheduledEndTime:
      payload.scheduledEndTime?.trim() ??
      (typeof existing?.scheduledEndTime === 'string'
        ? existing.scheduledEndTime
        : ''),
    status,
    priority: normalizePriority(
      payload.priority ??
        (typeof existing?.priority === 'string' ? existing.priority : undefined),
    ),
    title:
      title ||
      (typeof existing?.title === 'string' ? existing.title : '') ||
      'Visit',
    description:
      payload.description?.trim() ??
      (typeof existing?.description === 'string' ? existing.description : ''),
    estimatedDurationMinutes:
      payload.estimatedDurationMinutes ??
      (typeof existing?.estimatedDurationMinutes === 'number'
        ? existing.estimatedDurationMinutes
        : undefined),
    actualDurationHours:
      payload.actualDurationHours ??
      (typeof existing?.actualDurationHours === 'number'
        ? existing.actualDurationHours
        : undefined),
    appliesToHourBank:
      payload.appliesToHourBank ??
      (typeof existing?.appliesToHourBank === 'boolean'
        ? existing.appliesToHourBank
        : false),
    specialHours:
      payload.specialHours ??
      (typeof existing?.specialHours === 'boolean'
        ? existing.specialHours
        : false),
    startedAt:
      payload.startedAt ??
      (typeof existing?.startedAt === 'string' ? existing.startedAt : undefined),
    closedAt:
      status === 'COMPLETED' || status === 'CANCELLED'
        ? payload.closedAt ?? timestamp
        : undefined,
    closedBy:
      status === 'COMPLETED' || status === 'CANCELLED'
        ? payload.closedBy?.trim() ?? undefined
        : undefined,
    createdAt:
      (typeof existing?.createdAt === 'string' ? existing.createdAt : undefined) ??
      timestamp,
    updatedAt: timestamp,
  };

  if (status === 'COMPLETED' || status === 'CANCELLED') {
    item.closedAt = item.closedAt ?? timestamp;
  }

  try {
    await putItem(visitsTable, item);

    let releasedTasks: Record<string, unknown>[] = [];
    let cancelledTasks: Record<string, unknown>[] = [];
    if (status === 'CANCELLED' && tasksTable && typeof item.id === 'string') {
      const cancelTaskAction = payload.cancelTaskAction?.trim().toLowerCase();
      if (cancelTaskAction === 'cancel') {
        cancelledTasks = await cancelVisitTasksOnVisitCancel(tasksTable, item.id);
      } else {
        releasedTasks = await releaseVisitTasksOnCancel(tasksTable, item.id);
      }
    }

    return buildHttpResponse(200, { item, releasedTasks, cancelledTasks });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save visit.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
