import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { BookingPlannerItem } from './bookings-planner';
import { isActivePlannerStatus, toDateOnly } from './bookings-planner';
import {
  CLEANING_SETTINGS_ID,
  getPlanByDate,
  queryCleaningVisitsForDate,
} from './cleaning-plan';
import {
  buildVisitBookingContext,
  findNextConfirmedBookings,
  listingIdentityKeys,
  loadPropertiesById,
  pickNextBookingForVisit,
  readGapFreeNights,
  visitMatchesListingKeys,
  type CleaningVisitBookingContext,
} from './cleaning-plan-booking-context';
import {
  candidateCleaningPlanDatesForBookingChange,
  describeVisitBookingContextChanges,
  type VisitBookingContextSnapshot,
} from './cleaning-plan-booking-change-format';
import { nowIso } from './dynamo-http';
import { loadSlackSecrets, slackApi } from './slack';
import { appPageUrl, escapeMrkdwn } from './slack-cleaning';
import {
  SLACK_NOTIFICATION_IDS,
  isSlackNotificationEnabled,
} from './slack-notifications';
import { docClient, getTodayInMadrid } from './visit-task-utils';

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asPlanItems = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
      )
    : [];

const snapshotFromContext = (
  context: CleaningVisitBookingContext | null,
): VisitBookingContextSnapshot | null => {
  if (!context) {
    return null;
  }
  return {
    confirmationCode: context.confirmationCode,
    checkInDate: context.checkInDate,
    checkOutDate: context.checkOutDate,
    guestCount: context.guestCount,
    giftCardLabel: context.giftCardLabel,
    hasBookingGap: context.hasBookingGap,
    sofaBedYes: context.sofaBedYes,
  };
};

const toExtraBooking = (
  previous?: BookingPlannerItem | null,
): Record<string, unknown> | null => {
  if (!previous) {
    return null;
  }
  const reservationId = asString(previous.ReservationID);
  const listingId = asString(previous.ListingID);
  const checkInDate = toDateOnly(previous.CheckInDate);
  if (!reservationId || !listingId || !checkInDate) {
    return null;
  }
  return {
    ReservationID: reservationId,
    ListingID: listingId,
    ListingNickname: asString(previous.ListingNickname),
    Status: asString(previous.Status) || 'confirmed',
    CheckInDate: previous.CheckInDate,
    CheckOutDate: previous.CheckOutDate,
    Guests: previous.Guests,
    ConfirmationCode: asString(previous.ConfirmationCode),
    Linen: previous.Linen,
    GiftCard: previous.GiftCard,
    EarlyCheckIn: previous.EarlyCheckIn,
    EarlyCheckInOn: previous.EarlyCheckInOn,
  };
};

const loadGapFreeNights = async () => {
  const table = process.env.PROPERTY_CLEANING_DETAILS_TABLE;
  if (!table) {
    return null;
  }
  try {
    const found = await docClient.send(
      new GetCommand({
        TableName: table,
        Key: { id: CLEANING_SETTINGS_ID },
      }),
    );
    return readGapFreeNights(
      found.Item ? [found.Item as Record<string, unknown>] : [],
    );
  } catch (error) {
    console.warn('Failed to load gap-free nights for cleaning plan reopen', error);
    return null;
  }
};

const reopenReadyPlanKeepingItems = async (
  plansTable: string,
  plannedDate: string,
) => {
  const plan = await getPlanByDate(plansTable, plannedDate);
  const status = asString(plan?.status).toUpperCase();
  if (status !== 'READY') {
    return {
      date: plannedDate,
      reopened: false as const,
      reason: 'not_ready' as const,
      items: asPlanItems(plan?.items),
    };
  }
  const currentItems = asPlanItems(plan?.items);
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: plansTable,
        Key: { id: plannedDate },
        UpdateExpression:
          'SET #status = :draft, slackSnapshot = :snapshot, updatedAt = :now, reopenedAt = :now, reopenedReason = :reason',
        ConditionExpression: '#status = :ready',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':draft': 'DRAFT',
          ':ready': 'READY',
          ':snapshot': currentItems,
          ':now': nowIso(),
          ':reason': 'guesty-booking-change',
        },
      }),
    );
    return {
      date: plannedDate,
      reopened: true as const,
      items: currentItems,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === 'ConditionalCheckFailedException'
    ) {
      return {
        date: plannedDate,
        reopened: false as const,
        reason: 'already_open' as const,
        items: currentItems,
      };
    }
    throw error;
  }
};

