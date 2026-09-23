import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  rejectIfUnauthenticated,
} from '../shared/dynamo-http';
import { asString } from '../shared/maintenance-billing';
import {
  caseEvents,
  closeExpiredCase,
  getCase,
  loadProperties,
  loadSettings,
  loadVisitCost,
  matchesCaseQuery,
  publicCase,
  queryByPartition,
  resolveCaseDestination,
} from '../shared/case-records';
import { docClient } from '../shared/visit-task-utils';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
};

const asMoney = (value: unknown) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
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

  const casesTable = process.env.CASES_TABLE;
  const eventsTable = process.env.CASE_EVENTS_TABLE;
  if (!casesTable || !eventsTable) {
    return buildHttpResponse(500, {
      message: 'CASES_TABLE or CASE_EVENTS_TABLE is not configured.',
    });
  }

  const params = event.queryStringParameters ?? {};
  const caseId = params.id?.trim();
  const query = params.q?.trim() ?? '';
  const propertyId = params.propertyId?.trim() ?? '';
  const includeClosed = params.includeClosed === '1' || params.includeClosed === 'true';

  try {
    if (caseId) {
      const found = await getCase(casesTable, caseId);
      if (!found) {
        return buildHttpResponse(404, { message: 'Case not found.' });
      }
      const item = await closeExpiredCase(casesTable, found);
      const detail = await buildDetail(item);
      return buildHttpResponse(200, detail);
    }

    const [known, quarantine] = await Promise.all([
      queryByPartition({
        tableName: casesTable,
        indexName: 'status-updatedAt-index',
        partitionName: 'status',
        partitionValue: 'KNOWN',
      }),
      queryByPartition({
        tableName: casesTable,
        indexName: 'status-updatedAt-index',
        partitionName: 'status',
        partitionValue: 'QUARANTINE',
      }),
    ]);
    const open = [];
    for (const entry of [...known, ...quarantine]) {
      const current = await closeExpiredCase(casesTable, entry);
      if (asString(current.status) === 'CLOSED') {
        continue;
      }
      if (matchesCaseQuery(current, query, propertyId)) {
        open.push(publicCase(current));
      }
    }

    let closed: ReturnType<typeof publicCase>[] = [];
    if (includeClosed) {
      const closedItems = await queryByPartition({
        tableName: casesTable,
        indexName: 'status-updatedAt-index',
        partitionName: 'status',
        partitionValue: 'CLOSED',
      });
      closed = closedItems
        .filter((entry) => matchesCaseQuery(entry, query, propertyId))
        .map(publicCase);
    }

    return buildHttpResponse(200, {
      items: open,
      closed,
      count: open.length,
      closedCount: closed.length,
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read cases.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};

const buildDetail = async (item: Record<string, unknown>) => {
  const eventsTable = process.env.CASE_EVENTS_TABLE ?? '';
  const visitsTable = process.env.VISITS_TABLE ?? '';
  const movementsTable = process.env.MOVEMENTS_TABLE ?? '';
  const propertiesTable = process.env.PROPERTIES_TABLE ?? '';
  const billingTable = process.env.BILLING_TABLE;
  const settingsTable = process.env.SETTINGS_TABLE;
  const published = publicCase(item);
  const [events, properties, settings] = await Promise.all([
    caseEvents(eventsTable, published.id),
    propertiesTable ? loadProperties(propertiesTable) : Promise.resolve([]),
    loadSettings(settingsTable),
  ]);
  const destination = resolveCaseDestination(published.propertyId, properties);
  const months = new Map<string, Record<string, unknown> | undefined>();
  const visits = [];
  for (const visitId of published.visitIds) {
    if (!visitsTable) {
      continue;
    }
    const result = await docClient.send(
      new GetCommand({ TableName: visitsTable, Key: { id: visitId } }),
    );
    if (!result.Item) {
      continue;
    }
    visits.push(
      await loadVisitCost({
        visit: result.Item as Record<string, unknown>,
        billingTable,
        settingsTable,
        settings,
        months,
      }),
    );
  }
  const movements = [];
  for (const movementId of published.movementIds) {
    if (!movementsTable) {
      continue;
    }
    const result = await docClient.send(
      new GetCommand({ TableName: movementsTable, Key: { id: movementId } }),
    );
    const movement = result.Item as Record<string, unknown> | undefined;
    if (!movement) {
      continue;
    }
    movements.push({
      id: asString(movement.id),
      description: asString(movement.description),
      date: asString(movement.date),
      amount: asMoney(movement.amount),
      totalAmount: asMoney(movement.totalAmount ?? movement.amount),
      status: asString(movement.status),
      kind: asString(movement.kind),
    });
  }
  const visitTotal = visits.reduce(
    (sum, visit) => sum + (visit.includedInMaintenance ? visit.price ?? 0 : 0),
    0,
  );
  const expenseTotal = movements.reduce(
    (sum, movement) =>
      movement.kind === 'income' ? sum : sum + movement.totalAmount,
    0,
  );
  return {
    item: published,
    events: events.map((entry) => ({
      id: asString(entry.id),
      caseId: asString(entry.caseId),
      type: asString(entry.type),
      body: asString(entry.body),
      createdAt: asString(entry.createdAt),
      createdBy: asString(entry.createdBy) || undefined,
    })),
    visits,
    movements,
    cost: {
      visits: Math.round(visitTotal * 100) / 100,
      expenses: Math.round(expenseTotal * 100) / 100,
      total: Math.round((visitTotal + expenseTotal) * 100) / 100,
    },
    scopePropertyIds: destination?.memberIds ?? [published.propertyId],
  };
};
