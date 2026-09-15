import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { isCleaningVisitType } from './cleaning-plan';
import { addDaysToDateString, calendarDaysBetween } from './date-range';
import { normalizeStatus } from './dynamo-http';
import {
  isP2BuildingId,
  P2_REPORT_MEMBER_IDS,
} from './property-identity';
import { docClient, getTodayInMadrid } from './visit-task-utils';

export const JOB_SCHEDULER_ID_PREFIX = 'JSR';
export const UPCOMING_CLEANING_DATES_LIMIT = 3;
export const SCHEDULED_LOOKAHEAD_DAYS = 30;
const MAX_VISITS_SCANNED_PER_PROPERTY = 4000;

export type JobSchedulerRule = {
  id: string;
  propertyId: string;
  name: string;
  intervalDays: number;
  templateIds: string[];
  createTemplateId: string;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type JobSchedulerRuleStatus = {
  lastCompletedDate: string | null;
  lastCompletedVisitId: string | null;
  lastCompletedVisitTitle: string | null;
  daysSince: number | null;
  isOverdue: boolean;
  isScheduled: boolean;
  nextScheduledDate: string | null;
  dueDate: string | null;
};

export type VisitTemplateRef = {
  id: string;
  name: string;
  title: string;
};

const uniqueIds = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const id = String(value ?? '').trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    next.push(id);
  }
  return next;
};

export const normalizeIntervalDays = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 3650) {
    return 0;
  }
  return numeric;
};

export const mapJobSchedulerRule = (
  item: Record<string, unknown>,
): JobSchedulerRule => {
  const templateIds = uniqueIds(item.templateIds);
  const createTemplateId =
    String(item.createTemplateId ?? '').trim() || templateIds[0] || '';
  return {
    id: String(item.id ?? ''),
    propertyId: String(item.propertyId ?? ''),
    name: String(item.name ?? '').trim(),
    intervalDays: normalizeIntervalDays(item.intervalDays),
    templateIds:
      templateIds.length > 0
        ? templateIds
        : createTemplateId
          ? [createTemplateId]
          : [],
    createTemplateId,
    enabled: item.enabled !== false,
    createdAt:
      typeof item.createdAt === 'string' ? item.createdAt : undefined,
    updatedAt:
      typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
  };
};

export const propertyIdsForScheduler = (propertyId: string) => {
  const id = propertyId.trim();
  if (!id) {
    return [];
  }
  if (isP2BuildingId(id)) {
    return [...new Set([id, ...P2_REPORT_MEMBER_IDS])];
  }
  return [id];
};

const normalizeTitle = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

export const visitTitleMatchesTemplateText = (
  visitTitle: string,
  templateText: string,
) => {
  const title = normalizeTitle(visitTitle);
  const text = normalizeTitle(templateText);
  if (!title || !text) {
    return false;
  }
  if (title === text) {
    return true;
  }
  return title.startsWith(`${text} +`);
};

export const visitMatchesTemplate = (
  visit: Record<string, unknown>,
  template: VisitTemplateRef,
) => {
  const sourceId = String(visit.sourceTemplateId ?? '').trim();
  const autoId = String(visit.autoAssignedTemplateId ?? '').trim();
  if (sourceId === template.id || autoId === template.id) {
    return true;
  }
  const visitTitle = String(visit.title ?? '');
  return (
    visitTitleMatchesTemplateText(visitTitle, template.title) ||
    visitTitleMatchesTemplateText(visitTitle, template.name)
  );
};

export const visitMatchesRule = (
  visit: Record<string, unknown>,
  rule: JobSchedulerRule,
  templatesById: Map<string, VisitTemplateRef>,
) => {
  const templateIds = rule.templateIds.filter(Boolean);
  if (templateIds.length === 0) {
    return false;
  }
  const sourceId = String(visit.sourceTemplateId ?? '').trim();
  const autoId = String(visit.autoAssignedTemplateId ?? '').trim();
  if (
    (sourceId && templateIds.includes(sourceId)) ||
    (autoId && templateIds.includes(autoId))
  ) {
    return true;
  }
  return templateIds.some((templateId) => {
    const template = templatesById.get(templateId);
    if (!template) {
      return false;
    }
    return visitMatchesTemplate(visit, template);
  });
};

export const isoToMadridDate = (value?: string) => {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return '';
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
  }).format(parsed);
};

export const completionDateForVisit = (visit: Record<string, unknown>) => {
  const closedAt =
    typeof visit.closedAt === 'string' ? isoToMadridDate(visit.closedAt) : '';
  if (closedAt) {
    return closedAt;
  }
  return typeof visit.scheduledDate === 'string' ? visit.scheduledDate.trim() : '';
};

