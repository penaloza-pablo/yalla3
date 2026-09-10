import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { rejectIfUnauthenticated } from '../shared/cognito-auth';
import { ACTIVITY_LOG_PK } from '../shared/activity-log';
import {
  buildHttpResponse,
  corsHeaders,
  isHttpRequest,
} from '../shared/dynamo-http';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const QUERY_PAGE_SIZE = 100;
const MAX_EXAMINED_ITEMS = 2000;

const parseLimit = (value?: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 200;
  }
  return Math.min(Math.trunc(parsed), 500);
};

const parseExclusiveStartKey = (value?: string) => {
  if (!value) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed;
  } catch {
    return undefined;
  }
};

const parseFeatures = (value?: string) =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const asString = (value: unknown) => (typeof value === 'string' ? value : '');

type IndexMode = 'pk' | 'feature' | 'userEmail';

type MappedLog = {
  id: string;
  userEmail: string;
  feature: string;
  summary: string;
  createdAt: string;
  action?: string;
  entityId?: string;
  entityName?: string;
  pk: string;
  sk: string;
};

const mapItem = (item: Record<string, unknown>): MappedLog => ({
  id: asString(item.id),
  userEmail: asString(item.userEmail) || 'system',
  feature: asString(item.feature),
  summary: asString(item.summary),
  createdAt: asString(item.createdAt),
  action: asString(item.action) || undefined,
  entityId: asString(item.entityId) || undefined,
  entityName: asString(item.entityName) || undefined,
  pk: asString(item.pk) || ACTIVITY_LOG_PK,
  sk: asString(item.sk),
});

const publicItem = (item: MappedLog) => ({
  id: item.id,
  userEmail: item.userEmail,
  feature: item.feature,
  summary: item.summary,
  createdAt: item.createdAt,
  action: item.action,
  entityId: item.entityId,
  entityName: item.entityName,
});

const cursorForItem = (item: MappedLog, mode: IndexMode) => {
  if (!item.sk) {
    return undefined;
  }
  if (mode === 'feature') {
    return { pk: item.pk, sk: item.sk, feature: item.feature };
  }
  if (mode === 'userEmail') {
    return { pk: item.pk, sk: item.sk, userEmail: item.userEmail };
  }
  return { pk: item.pk, sk: item.sk };
};

const matchesSearch = (item: MappedLog, query: string) => {
  if (!query) {
    return true;
  }
  const haystack = [
    item.userEmail,
    item.feature,
    item.summary,
    item.action ?? '',
    item.entityName ?? '',
    item.entityId ?? '',
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
};

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  queryStringParameters?: Record<string, string | undefined>;
}) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
    };
  }

  if (isHttp) {
    const denied = await rejectIfUnauthenticated(event);
    if (denied) return denied;
  }

  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    return buildHttpResponse(500, { message: 'TABLE_NAME is not configured.' });
  }

  const query = event.queryStringParameters ?? {};
  const limit = parseLimit(query.limit);
  const search = (query.q ?? query.search ?? '').trim().toLowerCase().slice(0, 80);
  const from = (query.from ?? '').trim();
  const userEmail = (query.userEmail ?? '').trim();
  const features = parseFeatures(query.features || query.feature);
  let exclusiveStartKey = parseExclusiveStartKey(query.exclusiveStartKey);

  const useFeatureIndex = features.length === 1 && !userEmail;
  const useUserIndex = !useFeatureIndex && Boolean(userEmail);
  const indexMode: IndexMode = useFeatureIndex
    ? 'feature'
    : useUserIndex
      ? 'userEmail'
      : 'pk';

  const keyNames: Record<string, string> = {};
  const keyValues: Record<string, string> = {};
  let keyCondition = '';

  if (useFeatureIndex) {
    keyNames['#feature'] = 'feature';
    keyValues[':feature'] = features[0];
    keyCondition = '#feature = :feature';
  } else if (useUserIndex) {
    keyNames['#userEmail'] = 'userEmail';
    keyValues[':userEmail'] = userEmail;
    keyCondition = '#userEmail = :userEmail';
  } else {
    keyNames['#pk'] = 'pk';
    keyValues[':pk'] = ACTIVITY_LOG_PK;
    keyCondition = '#pk = :pk';
  }

  if (from) {
    keyNames['#sk'] = 'sk';
    keyValues[':from'] = from;
    keyCondition += ' AND #sk >= :from';
  }

  try {
    const matched: MappedLog[] = [];
    let examined = 0;
    let lastEvaluatedKey: Record<string, unknown> | null = null;
    let exhausted = false;

    while (matched.length < limit && examined < MAX_EXAMINED_ITEMS) {
      const result = await client.send(
        new QueryCommand({
          TableName: tableName,
          ...(useFeatureIndex
            ? { IndexName: 'feature-sk-index' }
            : useUserIndex
              ? { IndexName: 'userEmail-sk-index' }
              : {}),
          KeyConditionExpression: keyCondition,
          ExpressionAttributeNames: keyNames,
          ExpressionAttributeValues: keyValues,
          ScanIndexForward: false,
          Limit: QUERY_PAGE_SIZE,
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );

      const page = (result.Items ?? []).map((item) =>
        mapItem(item as Record<string, unknown>),
      );
      examined += page.length;

      for (const item of page) {
        if (features.length > 1 && !features.includes(item.feature)) {
          continue;
        }
        if (!matchesSearch(item, search)) {
          continue;
        }
        matched.push(item);
        if (matched.length >= limit) {
          lastEvaluatedKey = cursorForItem(item, indexMode) ?? null;
          break;
        }
      }

      if (matched.length >= limit) {
        break;
      }

      if (!result.LastEvaluatedKey) {
        exhausted = true;
        lastEvaluatedKey = null;
        break;
      }

      exclusiveStartKey = result.LastEvaluatedKey;
      lastEvaluatedKey = result.LastEvaluatedKey as Record<string, unknown>;
    }

    return buildHttpResponse(200, {
      items: matched.map(publicItem),
      count: matched.length,
      lastEvaluatedKey: exhausted ? null : lastEvaluatedKey,
      truncated: !exhausted && examined >= MAX_EXAMINED_ITEMS,
    });
  } catch (error) {
    console.error('GetActivityLogs failed', { tableName, error });
    return buildHttpResponse(500, {
      message: 'Failed to read activity logs from DynamoDB.',
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
