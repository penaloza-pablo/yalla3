import { GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { buildHttpResponse, corsHeaders, isHttpRequest, rejectIfUnauthenticated } from '../shared/dynamo-http';
import { docClient } from '../shared/visit-task-utils';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
};

const filterActive = (items: Record<string, unknown>[], includeInactive: boolean) => {
  if (includeInactive) {
    return items;
  }
  return items.filter((item) => item.active !== false);
};

const itemMatchesProperty = (
  item: Record<string, unknown>,
  propertyId: string,
) => {
  if (String(item.propertyId ?? '') === propertyId) {
    return true;
  }
  const propertyIds = item.propertyIds;
  return (
    Array.isArray(propertyIds) &&
    propertyIds.some((value) => String(value) === propertyId)
  );
};

const scanAllTemplates = async (tableName: string) => {
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
  if (!tableName) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const params = event.queryStringParameters ?? {};
  const id = params.id?.trim();
  const propertyId = params.propertyId?.trim();
  const includeInactive = params.includeInactive === 'true';

  try {
    if (id) {
      const result = await docClient.send(
        new GetCommand({ TableName: tableName, Key: { id } }),
      );
      if (!result.Item) {
        return buildHttpResponse(404, { message: 'Template not found.' });
      }
      return buildHttpResponse(200, { item: result.Item });
    }

    if (propertyId) {
      let items: Record<string, unknown>[] = [];
      try {
        let lastEvaluatedKey: Record<string, unknown> | undefined;
        do {
          const result = await docClient.send(
            new QueryCommand({
              TableName: tableName,
              IndexName: 'propertyId-createdAt-index',
              KeyConditionExpression: '#propertyId = :propertyId',
              ExpressionAttributeNames: { '#propertyId': 'propertyId' },
              ExpressionAttributeValues: { ':propertyId': propertyId },
              ExclusiveStartKey: lastEvaluatedKey,
            }),
          );
          items.push(...((result.Items as Record<string, unknown>[]) ?? []));
          lastEvaluatedKey = result.LastEvaluatedKey as
            | Record<string, unknown>
            | undefined;
        } while (lastEvaluatedKey);
      } catch (error) {
        console.error(
          'Visit templates GSI query failed; falling back to scan',
          error,
        );
      }

      if (items.length === 0) {
        items = (await scanAllTemplates(tableName)).filter((item) =>
          itemMatchesProperty(item, propertyId),
        );
      }

      const activeItems = filterActive(items, includeInactive);
      return buildHttpResponse(200, {
        items: activeItems,
        count: activeItems.length,
        propertyId,
      });
    }

    const items = await scanAllTemplates(tableName);
    const activeItems = filterActive(items, includeInactive);
    return buildHttpResponse(200, { items: activeItems, count: activeItems.length });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read visit templates.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
