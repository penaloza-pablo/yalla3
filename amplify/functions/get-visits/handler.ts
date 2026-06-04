import {
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { buildHttpResponse, corsHeaders, isHttpRequest } from '../shared/dynamo-http';
import {
  getInclusiveDayCount,
  listDatesInRange,
  MAX_VISIT_DATE_RANGE_DAYS,
} from '../shared/date-range';
import {
  getTaskCountsForVisit,
  docClient,
  persistVisitStatusIfNeeded,
} from '../shared/visit-task-utils';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
};

const enrichWithTaskCounts = async (
  tasksTable: string,
  items: Record<string, unknown>[],
) =>
  Promise.all(
    items.map(async (item) => {
      const visitId = typeof item.id === 'string' ? item.id : '';
      if (!visitId) {
        return { ...item, taskCountTotal: 0, taskCountCompleted: 0 };
      }
      const { total, completed } = await getTaskCountsForVisit(
        tasksTable,
        visitId,
      );
      return {
        ...item,
        taskCountTotal: total,
        taskCountCompleted: completed,
      };
    }),
  );

const queryVisitsForDate = async (
  visitsTable: string,
  scheduledDate: string,
): Promise<Record<string, unknown>[]> => {
  const result = await docClient.send(
    new QueryCommand({
      TableName: visitsTable,
      IndexName: 'scheduledDate-scheduledStartTime-index',
      KeyConditionExpression: '#scheduledDate = :scheduledDate',
      ExpressionAttributeNames: { '#scheduledDate': 'scheduledDate' },
      ExpressionAttributeValues: { ':scheduledDate': scheduledDate },
    }),
  );
  return Promise.all(
    (result.Items ?? []).map((entry) =>
      persistVisitStatusIfNeeded(visitsTable, entry as Record<string, unknown>),
    ),
  );
};

export const handler = async (event: HttpEvent) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  const visitsTable = process.env.TABLE_NAME;
  const tasksTable = process.env.TASKS_TABLE;
  if (!visitsTable) {
    const message = 'TABLE_NAME is not configured.';
    return isHttp ? buildHttpResponse(500, { message }) : { message };
  }

  const params = event.queryStringParameters ?? {};
  const visitId = params.id?.trim();
  const scheduledDate = params.scheduledDate?.trim();
  const scheduledDateFrom =
    params.scheduledDateFrom?.trim() ?? scheduledDate ?? '';
  const scheduledDateTo =
    params.scheduledDateTo?.trim() ?? scheduledDate ?? '';
  const propertyId = params.propertyId?.trim();
  const includeTaskCounts = params.includeTaskCounts !== 'false';

  try {
    if (visitId) {
      const result = await docClient.send(
        new GetCommand({
          TableName: visitsTable,
          Key: { id: visitId },
        }),
      );
      if (!result.Item) {
        return buildHttpResponse(404, { message: 'Visit not found.' });
      }
      const normalized = await persistVisitStatusIfNeeded(
        visitsTable,
        result.Item as Record<string, unknown>,
      );
      let item: Record<string, unknown> = normalized;
      if (tasksTable && includeTaskCounts) {
        const [withCount] = await enrichWithTaskCounts(tasksTable, [normalized]);
        item = withCount;
      }
      return buildHttpResponse(200, { item });
    }

    if (scheduledDateFrom && scheduledDateTo) {
      const dates = listDatesInRange(scheduledDateFrom, scheduledDateTo);
      if (dates.length === 0) {
        return buildHttpResponse(400, {
          message: 'Invalid scheduledDateFrom or scheduledDateTo.',
        });
      }
      if (
        getInclusiveDayCount(scheduledDateFrom, scheduledDateTo) >
        MAX_VISIT_DATE_RANGE_DAYS
      ) {
        return buildHttpResponse(400, {
          message: `Date range cannot exceed ${MAX_VISIT_DATE_RANGE_DAYS} days.`,
        });
      }
      const perDay = await Promise.all(
        dates.map((date) => queryVisitsForDate(visitsTable, date)),
      );
      const merged = new Map<string, Record<string, unknown>>();
      perDay.flat().forEach((item) => {
        const id = typeof item.id === 'string' ? item.id : '';
        if (id) {
          merged.set(id, item);
        }
      });
      const items = Array.from(merged.values()).sort((a, b) => {
        const dateA =
          typeof a.scheduledDate === 'string' ? a.scheduledDate : '';
        const dateB =
          typeof b.scheduledDate === 'string' ? b.scheduledDate : '';
        if (dateA !== dateB) {
          return dateA.localeCompare(dateB);
        }
        const timeA =
          typeof a.scheduledStartTime === 'string' ? a.scheduledStartTime : '';
        const timeB =
          typeof b.scheduledStartTime === 'string' ? b.scheduledStartTime : '';
        return timeA.localeCompare(timeB);
      });
      const enriched =
        tasksTable && includeTaskCounts
          ? await enrichWithTaskCounts(tasksTable, items)
          : items;
      return buildHttpResponse(200, {
        items: enriched,
        count: enriched.length,
        scheduledDateFrom: dates[0],
        scheduledDateTo: dates[dates.length - 1],
      });
    }

    if (propertyId) {
      const result = await docClient.send(
        new QueryCommand({
          TableName: visitsTable,
          IndexName: 'propertyId-scheduledDate-index',
          KeyConditionExpression: '#propertyId = :propertyId',
          ExpressionAttributeNames: { '#propertyId': 'propertyId' },
          ExpressionAttributeValues: { ':propertyId': propertyId },
        }),
      );
      const items = await Promise.all(
        (result.Items ?? []).map((entry) =>
          persistVisitStatusIfNeeded(
            visitsTable,
            entry as Record<string, unknown>,
          ),
        ),
      );
      return buildHttpResponse(200, { items, count: items.length, propertyId });
    }

    return buildHttpResponse(400, {
      message:
        'Provide id, scheduledDate (or scheduledDateFrom and scheduledDateTo), or propertyId.',
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read visits.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
