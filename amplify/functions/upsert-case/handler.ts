import {
  LOG_FEATURES,
  quoted,
  recordActivityLog,
} from '../shared/activity-log';
import { getActorEmail } from '../shared/cognito-auth';
import {
  asCaseStatus,
  getCase,
  loadProperties,
  propertyInScope,
  publicCase,
  resolveCaseDestination,
  updateCaseFields,
  type CaseDestination,
} from '../shared/case-records';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  nowIso,
  parseBody,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { isDateOnly } from '../shared/finance-services';
import {
  occurrencePriceWithIva,
  persistIvaFields,
  resolveIvaRateFromInput,
  roundMoney,
} from '../shared/iva';
import { asString, isBillingMaintenanceVisit } from '../shared/maintenance-billing';
import { asStringList } from '../shared/property-groups';
import {
  docClient,
  getNextSequentialId,
  patchUserOriginatedRecord,
  putItem,
} from '../shared/visit-task-utils';
import { GetCommand } from '@aws-sdk/lib-dynamodb';

type CasePayload = {
  action?: string;
  id?: string;
  title?: string;
  description?: string;
  propertyId?: string;
  taskId?: string;
  visitId?: string;
  body?: string;
  status?: string;
  date?: string;
  amount?: number | string;
  ivaRate?: number | string;
};

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  headers?: Record<string, string | string[] | undefined>;
  body?: string;
};

const requireTables = () => {
  const casesTable = process.env.CASES_TABLE ?? '';
  const eventsTable = process.env.CASE_EVENTS_TABLE ?? '';
  const visitsTable = process.env.VISITS_TABLE ?? '';
  const propertiesTable = process.env.PROPERTIES_TABLE ?? '';
  const tasksTable = process.env.TASKS_TABLE ?? '';
  const movementsTable = process.env.MOVEMENTS_TABLE ?? '';
  if (!casesTable || !eventsTable) {
    return null;
  }
  return {
    casesTable,
    eventsTable,
    visitsTable,
    propertiesTable,
    tasksTable,
    movementsTable,
  };
};