export const statusForRule = (
  rule: JobSchedulerRule,
  lastVisit: Record<string, unknown> | undefined,
  today: string,
  nextScheduledDate?: string | null,
): JobSchedulerRuleStatus => {
  const isScheduled = Boolean(nextScheduledDate);
  if (!lastVisit) {
    return {
      lastCompletedDate: null,
      lastCompletedVisitId: null,
      lastCompletedVisitTitle: null,
      daysSince: null,
      isOverdue: true,
      isScheduled,
      nextScheduledDate: nextScheduledDate ?? null,
      dueDate: today,
    };
  }
  const lastCompletedDate = completionDateForVisit(lastVisit);
  const daysSince = lastCompletedDate
    ? calendarDaysBetween(lastCompletedDate, today)
    : null;
  const dueDate = lastCompletedDate
    ? addDaysToDateString(lastCompletedDate, rule.intervalDays)
    : today;
  return {
    lastCompletedDate: lastCompletedDate || null,
    lastCompletedVisitId:
      typeof lastVisit.id === 'string' ? lastVisit.id : null,
    lastCompletedVisitTitle:
      typeof lastVisit.title === 'string' && lastVisit.title.trim()
        ? lastVisit.title
        : null,
    daysSince,
    isOverdue:
      daysSince === null ? true : daysSince >= rule.intervalDays,
    isScheduled,
    nextScheduledDate: nextScheduledDate ?? null,
    dueDate,
  };
};

const queryVisitsForProperty = async (
  visitsTable: string,
  propertyId: string,
) => {
  const items: Record<string, unknown>[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: visitsTable,
        IndexName: 'propertyId-scheduledDate-index',
        KeyConditionExpression: '#propertyId = :propertyId',
        ExpressionAttributeNames: { '#propertyId': 'propertyId' },
        ExpressionAttributeValues: { ':propertyId': propertyId },
        ScanIndexForward: false,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    items.push(...((result.Items as Record<string, unknown>[]) ?? []));
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
    if (items.length >= MAX_VISITS_SCANNED_PER_PROPERTY) {
      break;
    }
  } while (lastEvaluatedKey);
  return items;
};

const compareVisitsNewestFirst = (
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) => {
  const dateA =
    typeof left.scheduledDate === 'string' ? left.scheduledDate : '';
  const dateB =
    typeof right.scheduledDate === 'string' ? right.scheduledDate : '';
  if (dateA !== dateB) {
    return dateB.localeCompare(dateA);
  }
  const closedA =
    typeof left.closedAt === 'string' ? left.closedAt : '';
  const closedB =
    typeof right.closedAt === 'string' ? right.closedAt : '';
  return closedB.localeCompare(closedA);
};

export const loadVisitTemplatesById = async (templatesTable: string) => {
  const items: Record<string, unknown>[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: templatesTable,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    items.push(...((result.Items as Record<string, unknown>[]) ?? []));
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  const templatesById = new Map<string, VisitTemplateRef>();
  for (const item of items) {
    const id = String(item.id ?? '').trim();
    if (!id) {
      continue;
    }
    templatesById.set(id, {
      id,
      name: String(item.name ?? ''),
      title: String(item.title ?? ''),
    });
  }
  return templatesById;
};

export const collectSchedulerPropertyStatus = async (
  visitsTable: string,
  propertyId: string,
  rules: JobSchedulerRule[],
  templatesById: Map<string, VisitTemplateRef>,
  today = getTodayInMadrid(),
) => {
  const propertyIds = propertyIdsForScheduler(propertyId);
  const perProperty = await Promise.all(
    propertyIds.map((id) => queryVisitsForProperty(visitsTable, id)),
  );
  const visits = perProperty.flat().sort(compareVisitsNewestFirst);

  const remaining = new Set(rules.map((rule) => rule.id));
  const lastByRule = new Map<string, Record<string, unknown>>();
  const nextScheduledByRule = new Map<string, string>();
  const upcomingSet = new Set<string>();
  const horizon = addDaysToDateString(today, SCHEDULED_LOOKAHEAD_DAYS);

  for (const visit of visits) {
    const scheduledDate =
      typeof visit.scheduledDate === 'string' ? visit.scheduledDate.trim() : '';
    const status = normalizeStatus(
      typeof visit.status === 'string' ? visit.status : '',
    );
    if (
      scheduledDate >= today &&
      status !== 'CANCELLED' &&
      isCleaningVisitType(visit.visitTypeId)
    ) {
      upcomingSet.add(scheduledDate);
    }
    const isOpen = status !== 'COMPLETED' && status !== 'CANCELLED';
    if (
      isOpen &&
      scheduledDate > today &&
      scheduledDate <= horizon
    ) {
      for (const rule of rules) {
        if (!visitMatchesRule(visit, rule, templatesById)) {
          continue;
        }
        const current = nextScheduledByRule.get(rule.id);
        if (!current || scheduledDate < current) {
          nextScheduledByRule.set(rule.id, scheduledDate);
        }
      }
    }
    if (status !== 'COMPLETED' || remaining.size === 0) {
      continue;
    }
    for (const rule of rules) {
      if (!remaining.has(rule.id)) {
        continue;
      }
      if (visitMatchesRule(visit, rule, templatesById)) {
        lastByRule.set(rule.id, visit);
        remaining.delete(rule.id);
      }
    }
  }

  const statuses: Record<string, JobSchedulerRuleStatus> = {};
  for (const rule of rules) {
    statuses[rule.id] = statusForRule(
      rule,
      lastByRule.get(rule.id),
      today,
      nextScheduledByRule.get(rule.id) ?? null,
    );
  }

  return {
    statuses,
    upcomingCleaningDates: [...upcomingSet]
      .sort((left, right) => left.localeCompare(right))
      .slice(0, UPCOMING_CLEANING_DATES_LIMIT),
  };
};
