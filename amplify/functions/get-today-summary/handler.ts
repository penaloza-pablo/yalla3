import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { addDaysToDateString } from '../shared/date-range';
import { getPlanByDate, scanAllItems } from '../shared/cleaning-plan';
import {
  countVisibleBillingWarnings,
  getMonthRecord,
  listVisibleMonthIds,
} from '../shared/cleaning-billing';
import {
  docClient,
  getTodayInMadrid,
  resolveVisitStatus,
} from '../shared/visit-task-utils';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
};

const CLEANING_VISIT_TYPE_ID =
  process.env.CLEANING_VISIT_TYPE_ID || 'visit_type_cleaning';
const MAINTENANCE_VISIT_TYPE_IDS = (
  process.env.MAINTENANCE_VISIT_TYPE_IDS ||
  'visit_type_maintenance,visit_type_deep_property_check,visit_type_property_check,visit_type_fixings,visit_type_emergency'
)
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const itemField = (item: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (item[key] !== undefined && item[key] !== null) {
      return item[key];
    }
  }
  return undefined;
};

const isClosedReview = (item: Record<string, unknown>) => {
  const status = asString(itemField(item, ['Status', 'status'])).toLowerCase();
  const workflowStep = asString(
    itemField(item, ['WorkflowStep', 'workflowStep']),
  ).toLowerCase();
  const workflowStepIndex = asNumber(
    itemField(item, ['WorkflowStepIndex', 'workflowStepIndex']),
  );
  if (status.startsWith('closed') || status.includes('5 stars')) {
    return true;
  }
  if (workflowStep === 'finished' || workflowStepIndex === 6) {
    return true;
  }
  return false;
};

type VisitCounts = {
  currentCompleted: number;
  currentTotal: number;
  previousOpen: number;
};

const emptyVisitCounts = (): VisitCounts => ({
  currentCompleted: 0,
  currentTotal: 0,
  previousOpen: 0,
});

const toDateOnly = (value: unknown) => asString(value).slice(0, 10);

const scanProjected = async (
  tableName: string,
  projection: {
    expression: string;
    names?: Record<string, string>;
  },
) => {
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const items: Record<string, unknown>[] = [];

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: projection.expression,
        ExpressionAttributeNames: projection.names,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    items.push(...((result.Items as Record<string, unknown>[]) ?? []));
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  return items;
};

const queryAllByStatus = async (tableName: string, status: string) => {
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const items: Record<string, unknown>[] = [];

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'status-createdAt-index',
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status },
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    items.push(...((result.Items as Record<string, unknown>[]) ?? []));
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  return items;
};

const countUnassignedPending = async (tableName: string) => {
  const items = await queryAllByStatus(tableName, 'UNASSIGNED');
  return items.filter((task) => !task.visitId).length;
};

const countVisitsForTypes = (
  items: Record<string, unknown>[],
  visitTypeIds: Set<string>,
  today: string,
): VisitCounts => {
  const counts = emptyVisitCounts();
  for (const item of items) {
    const typeId = asString(
      itemField(item, ['visitTypeId', 'visit_type_id', 'VisitTypeId']),
    );
    if (!visitTypeIds.has(typeId)) {
      continue;
    }
    const scheduledDate = toDateOnly(
      itemField(item, ['scheduledDate', 'scheduled_date']),
    );
    const status = resolveVisitStatus({
      status: asString(itemField(item, ['status', 'Status'])),
      scheduledDate,
    });
    if (status === 'CANCELLED') {
      continue;
    }
    if (scheduledDate === today) {
      counts.currentTotal += 1;
      if (status === 'COMPLETED') {
        counts.currentCompleted += 1;
      }
      continue;
    }
    if (scheduledDate && scheduledDate < today && status !== 'COMPLETED') {
      counts.previousOpen += 1;
    }
  }
  return counts;
};

