import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
} from '../shared/dynamo-http';
import { docClient } from '../shared/visit-task-utils';

type HttpEvent = {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
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

  const teamId = event.queryStringParameters?.teamId?.trim();

  try {
    let items: Record<string, unknown>[] = [];

    if (teamId) {
      let lastEvaluatedKey: Record<string, unknown> | undefined;
      do {
        const result = await docClient.send(
          new QueryCommand({
            TableName: tableName,
            IndexName: 'teamId-name-index',
            KeyConditionExpression: '#teamId = :teamId',
            ExpressionAttributeNames: { '#teamId': 'teamId' },
            ExpressionAttributeValues: { ':teamId': teamId },
            ExclusiveStartKey: lastEvaluatedKey,
          }),
        );
        items.push(...((result.Items as Record<string, unknown>[]) ?? []));
        lastEvaluatedKey = result.LastEvaluatedKey as
          | Record<string, unknown>
          | undefined;
      } while (lastEvaluatedKey);
    } else {
      let lastEvaluatedKey: Record<string, unknown> | undefined;
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
    }

    const activeItems = items.filter((entry) => entry.active !== false);
    return buildHttpResponse(200, {
      items: activeItems,
      count: activeItems.length,
      teamId: teamId ?? null,
    });
  } catch (error) {
    return buildHttpResponse(500, {
      message: 'Failed to read users.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
