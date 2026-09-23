import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  ACCESS_FIELD_ID,
  type BookingPlannerItem,
  type PlannerFieldPatch,
  type PlannerOverrides,
  type PlannerSettings,
  PLANNER_SETTINGS_ID,
  computePlannerFields,
  describePlannerBookingChanges,
  guestyReservationMatchesPlannerPatch,
  isActivePlannerStatus,
  isGiftCardFrozen,
  isInPlannerWindow,
  normalizePlannerSettings,
  plannerFieldsChanged,
  plannerStateChanged,
  shouldWritePlannerToGuesty,
  toDateOnly,
} from './bookings-planner';
import { listPlannerWindowBookings } from './bookings-planner-window';
import { nowIso } from './dynamo-http';
import { reopenCleaningPlansForBookingContextChange } from './cleaning-plan-booking-change';
import { notifyReadyCleaningPlanBookingChanges } from './slack-cleaning';
import { docClient, getNowTimeInMadrid, getTodayInMadrid } from './visit-task-utils';
import {
  asRecord,
  fetchGuestyReservation,
  loadGuestyClient,
} from './guesty-client';

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
};

export const getPlannerSettings = async (tableName: string) => {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { id: PLANNER_SETTINGS_ID },
    }),
  );
  return normalizePlannerSettings(
    (result.Item as Record<string, unknown> | undefined) ?? null,
  );
};

export const putPlannerSettings = async (
  tableName: string,
  settings: PlannerSettings,
) => {
  const item = {
    ...settings,
    id: PLANNER_SETTINGS_ID,
    updatedAt: nowIso(),
  };
  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { id: PLANNER_SETTINGS_ID },
      UpdateExpression:
        'SET plannerEnabled = :enabled, #rules = :rules, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#rules': 'rules' },
      ExpressionAttributeValues: {
        ':enabled': settings.plannerEnabled,
        ':rules': settings.rules,
        ':updatedAt': item.updatedAt,
      },
    }),
  );
  return item;
};

export { listPlannerWindowBookings };

const hydrateBooking = async (tableName: string, reservationId: string) => {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { ReservationID: reservationId },
    }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? null;
};

export const persistPlannerFields = async (
  tableName: string,
  reservationId: string,
  patch: PlannerFieldPatch,
) => {
  await docClient.send(
    new UpdateCommand({
      TableName: tableName,
      Key: { ReservationID: reservationId },
      UpdateExpression: `
        SET GiftCard = :giftCard,
            Linen = :linen,
            EarlyCheckIn = :earlyCheckIn,
            #access = :access,
            GiftCardOn = :giftCardOn,
            EarlyCheckInOn = :earlyCheckInOn,
            LinenManual = :linenManual,
            PlannerWarnings = :warnings,
            PlannerWarningCount = :warningCount,
            PlannerDismissedWarnings = :dismissedWarnings,
            UpdatedAt = :updatedAt
      `,
      ExpressionAttributeNames: { '#access': 'Access' },
      ExpressionAttributeValues: {
        ':giftCard': patch.giftCard,
        ':linen': patch.linen,
        ':earlyCheckIn': patch.earlyCheckIn,
        ':access': patch.access,
        ':giftCardOn': patch.giftCardOn,
        ':earlyCheckInOn': patch.earlyCheckInOn,
        ':linenManual': patch.linenManual,
        ':warnings': patch.warnings,
        ':warningCount': patch.warningCount,
        ':dismissedWarnings': patch.dismissedWarnings,
        ':updatedAt': nowIso(),
      },
    }),
  );
};

const asNoteText = (value: unknown) =>
  typeof value === 'string' ? value : value == null ? '' : String(value);

export const syncPlannedArrivalToGuesty = async (
  reservationId: string,
  plannedArrival: string,
) => {
  const client = await loadGuestyClient();
  if (!client) {
    throw new Error('Guesty client is not available.');
  }
  const encoded = encodeURIComponent(reservationId);
  await client.guestyPut(`/v1/reservations/${encoded}`, {
    plannedArrival,
  }).catch(async (error) => {
    console.warn('Guesty v1 plannedArrival update failed, trying v3 dates', error);
    await client.guestyPut(`/v1/reservations-v3/${encoded}/dates`, {
      plannedArrival,
      applyRecalculation: false,
    });
  });
};

export const persistPlannedArrival = async (
  bookingsTable: string,
  reservationId: string,
  plannedArrival: string,
) => {
  await docClient.send(
    new UpdateCommand({
      TableName: bookingsTable,
      Key: { ReservationID: reservationId },
      UpdateExpression: 'SET PlannedArrival = :plannedArrival, UpdatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':plannedArrival': plannedArrival,
        ':updatedAt': nowIso(),
      },
    }),
  );
};

