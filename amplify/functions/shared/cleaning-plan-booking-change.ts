import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  canonicalizeLinenValue,
  isActivePlannerStatus,
  toDateOnly,
  toGuestCount,
  type BookingPlannerItem,
} from './bookings-planner';
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
  canReopenCleaningPlanForBookingChange,
  candidateCleaningPlanDatesForBookingChange,
  describeVisitBookingContextChanges,
  plannerFieldsAffectCleaningContext,
  type VisitBookingContextSnapshot,
} from './cleaning-plan-booking-change-format';
import { nowIso } from './dynamo-http';
import { loadSlackSecrets, slackApi } from './slack';
import { appPageUrl, escapeMrkdwn } from './slack-cleaning';
import {
  SLACK_NOTIFICATION_IDS,
  isSlackNotificationEnabled,
} from './slack-notifications';
import { docClient, getNowTimeInMadrid, getTodayInMadrid } from './visit-task-utils';

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const debugBookingPlan = (
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>,
) => {
  const payload = {
    sessionId: 'ba4530',
    runId: 'post-fix',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  console.log('YALLA_DEBUG', JSON.stringify(payload));
  // #region agent log
  fetch('http://127.0.0.1:7799/ingest/ef8463ab-135a-4483-82b6-033ac983e58b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ba4530'},body:JSON.stringify(payload)}).catch(()=>{});
  // #endregion
};

const asPlanItems = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (entry): entry is Record<string, unknown> =>
          Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
      )
    : [];

