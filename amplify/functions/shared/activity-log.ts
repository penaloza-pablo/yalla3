import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { getActorEmail } from './cognito-auth';
import { nowIso } from './dynamo-http';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const ACTIVITY_LOG_PK = 'LOG';

export const LOG_FEATURES = {
  INVENTORY: 'Inventory',
  PURCHASES: 'Purchases',
  SUBTRACTIONS: 'Subtractions',
  ALERTS: 'Alerts',
  PROPERTIES: 'Properties',
  BOOKINGS: 'Bookings',
  REVIEWS: 'Reviews',
  OPERATIONS: 'Daily Operations',
  CLEANING_PLAN: 'Cleaning Plan',
  CLEANING_SETTINGS: 'Cleaning settings',
  CLEANING_INCIDENTS: 'Cleaning Incidents',
} as const;

type HttpHeaders = Record<string, string | string[] | undefined>;

export type ActivityLogEntry = {
  feature: string;
  summary: string;
  action?: string;
  entityId?: string;
  entityName?: string;
  userEmail?: string;
};

export const quoted = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? `"${trimmed}"` : 'unknown';
};

export const recordActivityLog = async (
  event: { headers?: HttpHeaders },
  entry: ActivityLogEntry,
): Promise<void> => {
  const tableName = process.env.LOGS_TABLE;
  if (!tableName) {
    return;
  }

  try {
    const createdAt = nowIso();
    const id = crypto.randomUUID();
    const userEmail =
      entry.userEmail?.trim() || (await getActorEmail(event));

    await client.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          pk: ACTIVITY_LOG_PK,
          sk: `${createdAt}#${id}`,
          id,
          userEmail,
          feature: entry.feature,
          summary: entry.summary.slice(0, 280),
          createdAt,
          ...(entry.action ? { action: entry.action } : {}),
          ...(entry.entityId ? { entityId: entry.entityId } : {}),
          ...(entry.entityName ? { entityName: entry.entityName } : {}),
        },
      }),
    );
  } catch (error) {
    console.error('Failed to write activity log', error);
  }
};