export const syncPlannerFieldsToGuesty = async (
  reservationId: string,
  patch: PlannerFieldPatch,
  currentReservation?: Record<string, unknown> | null,
) => {
  const client = await loadGuestyClient();
  if (!client) {
    throw new Error('Guesty client is not available.');
  }

  const encoded = encodeURIComponent(reservationId);
  const current =
    currentReservation === undefined
      ? await fetchGuestyReservation(client, reservationId)
      : currentReservation;
  const notes = asRecord(current?.notes) ?? {};

  await client.guestyPut(`/v1/reservations-v3/${encoded}/notes`, {
    notes: {
      guest: asNoteText(notes.guest),
      keyCode: asNoteText(notes.keyCode),
      specialRequests: patch.giftCard,
      cleaning: patch.linen,
      other: patch.earlyCheckIn,
    },
  });

  if (patch.access.trim()) {
    await client.guestyPut(`/v1/reservations-v3/${encoded}/custom-fields`, {
      customFields: [{ fieldId: ACCESS_FIELD_ID, value: patch.access }],
    });
  }
};

export const applyPlannerToReservation = async ({
  bookingsTable,
  settings,
  reservationId,
  item,
  today = getTodayInMadrid(),
  nowTime = getNowTimeInMadrid(),
  overrides,
  syncGuesty = false,
  notifyCleaningPlan = false,
  previous,
}: {
  bookingsTable: string;
  settings: PlannerSettings;
  reservationId: string;
  item?: Record<string, unknown> | null;
  today?: string;
  nowTime?: string;
  overrides?: PlannerOverrides;
  syncGuesty?: boolean;
  notifyCleaningPlan?: boolean;
  previous?: BookingPlannerItem | null;
}) => {
  const current =
    item ?? (await hydrateBooking(bookingsTable, reservationId));
  if (!current) {
    return { ok: false as const, reason: 'not_found' };
  }

  const reopenFromBookingContext = async () => {
    if (!notifyCleaningPlan || overrides) {
      debugBookingPlan(
        'A',
        'bookings-planner-apply.ts:reopenFromBookingContext',
        'Skipped booking-plan reopen',
        {
          reservationId,
          notifyCleaningPlan,
          hasOverrides: Boolean(overrides),
        },
      );
      return { reopenedDates: [] as string[], notified: false };
    }
    try {
      const result = await reopenCleaningPlansForBookingContextChange({
        current: current as BookingPlannerItem,
        previous,
      });
      debugBookingPlan(
        'A',
        'bookings-planner-apply.ts:reopenFromBookingContext',
        'Booking-plan reopen finished',
        {
          reservationId,
          checkIn: String(current.CheckInDate ?? ''),
          listing: String(current.ListingNickname ?? current.ListingID ?? ''),
          reopenedDates: result.reopenedDates,
          notified: result.notified,
        },
      );
      return result;
    } catch (error) {
      console.error(
        `Failed to reopen cleaning plans for booking ${reservationId}`,
        error,
      );
      return { reopenedDates: [] as string[], notified: false };
    }
  };

  if (!isActivePlannerStatus(current.Status) && !overrides) {
    const reopened = await reopenFromBookingContext();
    return {
      ok: true as const,
      reservationId,
      patch: computePlannerFields({
        item: current as BookingPlannerItem,
        settings,
        today,
        nowTime,
      }),
      persisted: false,
      syncedToGuesty: false,
      reopenedDates: reopened.reopenedDates,
    };
  }

  const patch = computePlannerFields({
    item: current as BookingPlannerItem,
    settings,
    today,
    nowTime,
    overrides,
  });

  if (!settings.plannerEnabled && !overrides) {
    const existingCount = Number(current.PlannerWarningCount);
    if (!existingCount) {
      const reopened = await reopenFromBookingContext();
      return {
        ok: true as const,
        reservationId,
        patch,
        persisted: false,
        syncedToGuesty: false,
        reopenedDates: reopened.reopenedDates,
      };
    }
  }

  const notesFrozen =
    !overrides &&
    isGiftCardFrozen(toDateOnly(current.CheckInDate), today, nowTime);
  const booking = current as BookingPlannerItem;
  const fieldsChanged = plannerFieldsChanged(booking, patch);
  const stateChanged = plannerStateChanged(booking, patch);
  const hasOverrides = Boolean(overrides);
  const canTouchGuesty =
    syncGuesty &&
    !notesFrozen &&
    (hasOverrides ||
      (settings.plannerEnabled &&
        isInPlannerWindow(toDateOnly(current.CheckInDate), today)));
  let remoteMatches = false;
  let remoteReservation: Record<string, unknown> | null | undefined;
  if (canTouchGuesty && !fieldsChanged) {
    try {
      const client = await loadGuestyClient();
      if (client) {
        remoteReservation = await fetchGuestyReservation(
          client,
          reservationId,
        );
        remoteMatches = guestyReservationMatchesPlannerPatch(
          remoteReservation,
          patch,
        );
      }
    } catch (error) {
      console.warn(
        `Failed to compare planner fields with Guesty for ${reservationId}`,
        error,
      );
    }
  }
  const shouldWriteGuesty = shouldWritePlannerToGuesty({
    syncGuesty,
    notesFrozen,
    status: current.Status,
    plannerEnabled: settings.plannerEnabled,
    inWindow: isInPlannerWindow(toDateOnly(current.CheckInDate), today),
    hasOverrides,
    fieldsChanged,
    remoteMatches,
  });

  if (stateChanged) {
    await persistPlannerFields(bookingsTable, reservationId, patch);
  }

  let syncedToGuesty = false;
  let guestyError: string | undefined;
  if (shouldWriteGuesty) {
    try {
      await syncPlannerFieldsToGuesty(
        reservationId,
        patch,
        remoteReservation,
      );
      syncedToGuesty = true;
    } catch (error) {
      guestyError = error instanceof Error ? error.message : String(error);
      console.error(
        `Failed to sync planner fields to Guesty for ${reservationId}`,
        error,
      );
    }
  }

  const reopened = await reopenFromBookingContext();
  if (
    notifyCleaningPlan &&
    !notesFrozen &&
    !overrides &&
    reopened.reopenedDates.length === 0
  ) {
    try {
      const before = previous ?? (current as BookingPlannerItem);
      const changes = describePlannerBookingChanges(
        before,
        current as BookingPlannerItem,
        patch,
      );
      if (changes.length > 0) {
        const checkInDates = [
          toDateOnly(current.CheckInDate),
          toDateOnly(before.CheckInDate),
        ];
        const listingLabel =
          String(current.ListingNickname ?? '').trim() ||
          String(current.ListingID ?? '').trim();
        await notifyReadyCleaningPlanBookingChanges({
          checkInDates,
          listingLabel,
          listingId: String(current.ListingID ?? '').trim(),
          listingNickname: String(current.ListingNickname ?? '').trim(),
          confirmationCode: String(current.ConfirmationCode ?? '').trim(),
          guestName: String(current.GuestName ?? '').trim(),
          changes,
        });
      }
    } catch (error) {
      console.error(
        `Failed to notify cleaning plan booking changes for ${reservationId}`,
        error,
      );
    }
  }

  return {
    ok: true as const,
    reservationId,
    patch,
    persisted: stateChanged,
    syncedToGuesty,
    guestyError,
    reopenedDates: reopened.reopenedDates,
  };
};

