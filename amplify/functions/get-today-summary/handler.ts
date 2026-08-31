import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { addDaysToDateString } from '../shared/date-range';
import { getPlanByDate, scanAllItems } from '../shared/cleaning-plan';
import {
  getTodayInMadrid,
  resolveVisitStatus,
} from '../shared/visit-task-utils';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
};

const CLEANING_VISIT_TYPE_ID =
  process.env.CLEANING_VISIT_TYPE_ID || 'visit_type_cleaning';
const MAINTENANCE_VISIT_TYPE_ID =
  process.env.MAINTENANCE_VISIT_TYPE_ID || 'visit_type_maintenance';

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

const countVisitsForType = (
  items: Record<string, unknown>[],
  visitTypeId: string,
  today: string,
): VisitCounts => {
  const counts = emptyVisitCounts();
  for (const item of items) {
    const typeId = asString(item.visitTypeId);
    if (typeId !== visitTypeId) {
      continue;
    }
    const scheduledDate = asString(item.scheduledDate);
    const status = resolveVisitStatus({
      status: asString(item.status),
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
  const plansTable = process.env.CLEANING_PLANS_TABLE;
  const reviewsTable = process.env.REVIEWS_TABLE;
  const inventoryTable = process.env.INVENTORY_TABLE;
  if (!visitsTable || !plansTable || !reviewsTable || !inventoryTable) {
    return buildHttpResponse(500, {
      message:
        'VISITS_TABLE, CLEANING_PLANS_TABLE, REVIEWS_TABLE, or INVENTORY_TABLE is not configured.',
    });
  }

  const today = getTodayInMadrid();
  const tomorrow = addDaysToDateString(today, 1);

  try {
    const [visits, todayPlan, tomorrowPlan, reviews, inventory] =
      await Promise.all([
        scanAllItems(visitsTable),
        getPlanByDate(plansTable, today),
        getPlanByDate(plansTable, tomorrow),
        scanAllItems(reviewsTable),
        scanAllItems(inventoryTable),
      ]);

    const cleaning = countVisitsForType(visits, CLEANING_VISIT_TYPE_ID, today);
    const maintenance = countVisitsForType(
      visits,
      MAINTENANCE_VISIT_TYPE_ID,
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
        previousOpen: cleaning.previousOpen,
      },
      maintenance: {
        currentCompleted: maintenance.currentCompleted,
        currentTotal: maintenance.currentTotal,
        previousOpen: maintenance.previousOpen,
      },
      reviews: {
        needsAttention: reviewsNeedAttention,
      },
      inventory: {
        waitingDelivery,
        reorder,
        lowStock,
      },
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to load today summary.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
