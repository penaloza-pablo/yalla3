import {
  ConditionalCheckFailedException,
} from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  createVisitTasksBulk,
  docClient,
  TERMINAL_VISIT_STATUSES,
} from './visit-task-utils';
import { normalizeStatus, nowIso } from './dynamo-http';

export type VisitTemplateAutoAssignRule = {
  id: string;
  propertyId: string;
  templateId: string;
  titlePrefix: string;
  enabled: boolean;
};

export const normalizeTitlePrefix = (value: string) =>
  value.trim().replace(/\s+/g, ' ');

const EXTRA_TASKS_SEPARATOR = '+';

export const titleMatchesPrefix = (title: string, prefix: string) => {
  const normalizedTitle = normalizeTitlePrefix(title).toLowerCase();
  const normalizedPrefix = normalizeTitlePrefix(prefix).toLowerCase();
  if (!normalizedPrefix || !normalizedTitle.startsWith(normalizedPrefix)) {
    return false;
  }
  const remainder = normalizedTitle.slice(normalizedPrefix.length).trim();
  return remainder === '' || remainder.startsWith(EXTRA_TASKS_SEPARATOR);
};

export const pickMatchingAutoAssignRule = (
  rules: VisitTemplateAutoAssignRule[],
  propertyId: string,
  title: string,
) => {
  const matches = rules.filter(
    (rule) =>
      rule.enabled &&
      rule.propertyId === propertyId &&
      titleMatchesPrefix(title, rule.titlePrefix),
  );
  matches.sort(
    (left, right) =>
      normalizeTitlePrefix(right.titlePrefix).length -
      normalizeTitlePrefix(left.titlePrefix).length,
  );
  return matches[0] ?? null;
};

const asRule = (item: Record<string, unknown>): VisitTemplateAutoAssignRule => ({
  id: String(item.id ?? ''),
  propertyId: String(item.propertyId ?? ''),
  templateId: String(item.templateId ?? ''),
  titlePrefix: normalizeTitlePrefix(String(item.titlePrefix ?? '')),
  enabled: item.enabled !== false,
});

const queryRulesForProperty = async (tableName: string, propertyId: string) => {
  const items: Record<string, unknown>[] = [];
  try {
    let lastEvaluatedKey: Record<string, unknown> | undefined;
    do {
      const result = await docClient.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: 'propertyId-index',
          KeyConditionExpression: 'propertyId = :propertyId',
          ExpressionAttributeValues: { ':propertyId': propertyId },
          ExclusiveStartKey: lastEvaluatedKey,
        }),
      );
      items.push(...((result.Items as Record<string, unknown>[]) ?? []));
      lastEvaluatedKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (lastEvaluatedKey);
    return items.map(asRule);
  } catch (error) {
    console.error('Auto-assign GSI query failed; falling back to scan', error);
  }

  const scanned: Record<string, unknown>[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    scanned.push(...((result.Items as Record<string, unknown>[]) ?? []));
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  return scanned.map(asRule).filter((rule) => rule.propertyId === propertyId);
};

const visitHasTasks = async (tasksTable: string, visitId: string) => {
  const result = await docClient.send(
    new QueryCommand({
      TableName: tasksTable,
      IndexName: 'visitId-createdAt-index',
      KeyConditionExpression: 'visitId = :visitId',
      ExpressionAttributeValues: { ':visitId': visitId },
      Limit: 1,
    }),
  );
  return (result.Count ?? result.Items?.length ?? 0) > 0;
};

const templateTasksPayload = (template: Record<string, unknown>) => {
  const rawTasks = Array.isArray(template.tasks) ? template.tasks : [];
  return rawTasks.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }
    const task = entry as Record<string, unknown>;
    const title = String(task.title ?? '').trim();
    if (!title) {
      return [];
    }
    const urgent = Boolean(task.urgent);
    return [
      {
        title,
        titleEs:
          typeof task.titleEs === 'string' ? task.titleEs.trim() : undefined,
        description:
          typeof task.description === 'string' ? task.description : '',
        descriptionEs:
          typeof task.descriptionEs === 'string'
            ? task.descriptionEs.trim()
            : undefined,
        priority: urgent
          ? 'URGENT'
          : String(task.priority ?? 'MEDIUM').toUpperCase(),
      },
    ];
  });
};

export type AutoAssignResult = {
  applied: boolean;
  reason: string;
  item: Record<string, unknown>;
  createdTasks: Record<string, unknown>[];
};

const skipped = (
  visit: Record<string, unknown>,
  reason: string,
): AutoAssignResult => ({
  applied: false,
  reason,
  item: visit,
  createdTasks: [],
});