export const handler = async (event: HttpEvent) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) {
      return denied;
    }
  }

  const visitsTable = process.env.VISITS_TABLE;
  const tasksTable = process.env.TASKS_TABLE;
  const plansTable = process.env.CLEANING_PLANS_TABLE;
  const reviewsTable = process.env.REVIEWS_TABLE;
  const inventoryTable = process.env.INVENTORY_TABLE;
  const cleaningBillingTable = process.env.CLEANING_BILLING_TABLE;
  const detailsTable = process.env.PROPERTY_CLEANING_DETAILS_TABLE || '';
  if (
    !visitsTable ||
    !tasksTable ||
    !plansTable ||
    !reviewsTable ||
    !inventoryTable ||
    !cleaningBillingTable
  ) {
    return buildHttpResponse(500, {
      message:
        'VISITS_TABLE, TASKS_TABLE, CLEANING_PLANS_TABLE, REVIEWS_TABLE, INVENTORY_TABLE, or CLEANING_BILLING_TABLE is not configured.',
    });
  }

  const today = getTodayInMadrid();
  const tomorrow = addDaysToDateString(today, 1);
  const monthIds = listVisibleMonthIds();

  try {
    const [
      visits,
      todayPlan,
      tomorrowPlan,
      reviews,
      inventory,
      detailItems,
      planItems,
      storedMonths,
      unassignedPending,
    ] = await Promise.all([
      scanProjected(visitsTable, {
        expression: '#id, visitTypeId, scheduledDate, #status, propertyId',
        names: { '#id': 'id', '#status': 'status' },
      }),
      getPlanByDate(plansTable, today),
      getPlanByDate(plansTable, tomorrow),
      scanProjected(reviewsTable, {
        expression:
          'Rating, rating, #status, WorkflowStep, workflowStep, WorkflowStepIndex, workflowStepIndex',
        names: { '#status': 'Status' },
      }),
      scanProjected(inventoryTable, {
        expression: '#status',
        names: { '#status': 'Status' },
      }),
      detailsTable ? scanAllItems(detailsTable) : Promise.resolve([]),
      scanAllItems(plansTable),
      Promise.all(
        monthIds.map(
          async (monthId) =>
            [monthId, await getMonthRecord(cleaningBillingTable, monthId)] as const,
        ),
      ),
      countUnassignedPending(tasksTable),
    ]);

    const previousOpen = countVisibleBillingWarnings(
      visits,
      detailItems,
      planItems,
      new Map(storedMonths),
    );

    const cleaning = countVisitsForTypes(
      visits,
      new Set([CLEANING_VISIT_TYPE_ID]),
      today,
    );
    const maintenance = countVisitsForTypes(
      visits,
      new Set(MAINTENANCE_VISIT_TYPE_IDS),
      today,
    );

    const planningReady =
      (asString(todayPlan?.status).toUpperCase() === 'READY' ? 1 : 0) +
      (asString(tomorrowPlan?.status).toUpperCase() === 'READY' ? 1 : 0);

    let reviewsNeedAttention = 0;
    for (const item of reviews) {
      const rating = asNumber(itemField(item, ['Rating', 'rating']));
      if (rating > 0 && rating < 5 && !isClosedReview(item)) {
        reviewsNeedAttention += 1;
      }
    }

    let waitingDelivery = 0;
    let reorder = 0;
    let lowStock = 0;
    for (const item of inventory) {
      const status = asString(itemField(item, ['Status', 'status']));
      if (status === 'Waiting Delivery') {
        waitingDelivery += 1;
      } else if (status === 'Reorder') {
        reorder += 1;
      } else if (status === 'Low Stock') {
        lowStock += 1;
      }
    }

    return buildHttpResponse(200, {
      date: today,
      cleaning: {
        planningReady,
        planningTotal: 2,
        currentCompleted: cleaning.currentCompleted,
        currentTotal: cleaning.currentTotal,
        previousOpen,
      },
      maintenance: {
        currentCompleted: maintenance.currentCompleted,
        currentTotal: maintenance.currentTotal,
        previousOpen: maintenance.previousOpen,
      },
      reviews: {
        needsAttention: reviewsNeedAttention,
      },
      unassignedTasks: {
        pending: unassignedPending,
      },
      inventory: {
        waitingDelivery,
        reorder,
        lowStock,
      },
    });
  } catch (error) {
    console.error('Failed to load today summary', error);
    return buildHttpResponse(500, {
      message: 'Failed to load today summary.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
