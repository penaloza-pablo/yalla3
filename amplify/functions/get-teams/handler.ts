import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
} from '../shared/dynamo-http';
import { docClient } from '../shared/visit-task-utils';

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
}) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders };
  }

  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  try {
    let lastEvaluatedKey: Record<string, unknown> | undefined;
    const allItems: Record<string, unknown>[] = [];

    do {
      const result = await docClient.send(
        new ScanCommand({
          TableName: tableName,
          ExclusiveStartKey: lastEvaluatedKey,
        }),
      );
      allItems.push(...((result.Items as Record<string, unknown>[]) ?? []));
      lastEvaluatedKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (lastEvaluatedKey);

    const items = allItems.filter((entry) => entry.active !== false);
    return buildHttpResponse(200, { items, count: items.length });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read teams.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