export const applyVisitTemplateAutoAssign = async (
  visit: Record<string, unknown>,
): Promise<AutoAssignResult> => {
  const visitsTable = process.env.TABLE_NAME || process.env.VISITS_TABLE;
  const tasksTable = process.env.TASKS_TABLE;
  const templatesTable = process.env.TEMPLATES_TABLE;
  const autoAssignTable = process.env.AUTO_ASSIGN_TABLE;
  const visitId = typeof visit.id === 'string' ? visit.id.trim() : '';
  const propertyId =
    typeof visit.propertyId === 'string' ? visit.propertyId.trim() : '';
  const title = typeof visit.title === 'string' ? visit.title : '';

  if (
    !visitsTable ||
    !tasksTable ||
    !templatesTable ||
    !autoAssignTable ||
    !visitId ||
    !propertyId ||
    !title
  ) {
    return skipped(visit, 'missing-fields');
  }

  if (typeof visit.autoAssignedTemplateId === 'string' && visit.autoAssignedTemplateId) {
    return skipped(visit, 'already-assigned');
  }

  const status = normalizeStatus(
    typeof visit.status === 'string' ? visit.status : '',
  );
  if (TERMINAL_VISIT_STATUSES.has(status)) {
    return skipped(visit, 'terminal-status');
  }

  const rule = pickMatchingAutoAssignRule(
    await queryRulesForProperty(autoAssignTable, propertyId),
    propertyId,
    title,
  );
  if (!rule) {
    return skipped(visit, 'no-matching-rule');
  }

  if (await visitHasTasks(tasksTable, visitId)) {
    return skipped(visit, 'visit-already-has-tasks');
  }

  const templateResult = await docClient.send(
    new GetCommand({
      TableName: templatesTable,
      Key: { id: rule.templateId },
    }),
  );
  const template = templateResult.Item as Record<string, unknown> | undefined;
  if (!template || template.active === false) {
    return skipped(visit, 'template-inactive');
  }

  const visitTypeId =
    typeof template.visitTypeId === 'string' && template.visitTypeId.trim()
      ? template.visitTypeId.trim()
      : typeof visit.visitTypeId === 'string'
        ? visit.visitTypeId
        : '';
  const teamId =
    typeof template.teamId === 'string' && template.teamId.trim()
      ? template.teamId.trim()
      : typeof visit.teamId === 'string'
        ? visit.teamId
        : '';
  const appliesToHourBank =
    typeof template.appliesToHourBank === 'boolean'
      ? template.appliesToHourBank
      : Boolean(visit.appliesToHourBank);
  const assignedUserId =
    typeof template.assignedUserId === 'string' && template.assignedUserId.trim()
      ? template.assignedUserId.trim()
      : typeof visit.assignedUserId === 'string'
        ? visit.assignedUserId
        : '';

  let updatedVisit = visit;
  try {
    const expressionValues: Record<string, unknown> = {
      ':templateId': rule.templateId,
      ':visitTypeId': visitTypeId,
      ':teamId': teamId,
      ':appliesToHourBank': appliesToHourBank,
      ':updatedAt': nowIso(),
    };
    let updateExpression =
      'SET autoAssignedTemplateId = :templateId, visitTypeId = :visitTypeId, teamId = :teamId, appliesToHourBank = :appliesToHourBank, updatedAt = :updatedAt';
    if (assignedUserId) {
      updateExpression += ', assignedUserId = :assignedUserId';
      expressionValues[':assignedUserId'] = assignedUserId;
    }

    const updated = await docClient.send(
      new UpdateCommand({
        TableName: visitsTable,
        Key: { id: visitId },
        ConditionExpression:
          'attribute_not_exists(autoAssignedTemplateId) OR autoAssignedTemplateId = :empty',
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: {
          ...expressionValues,
          ':empty': '',
        },
        ReturnValues: 'ALL_NEW',
      }),
    );
    updatedVisit = (updated.Attributes as Record<string, unknown>) ?? {
      ...visit,
      autoAssignedTemplateId: rule.templateId,
      visitTypeId,
      teamId,
      appliesToHourBank,
      ...(assignedUserId ? { assignedUserId } : {}),
    };
  } catch (error) {
    if (
      error instanceof ConditionalCheckFailedException ||
      (error &&
        typeof error === 'object' &&
        'name' in error &&
        error.name === 'ConditionalCheckFailedException')
    ) {
      return skipped(visit, 'already-assigned');
    }
    throw error;
  }

  const createdTasks = await createVisitTasksBulk(
    tasksTable,
    updatedVisit,
    templateTasksPayload(template),
  );

  return {
    applied: true,
    reason: 'applied',
    item: updatedVisit,
    createdTasks,
  };
};
