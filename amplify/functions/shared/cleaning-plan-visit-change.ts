import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { nowIso } from './dynamo-http';
import { getPlanByDate } from './cleaning-plan';
import { loadSlackSecrets, slackApi } from './slack';
import { appPageUrl, escapeMrkdwn } from './slack-cleaning';
import {
  SLACK_NOTIFICATION_IDS,
  isSlackNotificationEnabled,
} from './slack-notifications';
import { docClient } from './visit-task-utils';
import {
  datesToReopenForVisitChange,
  describeCleaningPlanVisitChange,
  type CleaningPlanVisitChange,
} from './cleaning-plan-visit-change-format';

export {
  datesToReopenForVisitChange,
  describeCleaningPlanVisitChange,
  type CleaningPlanVisitChange,
} from './cleaning-plan-visit-change-format';

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asPlanItems = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
      )
    : [];

const removeVisitFromItems = (
  items: Record<string, unknown>[],
  visitId: string,
) =>
  items.filter((item) => asString(item.visitId) !== visitId);

const reopenReadyPlan = async (
  plansTable: string,
  plannedDate: string,
  visitId: string,
) => {
  const plan = await getPlanByDate(plansTable, plannedDate);
  const status = asString(plan?.status).toUpperCase();
  if (status !== 'READY') {
    return { date: plannedDate, reopened: false as const, reason: 'not_ready' };
  }
  const currentItems = asPlanItems(plan?.items);
  const nextItems = removeVisitFromItems(currentItems, visitId);
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: plansTable,
        Key: { id: plannedDate },
        UpdateExpression:
          'SET #status = :draft, items = :items, slackSnapshot = :snapshot, updatedAt = :now, reopenedAt = :now, reopenedReason = :reason',
        ConditionExpression: '#status = :ready',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':draft': 'DRAFT',
          ':ready': 'READY',
          ':items': nextItems,
          ':snapshot': nextItems,
          ':now': nowIso(),
          ':reason': 'guesty-visit-change',
        },
      }),
    );
    return { date: plannedDate, reopened: true as const };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'ConditionalCheckFailedException'
    ) {
      return {
        date: plannedDate,
        reopened: false as const,
        reason: 'already_open',
      };
    }
    throw error;
  }
};

const loadBookingLabels = async (
  reservationId: string,
): Promise<{ guestName: string; confirmationCode: string; listingLabel: string }> => {
  const bookingsTable = process.env.BOOKINGS_TABLE || 'yalla-bookings';
  if (!reservationId) {
    return { guestName: '', confirmationCode: '', listingLabel: '' };
  }
  try {
    const found = await docClient.send(
      new GetCommand({
        TableName: bookingsTable,
        Key: { ReservationID: reservationId },
      }),
    );
    const item = (found.Item as Record<string, unknown> | undefined) ?? {};
    return {
      guestName: asString(item.GuestName),
      confirmationCode: asString(item.ConfirmationCode),
      listingLabel: asString(item.ListingNickname) || asString(item.ListingID),
    };
  } catch (error) {
    console.error(
      `Failed to load booking ${reservationId} for cleaning plan visit change`,
      error,
    );
    return { guestName: '', confirmationCode: '', listingLabel: '' };
  }
};

export const notifyCleaningPlanVisitChange = async (
  change: CleaningPlanVisitChange,
  reopenedDates: string[],
) => {
  if (reopenedDates.length === 0) {
    return { sent: false, skipped: 'no_ready_plan' as const };
  }
  if (
    !(await isSlackNotificationEnabled(
      SLACK_NOTIFICATION_IDS.cleaningPlanVisitChange,
    ))
  ) {
    console.log('Cleaning plan visit change notify skipped: automation disabled.');
    return { sent: false, skipped: 'disabled' as const };
  }
  const { cleaningChannelId } = await loadSlackSecrets();
  if (!cleaningChannelId) {
    console.error(
      'Cleaning plan visit change notify skipped: missing cleaningChannelId in yalla/slack.',
    );
    return { sent: false, skipped: 'channel' as const };
  }

  const planLinks = reopenedDates.map((date) => {
    const url = appPageUrl('Cleaning Plan', { planDate: date });
    return `• <${url}|Plan del ${escapeMrkdwn(date)}>`;
  });
  const changeLines = describeCleaningPlanVisitChange(change).map(
    (line) => `• ${escapeMrkdwn(line)}`,
  );
  const header =
    reopenedDates.length === 1
      ? `Se reabrió el plan de limpieza del ${escapeMrkdwn(reopenedDates[0])} porque Guesty actualizó una visita. Hay que revisarlo y volver a marcarlo como listo.`
      : 'Se reabrieron planes de limpieza porque Guesty actualizó una visita. Hay que revisarlos y volver a marcarlos como listos.';
  const text = [header, ...planLinks, ...changeLines].join('\n');

  await slackApi('chat.postMessage', {
    channel: cleaningChannelId,
    text,
  });
  return { sent: true, skipped: undefined };
};

export const reopenCleaningPlansForVisitChange = async (
  change: CleaningPlanVisitChange & { reservationId?: string },
) => {
  const plansTable = process.env.CLEANING_PLANS_TABLE;
  if (!plansTable) {
    console.warn(
      'Cleaning plan visit change skipped: CLEANING_PLANS_TABLE is not configured.',
    );
    return { reopenedDates: [] as string[], notified: false };
  }

  const booking = await loadBookingLabels(asString(change.reservationId));
  const resolvedChange: CleaningPlanVisitChange = {
    ...change,
    guestName: asString(change.guestName) || booking.guestName,
    confirmationCode:
      asString(change.confirmationCode) || booking.confirmationCode,
    listingLabel: booking.listingLabel || asString(change.listingLabel),
  };

  const reopenedDates: string[] = [];
  for (const date of datesToReopenForVisitChange(
    resolvedChange.previousDate,
    resolvedChange.nextDate,
  )) {
    const result = await reopenReadyPlan(
      plansTable,
      date,
      asString(resolvedChange.visitId),
    );
    if (result.reopened) {
      reopenedDates.push(date);
    }
  }

  let notified = false;
  try {
    const slack = await notifyCleaningPlanVisitChange(
      resolvedChange,
      reopenedDates,
    );
    notified = slack.sent;
  } catch (error) {
    console.error('Failed to notify Slack of cleaning plan visit change', error);
  }

  return { reopenedDates, notified };
};
