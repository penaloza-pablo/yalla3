import {
  BatchGetCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
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
  plannerWindowEnd,
  toDateOnly,
} from './bookings-planner';
import { listDatesInRange } from './date-range';
import { nowIso } from './dynamo-http';
import { reopenCleaningPlansForBookingContextChange } from './cleaning-plan-booking-change';
import { notifyReadyCleaningPlanBookingChanges } from './slack-cleaning';
import { docClient, getNowTimeInMadrid, getTodayInMadrid } from './visit-task-utils';

const GUESTY_CLIENT_PATH =
  '/opt/nodejs/node_modules/@nockai/guesty-client/index.mjs';

type GuestyClient = {
  guestyGet: (
    path: string,
    params?: Record<string, unknown>,
  ) => Promise<unknown>;
  guestyPut: (path: string, body: unknown) => Promise<unknown>;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const loadGuestyClient = async (): Promise<GuestyClient | null> => {
  try {
    const loaded = (await import(GUESTY_CLIENT_PATH)) as GuestyClient;
    if (typeof loaded.guestyGet !== 'function' || typeof loaded.guestyPut !== 'function') {
      return null;
    }
    return loaded;
  } catch (error) {
    console.warn('Guesty client layer is not available', error);
    return null;
  }
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

const queryCheckInDate = async (tableName: string, checkInDate: string) => {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'CheckInDate-index',
        KeyConditionExpression: 'CheckInDate = :checkInDate',
        ExpressionAttributeValues: { ':checkInDate': checkInDate },
        ProjectionExpression: 'ReservationID',
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    items.push(...((result.Items as Record<string, unknown>[]) ?? []));
    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);
  return items;
};

const hydrateBookingsById = async (
  tableName: string,
  ids: string[],
) => {
  const extras = new Map<string, Record<string, unknown>>();
  let keys: Record<string, unknown>[] = ids.map((id) => ({ ReservationID: id }));

  for (let attempt = 0; attempt < 3 && keys.length > 0; attempt += 1) {
    const nextKeys: Record<string, unknown>[] = [];
    for (let offset = 0; offset < keys.length; offset += 100) {
      const chunk = keys.slice(offset, offset + 100);
      const result = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: { Keys: chunk },
          },
        }),
      );
      for (const item of result.Responses?.[tableName] ?? []) {
        extras.set(String(item.ReservationID ?? ''), item);
      }
      nextKeys.push(...(result.UnprocessedKeys?.[tableName]?.Keys ?? []));
    }
    keys = nextKeys;
  }

  return ids
    .map((id) => extras.get(id))
    .filter((item): item is Record<string, unknown> => Boolean(item));
};

export const listPlannerWindowBookings = async (
  tableName: string,
  today = getTodayInMadrid(),
) => {
  const dates = listDatesInRange(today, plannerWindowEnd(today));
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const date of dates) {
    const page = await queryCheckInDate(tableName, date);
    for (const item of page) {
      const id = String(item.ReservationID ?? '').trim();
      if (id && !seen.has(id)) {
        seen.add(id);
        ids.push(id);
      }
    }
  }
  return hydrateBookingsById(tableName, ids);
};

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

const firstReservation = (value: unknown): Record<string, unknown> | null => {
  if (Array.isArray(value)) {
    return asRecord(value[0]);
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  for (const key of ['data', 'results', 'reservations', 'items']) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      return asRecord(nested[0]);
    }
  }
  return record.notes || record._id || record.id || record.specialRequests
    ? record
    : null;
};

const fetchGuestyReservation = async (
  client: GuestyClient,
  reservationId: string,
) => {
  const encoded = encodeURIComponent(reservationId);
  try {
    const byIds = await client.guestyGet(
      `/v1/reservations-v3?reservationIds[]=${encoded}`,
    );
    const reservation = firstReservation(byIds);
    if (reservation) {
      return reservation;
    }
  } catch (error) {
    console.warn('Guesty GET reservations-v3 by ids failed', error);
  }

  try {
    return firstReservation(
      await client.guestyGet(`/v1/reservations/${encoded}`),
    );
  } catch (error) {
    console.warn('Guesty GET reservations by id failed', error);
    return null;
  }
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
      return { reopenedDates: [] as string[], notified: false };
    }
    try {
      return await reopenCleaningPlansForBookingContextChange({
        current: current as BookingPlannerItem,
        previous,
      });
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