export const applyPlannerWindow = async ({
  bookingsTable,
  settings,
  today = getTodayInMadrid(),
  syncGuesty = false,
}: {
  bookingsTable: string;
  settings: PlannerSettings;
  today?: string;
  syncGuesty?: boolean;
}) => {
  const items = await listPlannerWindowBookings(bookingsTable, today);
  let updated = 0;
  let synced = 0;
  const errors: string[] = [];

  for (const item of items) {
    const reservationId = String(item.ReservationID ?? '').trim();
    if (!reservationId) {
      continue;
    }
    if (!isActivePlannerStatus(item.Status)) {
      continue;
    }
    try {
      const result = await applyPlannerToReservation({
        bookingsTable,
        settings,
        reservationId,
        item,
        today,
        syncGuesty,
      });
      if (result.ok) {
        updated += 1;
        if (result.syncedToGuesty) {
          synced += 1;
        }
        if (result.guestyError) {
          errors.push(`${reservationId}: ${result.guestyError}`);
        }
      }
    } catch (error) {
      errors.push(
        `${reservationId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    count: items.length,
    updated,
    synced,
    errors,
  };
};

export const sumPlannerWarnings = async (
  bookingsTable: string,
  settings: PlannerSettings,
  today = getTodayInMadrid(),
) => {
  if (!settings.plannerEnabled) {
    return 0;
  }
  const items = await listPlannerWindowBookings(bookingsTable, today);
  let total = 0;
  for (const item of items) {
    if (!isActivePlannerStatus(item.Status)) {
      continue;
    }
    const stored = Number(item.PlannerWarningCount);
    if (Number.isFinite(stored)) {
      total += stored;
      continue;
    }
    const patch = computePlannerFields({
      item: item as BookingPlannerItem,
      settings,
      today,
    });
    total += patch.warningCount;
  }
  return total;
};
