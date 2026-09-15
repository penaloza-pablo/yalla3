import { GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import {
  collectSchedulerPropertyStatus,
  loadVisitTemplatesById,
  mapJobSchedulerRule,
  type JobSchedulerRule,
  type JobSchedulerRuleStatus,
} from '../shared/job-scheduler';
import { docClient, getTodayInMadrid } from '../shared/visit-task-utils';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
};

const scanAll = async (tableName: string) => {
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const items: Record<string, unknown>[] = [];
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
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

export const handler = async (event: HttpEvent) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) return denied;
  }

  const tableName = process.env.TABLE_NAME;
  const visitsTable = process.env.VISITS_TABLE;
  const templatesTable = process.env.TEMPLATES_TABLE;
  if (!tableName) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const id = event.queryStringParameters?.id?.trim();
  const includeStatus = event.queryStringParameters?.includeStatus !== 'false';

  try {
    if (id) {
      const result = await docClient.send(
        new GetCommand({ TableName: tableName, Key: { id } }),
      );
      if (!result.Item) {
        return buildHttpResponse(404, { message: 'Job scheduler rule not found.' });
      }
      return buildHttpResponse(200, {
        item: mapJobSchedulerRule(result.Item as Record<string, unknown>),
      });
    }

    const rules = (await scanAll(tableName))
      .map((item) => mapJobSchedulerRule(item))
      .filter((rule) => rule.id && rule.propertyId)
      .sort((left, right) =>
        String(left.createdAt ?? '').localeCompare(String(right.createdAt ?? '')),
      );

    if (!includeStatus || !visitsTable || !templatesTable) {
      return buildHttpResponse(200, {
        items: rules,
        count: rules.length,
        today: getTodayInMadrid(),
      });
    }

    const templatesById = await loadVisitTemplatesById(templatesTable);
    const today = getTodayInMadrid();
    const rulesByProperty = new Map<string, JobSchedulerRule[]>();
    for (const rule of rules) {
      const current = rulesByProperty.get(rule.propertyId) ?? [];
      current.push(rule);
      rulesByProperty.set(rule.propertyId, current);
    }

    const statuses: Record<string, JobSchedulerRuleStatus> = {};
    const upcomingCleaningDates: Record<string, string[]> = {};
    const propertyEntries = [...rulesByProperty.entries()];
    const results: Array<{
      propertyId: string;
      result: Awaited<ReturnType<typeof collectSchedulerPropertyStatus>>;
    }> = [];
    const batchSize = 8;
    for (let index = 0; index < propertyEntries.length; index += batchSize) {
      const batch = propertyEntries.slice(index, index + batchSize);
      const batchResults = await Promise.all(
        batch.map(([propertyId, propertyRules]) =>
          collectSchedulerPropertyStatus(
            visitsTable,
            propertyId,
            propertyRules,
            templatesById,
            today,
          ).then((result) => ({ propertyId, result })),
        ),
      );
      results.push(...batchResults);
    }
    for (const { propertyId, result } of results) {
      upcomingCleaningDates[propertyId] = result.upcomingCleaningDates;
      Object.assign(statuses, result.statuses);
    }

    return buildHttpResponse(200, {
      items: rules,
      count: rules.length,
      today,
      statuses,
      upcomingCleaningDates,
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read job scheduler rules.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