const loadRecord = async (tableName: string, id: string) => {
  if (!tableName || !id) {
    return undefined;
  }
  const result = await docClient.send(
    new GetCommand({ TableName: tableName, Key: { id } }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? undefined;
};

const appendId = (current: unknown, id: string) => {
  const ids = asStringList(current);
  return ids.includes(id) ? ids : [...ids, id];
};

const withoutId = (current: unknown, id: string) =>
  asStringList(current).filter((entry) => entry !== id);

const issueMoment = (date: string | undefined, fallback: string) => {
  const trimmed = date?.trim() ?? '';
  if (!trimmed) {
    return fallback;
  }
  if (!isDateOnly(trimmed)) {
    return '';
  }
  return `${trimmed}T12:00:00.000Z`;
};

const putEvent = async (params: {
  eventsTable: string;
  caseId: string;
  type: 'COMMENT' | 'ISSUE';
  body: string;
  createdAt: string;
  createdBy: string;
}) => {
  const id = await getNextSequentialId(params.eventsTable, 'EVT');
  const item = {
    id,
    caseId: params.caseId,
    type: params.type,
    body: params.body,
    createdAt: params.createdAt,
    createdBy: params.createdBy,
  };
  await putItem(params.eventsTable, item);
  return item;
};

const issuePatch = (item: Record<string, unknown>, issueAt: string) => {
  const set: Record<string, unknown> = { lastIssueAt: issueAt };
  const remove: string[] = [];
  if (asCaseStatus(item.status) !== 'QUARANTINE') {
    return { set, remove };
  }
  const startedMs = Date.parse(asString(item.quarantineStartedAt));
  const issueMs = Date.parse(issueAt);
  if (!Number.isFinite(startedMs) || (Number.isFinite(issueMs) && issueMs >= startedMs)) {
    set.status = 'KNOWN';
    remove.push('quarantineStartedAt');
  }
  return { set, remove };
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

  const tables = requireTables();
  if (!tables) {
    return buildHttpResponse(500, {
      message: 'CASES_TABLE or CASE_EVENTS_TABLE is not configured.',
    });
  }

  const payload = parseBody<CasePayload>(event.body);
  if (!payload) {
    return buildHttpResponse(400, { message: 'Payload is required.' });
  }
  const action = payload.action?.trim().toLowerCase() || 'create';
  const actor = await getActorEmail(event);

  try {
    if (action === 'create') {
      return await createCase(event, tables, payload, actor);
    }
    const caseId = payload.id?.trim() ?? '';
    if (!caseId) {
      return buildHttpResponse(400, { message: 'id is required.' });
    }
    const existing = await getCase(tables.casesTable, caseId);
    if (!existing) {
      return buildHttpResponse(404, { message: 'Case not found.' });
    }
    const status = asCaseStatus(existing.status);
    if (action === 'reactivate') {
      if (status !== 'CLOSED') {
        return buildHttpResponse(400, { message: 'Only a closed case can be reactivated.' });
      }
      await updateCaseFields(
        tables.casesTable,
        caseId,
        { status: 'KNOWN' },
        ['closedAt', 'quarantineStartedAt'],
      );
      await recordActivityLog(event, {
        feature: LOG_FEATURES.OPERATIONS,
        action: 'update',
        entityId: caseId,
        entityName: asString(existing.title),
        summary: `reactivated case ${quoted(asString(existing.title))}`,
      });
      return buildHttpResponse(200, {
        item: publicCase({ ...existing, status: 'KNOWN', closedAt: '', quarantineStartedAt: '' }),
      });
    }
    if (status === 'CLOSED' && action !== 'comment' && action !== 'update') {
      return buildHttpResponse(400, {
        message: 'Reactivate the case before adding new activity.',
      });
    }
    if (action === 'update') {
      const title = payload.title?.trim() || asString(existing.title);
      if (!title) {
        return buildHttpResponse(400, { message: 'title is required.' });
      }
      const description =
        payload.description !== undefined
          ? payload.description.trim()
          : asString(existing.description);
      await updateCaseFields(tables.casesTable, caseId, { title, description });
      return buildHttpResponse(200, {
        item: publicCase({ ...existing, title, description }),
      });
    }
    if (action === 'comment' || action === 'issue') {
      const body = payload.body?.trim() ?? '';
      if (!body) {
        return buildHttpResponse(400, { message: 'body is required.' });
      }
      const timestamp = nowIso();
      const createdAt =
        action === 'issue' ? issueMoment(payload.date, timestamp) : timestamp;
      if (!createdAt) {
        return buildHttpResponse(400, { message: 'date must be YYYY-MM-DD.' });
      }
      await putEvent({
        eventsTable: tables.eventsTable,
        caseId,
        type: action === 'issue' ? 'ISSUE' : 'COMMENT',
        body,
        createdAt,
        createdBy: actor,
      });
      if (action === 'issue') {
        const patch = issuePatch(existing, createdAt);
        await updateCaseFields(tables.casesTable, caseId, patch.set, patch.remove);
      }
      return buildHttpResponse(200, { item: publicCase(existing), ok: true });
    }
    if (action === 'status') {
      const next = asCaseStatus(payload.status);
      if (next !== 'KNOWN' && next !== 'QUARANTINE') {
        return buildHttpResponse(400, {
          message: 'status must be KNOWN or QUARANTINE.',
        });
      }
      if (next === 'QUARANTINE') {
        await updateCaseFields(tables.casesTable, caseId, {
          status: 'QUARANTINE',
          quarantineStartedAt:
            status === 'QUARANTINE' && asString(existing.quarantineStartedAt)
              ? asString(existing.quarantineStartedAt)
              : nowIso(),
        });
      } else {
        await updateCaseFields(
          tables.casesTable,
          caseId,
          { status: 'KNOWN' },
          ['quarantineStartedAt'],
        );
      }
      await recordActivityLog(event, {
        feature: LOG_FEATURES.OPERATIONS,
        action: 'update',
        entityId: caseId,
        entityName: asString(existing.title),
        summary: `moved case ${quoted(asString(existing.title))} to ${next}`,
      });
      return buildHttpResponse(200, { ok: true });
    }
    if (action === 'linktask') {
      return await linkTask(event, tables, existing, payload.taskId?.trim() ?? '', actor);
    }
    if (action === 'linkvisit' || action === 'unlinkvisit') {
      return await changeVisit(event, tables, existing, payload.visitId?.trim() ?? '', action);
    }
    if (action === 'expense') {
      return await addExpense(event, tables, existing, payload);
    }
    return buildHttpResponse(400, { message: 'Unknown case action.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = message.startsWith('400:') ? 400 : 500;
    return buildHttpResponse(statusCode, {
      message: statusCode === 400 ? message.slice(4).trim() : 'Failed to save the case.',
      details: statusCode === 400 ? undefined : message,
    });
  }
};

const fail = (message: string): never => {
  throw new Error(`400: ${message}`);
};

const createCase = async (
  event: HttpEvent,
  tables: NonNullable<ReturnType<typeof requireTables>>,
  payload: CasePayload,
  actor: string,
) => {
  const title = payload.title?.trim() ?? '';
  const propertyId = payload.propertyId?.trim() ?? '';
  if (!title || !propertyId) {
    return buildHttpResponse(400, { message: 'title and propertyId are required.' });
  }
  const properties = await loadProperties(tables.propertiesTable);
  const destination = resolveCaseDestination(propertyId, properties);
  if (!destination) {
    return buildHttpResponse(400, {
      message: 'Choose a property or finance report group.',
    });
  }
  const task = payload.taskId?.trim()
    ? await loadInboxTask(tables, payload.taskId.trim(), destination)
    : undefined;
  const timestamp = nowIso();
  const caseId = await getNextSequentialId(tables.casesTable, 'CASE');
  const description = payload.description?.trim() ?? '';
  const item: Record<string, unknown> = {
    id: caseId,
    title,
    description,
    status: 'KNOWN',
    propertyId: destination.propertyId,
    propertyName: destination.propertyName,
    visitIds: [],
    movementIds: [],
    taskIds: task ? [asString(task.id)] : [],
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: actor,
  };
  if (task) {
    const issueAt = asString(task.createdAt) || timestamp;
    item.lastIssueAt = issueAt;
    await putItem(tables.casesTable, item);
    await patchUserOriginatedRecord(tables.tasksTable, asString(task.id), {
      set: { caseId },
    });
    await putEvent({
      eventsTable: tables.eventsTable,
      caseId,
      type: 'ISSUE',
      body: taskIssueBody(task),
      createdAt: issueAt,
      createdBy: actor,
    });
  } else {
    await putItem(tables.casesTable, item);
  }
  await recordActivityLog(event, {
    feature: LOG_FEATURES.OPERATIONS,
    action: 'create',
    entityId: caseId,
    entityName: title,
    summary: `created case ${quoted(title)}`,
  });
  return buildHttpResponse(200, { item: publicCase(item) });
};

const loadInboxTask = async (
  tables: NonNullable<ReturnType<typeof requireTables>>,
  taskId: string,
  destination: CaseDestination,
) => {
  const task = await loadRecord(tables.tasksTable, taskId);
  if (!task) {
    fail('Task not found.');
  }
  const record = task as Record<string, unknown>;
  if (asString(record.caseId)) {
    fail('Task is already part of a case.');
  }
  if (asString(record.visitId)) {
    fail('Task is already assigned to a visit.');
  }
  const status = asString(record.status).toUpperCase();
  if (status !== 'UNASSIGNED' && status !== 'DISMISS') {
    fail('Only inbox tasks can be added to a case.');
  }
  if (!propertyInScope(asString(record.propertyId), destination.memberIds)) {
    fail('Task property is outside this case.');
  }
  return record;
};

const taskIssueBody = (task: Record<string, unknown>) => {
  const title = asString(task.title);
  const description = asString(task.description);
  return [title, description].filter(Boolean).join('\n\n') || asString(task.id);
};

const linkTask = async (
  event: HttpEvent,
  tables: NonNullable<ReturnType<typeof requireTables>>,
  existing: Record<string, unknown>,
  taskId: string,
  actor: string,
) => {
  if (!taskId) {
    return buildHttpResponse(400, { message: 'taskId is required.' });
  }
  const properties = await loadProperties(tables.propertiesTable);
  const destination = resolveCaseDestination(asString(existing.propertyId), properties);
  if (!destination) {
    return buildHttpResponse(400, { message: 'Case property is no longer valid.' });
  }
  const task = await loadInboxTask(tables, taskId, destination);
  const caseId = asString(existing.id);
  const timestamp = nowIso();
  await patchUserOriginatedRecord(tables.tasksTable, asString(task.id), {
    set: { caseId },
  });
  await putEvent({
    eventsTable: tables.eventsTable,
    caseId,
    type: 'ISSUE',
    body: taskIssueBody(task),
    createdAt: timestamp,
    createdBy: actor,
  });
  const patch = issuePatch(existing, timestamp);
  await updateCaseFields(
    tables.casesTable,
    caseId,
    { ...patch.set, taskIds: appendId(existing.taskIds, asString(task.id)) },
    patch.remove,
  );
  await recordActivityLog(event, {
    feature: LOG_FEATURES.OPERATIONS,
    action: 'update',
    entityId: caseId,
    entityName: asString(existing.title),
    summary: `added task ${quoted(asString(task.title))} to case ${quoted(asString(existing.title))}`,
  });
  return buildHttpResponse(200, { ok: true });
};

const changeVisit = async (
  event: HttpEvent,
  tables: NonNullable<ReturnType<typeof requireTables>>,
  existing: Record<string, unknown>,
  visitId: string,
  action: string,
) => {
  if (!visitId) {
    return buildHttpResponse(400, { message: 'visitId is required.' });
  }
  const caseId = asString(existing.id);
  if (action === 'unlinkvisit') {
    await updateCaseFields(tables.casesTable, caseId, {
      visitIds: withoutId(existing.visitIds, visitId),
    });
    return buildHttpResponse(200, { ok: true });
  }
  const visit = await loadRecord(tables.visitsTable, visitId);
  if (!visit) {
    return buildHttpResponse(404, { message: 'Visit not found.' });
  }
  if (!isBillingMaintenanceVisit(visit)) {
    return buildHttpResponse(400, {
      message: 'Only maintenance visits can be linked to a case.',
    });
  }
  const visitStatus = asString(visit.status).toUpperCase();
  if (visitStatus === 'CANCELLED') {
    return buildHttpResponse(400, { message: 'Cancelled visits cannot be linked.' });
  }
  const properties = await loadProperties(tables.propertiesTable);
  const destination = resolveCaseDestination(asString(existing.propertyId), properties);
  if (
    !destination ||
    !propertyInScope(asString(visit.propertyId), destination.memberIds)
  ) {
    return buildHttpResponse(400, { message: 'Visit property is outside this case.' });
  }
  await updateCaseFields(tables.casesTable, caseId, {
    visitIds: appendId(existing.visitIds, visitId),
  });
  await recordActivityLog(event, {
    feature: LOG_FEATURES.OPERATIONS,
    action: 'update',
    entityId: caseId,
    entityName: asString(existing.title),
    summary: `linked visit ${quoted(asString(visit.title) || visitId)} to case ${quoted(asString(existing.title))}`,
  });
  return buildHttpResponse(200, { ok: true });
};

const addExpense = async (
  event: HttpEvent,
  tables: NonNullable<ReturnType<typeof requireTables>>,
  existing: Record<string, unknown>,
  payload: CasePayload,
) => {
  const description = payload.description?.trim() || payload.title?.trim() || '';
  const date = payload.date?.trim() ?? '';
  const amount = typeof payload.amount === 'number' ? payload.amount : Number(payload.amount);
  if (!description || !date || !isDateOnly(date) || !Number.isFinite(amount) || amount <= 0) {
    return buildHttpResponse(400, {
      message: 'description, date, and a positive amount are required.',
    });
  }
  const ivaRate = resolveIvaRateFromInput({ ivaRate: payload.ivaRate });
  const net = roundMoney(amount);
  const totalAmount = occurrencePriceWithIva(net, ivaRate);
  const timestamp = nowIso();
  const movementId = await getNextSequentialId(tables.movementsTable, 'MOV');
  const caseId = asString(existing.id);
  const movement = {
    id: movementId,
    recordType: 'item',
    propertyId: asString(existing.propertyId),
    propertyName: asString(existing.propertyName),
    description,
    amount: net,
    ...persistIvaFields(ivaRate),
    totalAmount,
    kind: 'outcome',
    status: 'Pending Billing',
    date,
    caseId,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await putItem(tables.movementsTable, movement);
  await updateCaseFields(tables.casesTable, caseId, {
    movementIds: appendId(existing.movementIds, movementId),
  });
  await recordActivityLog(event, {
    feature: LOG_FEATURES.MOVEMENTS,
    action: 'create',
    entityId: movementId,
    entityName: description,
    summary: `created movement ${quoted(movementId)} for case ${quoted(asString(existing.title))}`,
  });
  return buildHttpResponse(200, { item: movement });
};
