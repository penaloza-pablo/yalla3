import { GetCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { nowIso } from './dynamo-http';
import { docClient } from './visit-task-utils';

export const SLACK_NOTIFICATION_IDS = {
  cleaningOverdue: 'notify_cleaning_overdue',
  visitClosedComments: 'notify_visit_closed_with_comments',
  slackHoy: 'notify_slack_hoy',
  cleaningPlanReopened: 'notify_cleaning_plan_reopened',
  cleaningPlanChanges: 'notify_cleaning_plan_changes',
  earlyCheckInReady: 'notify_early_check_in_ready',
  cleaningPlanEod: 'notify_cleaning_plan_eod',
  maintenancePlanEod: 'notify_maintenance_plan_eod',
  inventoryLateDelivery: 'notify_inventory_late_delivery',
  planReadyLateVisit: 'notify_plan_ready_late_visit',
} as const;

export type SlackNotificationId =
  (typeof SLACK_NOTIFICATION_IDS)[keyof typeof SLACK_NOTIFICATION_IDS];

export const SLACK_NOTIFICATION_DEFINITIONS: {
  id: SlackNotificationId;
}[] = [
  { id: SLACK_NOTIFICATION_IDS.cleaningOverdue },
  { id: SLACK_NOTIFICATION_IDS.visitClosedComments },
  { id: SLACK_NOTIFICATION_IDS.slackHoy },
  { id: SLACK_NOTIFICATION_IDS.cleaningPlanReopened },
  { id: SLACK_NOTIFICATION_IDS.cleaningPlanChanges },
  { id: SLACK_NOTIFICATION_IDS.earlyCheckInReady },
  { id: SLACK_NOTIFICATION_IDS.cleaningPlanEod },
  { id: SLACK_NOTIFICATION_IDS.maintenancePlanEod },
  { id: SLACK_NOTIFICATION_IDS.inventoryLateDelivery },
  { id: SLACK_NOTIFICATION_IDS.planReadyLateVisit },
];

export const isKnownSlackNotificationId = (
  id: string,
): id is SlackNotificationId =>
  SLACK_NOTIFICATION_DEFINITIONS.some((entry) => entry.id === id);

const asBoolean = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;

export type SlackNotificationRecord = {
  id: SlackNotificationId;
  enabled: boolean;
  updatedAt?: string;
};

export const listSlackNotifications = async (
  tableName: string,
): Promise<SlackNotificationRecord[]> => {
  const stored = new Map<string, Record<string, unknown>>();
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: lastEvaluatedKey,
      }),
    );
    for (const item of result.Items ?? []) {
      const id = typeof item.id === 'string' ? item.id : '';
      if (id) {
        stored.set(id, item);
      }
    }
    lastEvaluatedKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (lastEvaluatedKey);

  return SLACK_NOTIFICATION_DEFINITIONS.map((definition) => {
    const item = stored.get(definition.id);
    const updatedAt =
      typeof item?.updatedAt === 'string' ? item.updatedAt : undefined;
    return {
      id: definition.id,
      enabled: asBoolean(item?.enabled, true),
      ...(updatedAt ? { updatedAt } : {}),
    };
  });
};

export const isSlackNotificationEnabled = async (
  id: SlackNotificationId,
): Promise<boolean> => {
  const tableName = process.env.SLACK_NOTIFICATIONS_TABLE;
  if (!tableName) {
    return true;
  }
  try {
    const found = await docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { id },
      }),
    );
    if (!found.Item) {
      return true;
    }
    return found.Item.enabled !== false;
  } catch (error) {
    console.error(`Failed to read Slack notification flag ${id}`, error);
    return true;
  }
};

export const dailySlackSendCursorId = (id: SlackNotificationId) => `sent:${id}`;

export const claimDailySlackSend = async (
  id: SlackNotificationId,
  today: string,
): Promise<boolean> => {
  const tableName = process.env.SLACK_NOTIFICATIONS_TABLE;
  if (!tableName) {
    return true;
  }
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id: dailySlackSendCursorId(id) },
        UpdateExpression: 'SET lastSentDate = :today, updatedAt = :now',
        ConditionExpression:
          'attribute_not_exists(lastSentDate) OR lastSentDate <> :today',
        ExpressionAttributeValues: {
          ':today': today,
          ':now': nowIso(),
        },
      }),
    );
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'ConditionalCheckFailedException'
    ) {
      return false;
    }
    console.error(`Failed to claim daily Slack send ${id}`, error);
    return false;
  }
};
