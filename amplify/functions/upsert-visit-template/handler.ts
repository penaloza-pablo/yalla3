import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  parseBody,
} from '../shared/dynamo-http';
import {
  getNextSequentialId,
  putItem,
  docClient,
} from '../shared/visit-task-utils';

type TemplateTask = {
  title?: string;
  description?: string;
  priority?: string;
  urgent?: boolean;
  sortOrder?: number;
};

type TemplatePayload = {
  id?: string;
  name?: string;
  propertyId?: string;
  visitTypeId?: string;
  teamId?: string;
  title?: string;
  assignedUserId?: string;
  description?: string;
  scheduledStartTime?: string;
  scheduledEndTime?: string;
  estimatedDurationMinutes?: number;
  appliesToHourBank?: boolean;
  active?: boolean;
  tasks?: TemplateTask[];
};

const normalizeTasks = (tasks?: TemplateTask[]) => {
  if (!Array.isArray(tasks)) {
    return [];
  }
  return tasks
    .map((task, index) => {
      const title = task.title?.trim() ?? '';
      if (!title) {
        return null;
      }
      const urgent = Boolean(task.urgent);
      const priority = urgent
        ? 'URGENT'
        : (task.priority?.trim().toUpperCase() || 'MEDIUM');
      return {
        title,
        description: task.description?.trim() ?? '',
        priority,
        urgent,
        sortOrder:
          typeof task.sortOrder === 'number' && Number.isFinite(task.sortOrder)
            ? task.sortOrder
            : index + 1,
      };
    })
    .filter((task): task is NonNullable<typeof task> => task !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  body?: string;
}) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const payload = parseBody<TemplatePayload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }

  const isUpdate = Boolean(payload.id?.trim());
  let existing: Record<string, unknown> | undefined;

  if (isUpdate) {
    const found = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { id: payload.id?.trim() },
      }),
    );
    if (!found.Item) {
      return buildHttpResponse(404, { message: 'Template not found.' });
    }
    existing = found.Item as Record<string, unknown>;
  }

  const propertyId = payload.propertyId?.trim();
  const visitTypeId = payload.visitTypeId?.trim();
  const teamId = payload.teamId?.trim();
  const name = payload.name?.trim();
  const title = payload.title?.trim();

  if (!isUpdate) {
    if (!propertyId || !visitTypeId || !teamId || !name || !title) {
      return buildHttpResponse(400, {
        message: 'propertyId, visitTypeId, teamId, name, and title are required.',
      });
    }
  }

  const timestamp = nowIso();
  const normalizedTasks = normalizeTasks(
    payload.tasks ??
      (Array.isArray(existing?.tasks)
        ? (existing?.tasks as TemplateTask[])
        : undefined),
  );

  const item: Record<string, unknown> = {
    id: isUpdate
      ? payload.id?.trim()
      : await getNextSequentialId(tableName, 'TPL'),
    name: name ?? (typeof existing?.name === 'string' ? existing.name : ''),
    propertyId: propertyId ?? existing?.propertyId ?? '',
    visitTypeId: visitTypeId ?? existing?.visitTypeId ?? '',
    teamId: teamId ?? existing?.teamId ?? '',
    title: title ?? (typeof existing?.title === 'string' ? existing.title : ''),
    assignedUserId:
      payload.assignedUserId?.trim() ??
      (typeof existing?.assignedUserId === 'string'
        ? existing.assignedUserId
        : ''),
    description:
      payload.description?.trim() ??
      (typeof existing?.description === 'string' ? existing.description : ''),
    scheduledStartTime:
      payload.scheduledStartTime?.trim() ??
      (typeof existing?.scheduledStartTime === 'string'
        ? existing.scheduledStartTime
        : '09:00'),
    scheduledEndTime:
      payload.scheduledEndTime?.trim() ??
      (typeof existing?.scheduledEndTime === 'string'
        ? existing.scheduledEndTime
        : '10:00'),
    estimatedDurationMinutes:
      payload.estimatedDurationMinutes ??
      (typeof existing?.estimatedDurationMinutes === 'number'
        ? existing.estimatedDurationMinutes
        : undefined),
    appliesToHourBank:
      payload.appliesToHourBank ??
      (typeof existing?.appliesToHourBank === 'boolean'
        ? existing.appliesToHourBank
        : false),
    active: payload.active ?? existing?.active ?? true,
    tasks: normalizedTasks,
    createdAt:
      (typeof existing?.createdAt === 'string' ? existing.createdAt : undefined) ??
      timestamp,
    updatedAt: timestamp,
  };

  try {
    await putItem(tableName, item);
    return buildHttpResponse(200, { item });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to save visit template.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
