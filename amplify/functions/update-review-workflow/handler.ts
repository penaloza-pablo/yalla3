import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
};

const ALLOWED_FIELDS = new Set([
  'Status',
  'WorkflowStep',
  'WorkflowStepIndex',
  'RemovalStrategy',
  'Compensation',
  'ReviewDeleted',
  'LowRatingReason',
]);

type Body = {
  reviewId?: string;
  Status?: string;
  WorkflowStep?: string;
  WorkflowStepIndex?: number;
  RemovalStrategy?: string;
  Compensation?: number;
  ReviewDeleted?: string;
  LowRatingReason?: string;
};

const parseBody = (body?: string): Body | null => {
  if (!body) {
    return null;
  }
  try {
    return JSON.parse(body) as Body;
  } catch {
    return null;
  }
};

const isHttpRequest = (event: {
  requestContext?: { http?: { method?: string } };
}) => Boolean(event.requestContext?.http?.method);

const buildHttpResponse = (statusCode: number, payload: Record<string, unknown>) => ({
  statusCode,
  headers: {
    ...corsHeaders,
    'content-type': 'application/json',
  },
  body: JSON.stringify(payload),
});

export const handler = async (event: {
  requestContext?: { http?: { method?: string } };
  body?: string;
}) => {
  const isHttp = isHttpRequest(event);
  if (isHttp && event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
    };
  }

  const tableName = process.env.TABLE_NAME;
  if (!tableName) {
    const message = 'TABLE_NAME is not configured.';
    if (isHttp) {
      return buildHttpResponse(500, { message });
    }
    throw new Error(message);
  }

  if (!isHttp || event.requestContext?.http?.method !== 'POST') {
    const message = 'Method not allowed.';
    if (isHttp) {
      return buildHttpResponse(405, { message });
    }
    throw new Error(message);
  }

  const payload = parseBody(event.body);
  const reviewId = payload?.reviewId?.trim();
  if (!reviewId) {
    return buildHttpResponse(400, { message: 'reviewId is required.' });
  }

  const sets: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = {};
  let n = 0;

  if (payload) {
    for (const key of ALLOWED_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(payload, key)) {
        continue;
      }
      const value = payload[key as keyof Body];
      if (value === undefined) {
        continue;
      }
      const nameKey = `#f${n}`;
      const valueKey = `:f${n}`;
      names[nameKey] = key;
      values[valueKey] = value;
      sets.push(`${nameKey} = ${valueKey}`);
      n += 1;
    }
  }

  if (sets.length === 0) {
    return buildHttpResponse(400, {
      message: 'At least one workflow field is required.',
    });
  }

  try {
    await client.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { ReviewID: reviewId },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      }),
    );

    return buildHttpResponse(200, { ok: true, reviewId });
  } catch (error) {
    const message = 'Failed to update review workflow.';
    return buildHttpResponse(500, {
      message,
      details: error instanceof Error ? error.message : String(error),
    });
  }
};