export const notifyCleaningPlanBookingContextChange = async (
  reopenedDates: string[],
  changeLines: string[],
) => {
  if (reopenedDates.length === 0 || changeLines.length === 0) {
    return { sent: false, skipped: 'no_ready_plan' as const };
  }
  if (
    !(await isSlackNotificationEnabled(
      SLACK_NOTIFICATION_IDS.cleaningPlanBooking,
    ))
  ) {
    console.log(
      'Cleaning plan booking context notify skipped: automation disabled.',
    );
    return { sent: false, skipped: 'disabled' as const };
  }
  const { cleaningChannelId } = await loadSlackSecrets();
  if (!cleaningChannelId) {
    console.error(
      'Cleaning plan booking context notify skipped: missing cleaningChannelId in yalla/slack.',
    );
    return { sent: false, skipped: 'channel' as const };
  }

  const planLinks = reopenedDates.map((date) => {
    const url = appPageUrl('Cleaning Plan', { planDate: date });
    return `• <${url}|Plan del ${escapeMrkdwn(date)}>`;
  });
  const header =
    reopenedDates.length === 1
      ? `Se reabrió el plan de limpieza del ${escapeMrkdwn(reopenedDates[0])} porque Guesty actualizó una reserva. Hay que revisarlo y volver a marcarlo como listo.`
      : 'Se reabrieron planes de limpieza porque Guesty actualizó una reserva. Hay que revisarlos y volver a marcarlos como listos.';
  const text = [
    header,
    ...planLinks,
    ...changeLines.map((line) => `• ${escapeMrkdwn(line)}`),
  ].join('\n');

  await slackApi('chat.postMessage', {
    channel: cleaningChannelId,
    text,
  });
  return { sent: true, skipped: undefined };
};

export const reopenCleaningPlansForBookingContextChange = async ({
  current,
  previous,
}: {
  current: BookingPlannerItem;
  previous?: BookingPlannerItem | null;
}) => {
  const plansTable = process.env.CLEANING_PLANS_TABLE;
  const visitsTable = process.env.VISITS_TABLE || 'yalla-visits';
  const bookingsTable = process.env.BOOKINGS_TABLE || 'yalla-bookings';
  if (!plansTable) {
    console.warn(
      'Cleaning plan booking context skipped: CLEANING_PLANS_TABLE is not configured.',
    );
    return { reopenedDates: [] as string[], notified: false };
  }

  const listingKeys = listingIdentityKeys(
    asString(current.ListingID),
    asString(current.ListingNickname),
    asString(previous?.ListingID),
    asString(previous?.ListingNickname),
  );
  if (listingKeys.size === 0) {
    return { reopenedDates: [] as string[], notified: false };
  }

  const gapFreeNights = await loadGapFreeNights();
  const lookbackDays = Math.max(gapFreeNights ?? 7, 1);
  const candidateDates = candidateCleaningPlanDatesForBookingChange({
    currentCheckIn: toDateOnly(current.CheckInDate),
    previousCheckIn: toDateOnly(previous?.CheckInDate),
    lookbackDays,
    today: getTodayInMadrid(),
  });
  if (candidateDates.length === 0) {
    return { reopenedDates: [] as string[], notified: false };
  }

  const extraBooking = toExtraBooking(previous);
  const extraBookings =
    extraBooking && isActivePlannerStatus(extraBooking.Status)
      ? [extraBooking]
      : [];
  const excludeReservationIds = [asString(current.ReservationID)].filter(
    Boolean,
  );
  const propertiesTable = process.env.PROPERTIES_TABLE;
  const listingIds = [...listingKeys];
  const reopenedDates: string[] = [];
  const changeLines: string[] = [];

  for (const plannedDate of candidateDates) {
    const plan = await getPlanByDate(plansTable, plannedDate);
    if (asString(plan?.status).toUpperCase() !== 'READY') {
      continue;
    }
    const visits = (await queryCleaningVisitsForDate(visitsTable, plannedDate))
      .filter((visit) => visitMatchesListingKeys(visit, listingKeys));
    if (visits.length === 0) {
      continue;
    }

    const propertyIds = [
      ...new Set(
        visits
          .map((visit) => asString(visit.propertyId))
          .filter(Boolean),
      ),
    ];
    const [afterBookings, beforeBookings, properties] = await Promise.all([
      findNextConfirmedBookings(bookingsTable, listingIds, plannedDate),
      findNextConfirmedBookings(bookingsTable, listingIds, plannedDate, {
        excludeReservationIds,
        extraBookings,
      }),
      propertiesTable
        ? loadPropertiesById(propertiesTable, propertyIds)
        : Promise.resolve(new Map<string, Record<string, unknown>>()),
    ]);

    const dateLines: string[] = [];
    for (const visit of visits) {
      const propertyId = asString(visit.propertyId);
      const afterContext = buildVisitBookingContext({
        plannedDate,
        listingId: propertyId,
        booking: pickNextBookingForVisit(afterBookings, visit),
        property: properties.get(propertyId),
        gapFreeNights,
      });
      const beforeContext = buildVisitBookingContext({
        plannedDate,
        listingId: propertyId,
        booking: pickNextBookingForVisit(beforeBookings, visit),
        property: properties.get(propertyId),
        gapFreeNights,
      });
      dateLines.push(
        ...describeVisitBookingContextChanges(
          asString(visit.title) || propertyId,
          snapshotFromContext(beforeContext),
          snapshotFromContext(afterContext),
        ),
      );
    }
    if (dateLines.length === 0) {
      continue;
    }
    const result = await reopenReadyPlanKeepingItems(plansTable, plannedDate);
    if (!result.reopened) {
      continue;
    }
    reopenedDates.push(plannedDate);
    changeLines.push(...dateLines);
  }

  let notified = false;
  try {
    const slack = await notifyCleaningPlanBookingContextChange(
      reopenedDates,
      changeLines,
    );
    notified = slack.sent;
  } catch (error) {
    console.error(
      'Failed to notify Slack of cleaning plan booking context change',
      error,
    );
  }

  return { reopenedDates, notified };
};