const plannerCleaningFields = (item: BookingPlannerItem) => {
  const listingId = asString(item.ListingID);
  return {
    checkInDate: toDateOnly(item.CheckInDate),
    checkOutDate: toDateOnly(item.CheckOutDate),
    guestCount: toGuestCount(item.Guests),
    giftCard: asString(item.GiftCard),
    linen: canonicalizeLinenValue(item.Linen, listingId),
    confirmationCode: asString(item.ConfirmationCode),
    listingId,
    listingNickname: asString(item.ListingNickname),
    status: asString(item.Status),
  };
};

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
  fallbackReservationId = '',
): Record<string, unknown> | null => {
  if (!previous) {
    return null;
  }
  const reservationId =
    asString(previous.ReservationID) || asString(fallbackReservationId);
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

  const today = getTodayInMadrid();
  const nowTime = getNowTimeInMadrid();
  const currentFields = plannerCleaningFields(current);
  const previousFields = previous ? plannerCleaningFields(previous) : null;
  if (
    previousFields &&
    !plannerFieldsAffectCleaningContext(previousFields, currentFields)
  ) {
    debugBookingPlan(
      'C',
      'cleaning-plan-booking-change.ts:unchanged',
      'Skipped reopen: reservation snapshot did not change cleaning context',
      {
        reservationId: asString(current.ReservationID),
        previousReservationId: asString(previous?.ReservationID),
        checkIn: currentFields.checkInDate,
        previousCheckIn: previousFields.checkInDate,
        listing: currentFields.listingNickname || currentFields.listingId,
      },
    );
    return { reopenedDates: [] as string[], notified: false };
  }

  const gapFreeNights = await loadGapFreeNights();
  const lookbackDays = Math.max(gapFreeNights ?? 7, 1);
  const candidateDates = candidateCleaningPlanDatesForBookingChange({
    currentCheckIn: toDateOnly(current.CheckInDate),
    previousCheckIn: toDateOnly(previous?.CheckInDate),
    lookbackDays,
    today,
  });
  if (candidateDates.length === 0) {
    debugBookingPlan(
      'B',
      'cleaning-plan-booking-change.ts:candidates',
      'No candidate cleaning plan dates',
      {
        reservationId: asString(current.ReservationID),
        checkIn: toDateOnly(current.CheckInDate),
        previousCheckIn: toDateOnly(previous?.CheckInDate),
        lookbackDays,
        listing: asString(current.ListingNickname) || asString(current.ListingID),
      },
    );
    return { reopenedDates: [] as string[], notified: false };
  }

  debugBookingPlan(
    'B',
    'cleaning-plan-booking-change.ts:candidates',
    'Candidate cleaning plan dates',
    {
      reservationId: asString(current.ReservationID),
      checkIn: toDateOnly(current.CheckInDate),
      lookbackDays,
      candidateDates,
      listing: asString(current.ListingNickname) || asString(current.ListingID),
    },
  );

  const extraBooking = toExtraBooking(previous, asString(current.ReservationID));
  debugBookingPlan(
    'B',
    'cleaning-plan-booking-change.ts:extra',
    'Previous snapshot overlay for before-context',
    {
      reservationId: asString(current.ReservationID),
      previousReservationId: asString(previous?.ReservationID),
      extraReservationId: asString(extraBooking?.ReservationID),
      extraCheckIn: toDateOnly(extraBooking?.CheckInDate),
      hasExtra: Boolean(extraBooking),
    },
  );
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
    if (!canReopenCleaningPlanForBookingChange({ plannedDate, today, nowTime })) {
      debugBookingPlan(
        'D',
        'cleaning-plan-booking-change.ts:window',
        'Skipped cleaning plan outside reopen window',
        { plannedDate, today, nowTime },
      );
      continue;
    }
    const plan = await getPlanByDate(plansTable, plannedDate);
    const planStatus = asString(plan?.status).toUpperCase();
    if (planStatus !== 'READY') {
      debugBookingPlan(
        'E',
        'cleaning-plan-booking-change.ts:plan',
        'Plan is not READY',
        { plannedDate, planStatus: planStatus || 'missing' },
      );
      continue;
    }
    const visits = (await queryCleaningVisitsForDate(visitsTable, plannedDate))
      .filter((visit) => visitMatchesListingKeys(visit, listingKeys));
    if (visits.length === 0) {
      debugBookingPlan(
        'C',
        'cleaning-plan-booking-change.ts:visits',
        'READY plan has no matching listing visits',
        {
          plannedDate,
          listing: asString(current.ListingNickname) || asString(current.ListingID),
        },
      );
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
      const afterBooking = pickNextBookingForVisit(afterBookings, visit);
      const beforeBooking = pickNextBookingForVisit(beforeBookings, visit);
      debugBookingPlan(
        'B',
        'cleaning-plan-booking-change.ts:pick',
        'Before/after next booking for visit',
        {
          plannedDate,
          visitTitle: asString(visit.title) || propertyId,
          afterReservationId: asString(afterBooking?.ReservationID),
          afterCheckIn: toDateOnly(afterBooking?.CheckInDate),
          beforeReservationId: asString(beforeBooking?.ReservationID),
          beforeCheckIn: toDateOnly(beforeBooking?.CheckInDate),
          currentReservationId: asString(current.ReservationID),
        },
      );
      const afterContext = buildVisitBookingContext({
        plannedDate,
        listingId: propertyId,
        booking: afterBooking,
        property: properties.get(propertyId),
        gapFreeNights,
      });
      const beforeContext = buildVisitBookingContext({
        plannedDate,
        listingId: propertyId,
        booking: beforeBooking,
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
      debugBookingPlan(
        'D',
        'cleaning-plan-booking-change.ts:diff',
        'Matching visits but booking context did not change',
        {
          plannedDate,
          visitTitles: visits.map((visit) => asString(visit.title)),
        },
      );
      continue;
    }
    const result = await reopenReadyPlanKeepingItems(plansTable, plannedDate);
    debugBookingPlan(
      'E',
      'cleaning-plan-booking-change.ts:reopen',
      'Attempted to reopen READY plan',
      {
        plannedDate,
        reopened: result.reopened,
        changeLines: dateLines,
      },
    );
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
    debugBookingPlan(
      'A',
      'cleaning-plan-booking-change.ts:slack',
      'Slack notify result',
      { reopenedDates, notified, skipped: slack.skipped, changeCount: changeLines.length },
    );
  } catch (error) {
    console.error(
      'Failed to notify Slack of cleaning plan booking context change',
      error,
    );
  }

  return { reopenedDates, notified };
};
