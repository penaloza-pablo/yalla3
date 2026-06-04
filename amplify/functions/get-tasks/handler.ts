import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
  normalizeStatus,
} from '../shared/dynamo-http';
import { docClient } from '../shared/visit-task-utils';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
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

const queryByVisitId = async (tableName: string, visitId: string) => {
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  const items: Record<string, unknown>[] = [];

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'visitId-createdAt-index',
        KeyConditionExpression: '#visitId = :visitId',
        ExpressionAttributeNames: { '#visitId': 'visitId' },
        ExpressionAttributeValues: { ':visitId': visitId },
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

  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const params = event.queryStringParameters ?? {};
  const taskId = params.id?.trim();
  const visitId = params.visitId?.trim();
  const pool = params.pool?.trim();

  try {
    if (taskId) {
      const result = await docClient.send(
        new GetCommand({ TableName: tableName, Key: { id: taskId } }),
      );
      if (!result.Item) {
        return buildHttpResponse(404, { message: 'Task not found.' });
      }
      return buildHttpResponse(200, { item: result.Item });
    }

    if (visitId) {
      const items = await queryByVisitId(tableName, visitId);
      return buildHttpResponse(200, { items, count: items.length, visitId });
    }

    if (pool === 'unassigned') {
      const unassigned = await queryAllByStatus(tableName, 'UNASSIGNED');
      const dismissed = await queryAllByStatus(tableName, 'DISMISS');
      const items = [...unassigned, ...dismissed]
        .filter((task) => !task.visitId)
        .sort((a, b) => {
          const aDate =
            typeof a.createdAt === 'string' ? a.createdAt : '';
          const bDate =
            typeof b.createdAt === 'string' ? b.createdAt : '';
          return bDate.localeCompare(aDate);
        });
      return buildHttpResponse(200, { items, count: items.length, pool });
    }

    const status = normalizeStatus(params.status);
    if (status) {
      const items = await queryAllByStatus(tableName, status);
      return buildHttpResponse(200, { items, count: items.length, status });
    }

    return buildHttpResponse(400, {
      message: 'Provide id, visitId, pool=unassigned, or status.',
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read tasks.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
