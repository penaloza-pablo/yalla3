import { BatchGetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  GIFT_CARD_OFF,
  LINEN_VALUES,
  canonicalizeLinenValue,
  isActivePlannerStatus,
  isEarlyCheckInEnabled,
  toDateOnly,
  toGuestCount,
} from './bookings-planner';
import {
  addDaysToDateString,
  calendarDaysBetween,
  listDatesInRange,
} from './date-range';
import {
  type CleaningTypeRecord,
  isCleaningSettingsRecord,
  normalizeGapFreeNights,
  resolveCleaningType,
} from './cleaning-plan';
import { docClient } from './visit-task-utils';

export const NEXT_BOOKING_LOOKAHEAD_DAYS = 90;
const QUERY_CHUNK_SIZE = 10;

export type CleaningVisitBookingContext = {
  confirmationCode: string;
  checkInDate: string;
  checkOutDate: string;
  sofaBedYes: boolean;
  giftCardLabel: string;
  guestCount: number;
  accommodates: number | null;
  earlyCheckInApplies: boolean;
  hasBookingGap: boolean;
  nightsUntilCheckIn: number;
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asBoolean = (value: unknown) => value === true;

const formatDdMm = (dateOnly: string) => {
  const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return dateOnly;
  }
  return `${match[3]}/${match[2]}`;
};

const foldTypeName = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const foldSearchText = (value: string) =>
  foldTypeName(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

const P2_ROOM_KEYS = new Set(
  Array.from({ length: 12 }, (_, index) => String(201 + index)),
);

export type CleaningPropertyKind = 'p2-building' | 'p2-room' | 'other';

const extractP2RoomKey = (value: string) => {
  const folded = foldSearchText(value);
  if (P2_ROOM_KEYS.has(folded)) {
    return folded;
  }
  const match = folded.match(/(^|[^\d])(20[1-9]|21[0-2])([^\d]|$)/);
  return match?.[2] ?? '';
};

export const classifyCleaningPropertyKind = (
  labels: Array<string | undefined | null>,
): CleaningPropertyKind => {
  const values = labels.map((label) => asString(label)).filter(Boolean);
  if (values.some((value) => extractP2RoomKey(value))) {
    return 'p2-room';
  }
  if (
    values.some((value) => {
      const folded = foldSearchText(value);
      return folded === 'p2' || /\bp2\b/.test(folded);
    })
  ) {
    return 'p2-building';
  }
  return 'other';
};

const matchNamedCleaningType = (
  types: CleaningTypeRecord[],
  wantedName: string,
) => {
  const wanted = foldSearchText(wantedName);
  return (
    types.find((entry) => foldSearchText(entry.name) === wanted) ??
    types.find((entry) => foldSearchText(entry.name).includes(wanted))
  );
};

export const resolveP2BuildingCleaningType = (
  types: CleaningTypeRecord[],
  visitTitle: string,
) => {
  const title = foldSearchText(visitTitle);
  if (/deep\s*cleaning|limpieza\s*profunda/.test(title)) {
    return matchNamedCleaningType(types, 'Deep cleaning');
  }
  if (/bathrooms|\bbanos\b|\bbathroom\b/.test(title)) {
    return matchNamedCleaningType(types, 'Refresh + bathrooms');
  }
  if (/\blight\b|\bligero\b|\bligth\b/.test(title)) {
    return matchNamedCleaningType(types, 'Light refresh');
  }
  return undefined;
};

export const resolveP2RoomCleaningType = (
  types: CleaningTypeRecord[],
  visitTitle: string,
) => {
  const title = foldSearchText(visitTitle);
  if (/\brefresh\b|\brefrescamiento\b/.test(title)) {
    return matchNamedCleaningType(types, 'Room Refresh');
  }
  return undefined;
};

const typeNameLooksLikeSofa = (name: string) =>
  /\bsofa\b/.test(foldTypeName(name));

const typeNameLooksLikeRegular = (name: string) =>
  /\bregular\b/.test(foldTypeName(name));

export const matchSofaBedCleaningType = (types: CleaningTypeRecord[]) =>
  types.find(
    (entry) => typeNameLooksLikeSofa(entry.name) && typeNameLooksLikeRegular(entry.name),
  ) ?? types.find((entry) => typeNameLooksLikeSofa(entry.name));

export const matchRegularCleaningType = (types: CleaningTypeRecord[]) => {
  const exactRegular = types.find(
    (entry) => foldTypeName(entry.name) === 'regular',
  );
  if (exactRegular) {
    return exactRegular;
  }
  const roomRegular = types.find(
    (entry) => foldTypeName(entry.name) === 'room regular',
  );
  if (roomRegular) {
    return roomRegular;
  }
  return types.find(
    (entry) =>
      typeNameLooksLikeRegular(entry.name) && !typeNameLooksLikeSofa(entry.name),
  );
};

export const resolveAutoCleaningType = (
  types: CleaningTypeRecord[],
  context?: CleaningVisitBookingContext | null,
  options?: {
    visitTitle?: string;
    labels?: Array<string | undefined | null>;
  },
) => {
  if (types.length === 0) {
    return undefined;
  }
  const visitTitle = options?.visitTitle ?? '';
  const kind = classifyCleaningPropertyKind([
    ...(options?.labels ?? []),
    visitTitle,
  ]);
  if (kind === 'p2-building') {
    return (
      resolveP2BuildingCleaningType(types, visitTitle) ??
      resolveCleaningType(types)
    );
  }
  if (kind === 'p2-room') {
    return (
      resolveP2RoomCleaningType(types, visitTitle) ?? resolveCleaningType(types)
    );
  }
  if (!context) {
    return resolveCleaningType(types);
  }
  if (context.hasBookingGap) {
    return resolveCleaningType(types);
  }
  if (context.sofaBedYes) {
    return matchSofaBedCleaningType(types) ?? resolveCleaningType(types);
  }
  return matchRegularCleaningType(types) ?? resolveCleaningType(types);
};

const queryReservationIdsForCheckInDate = async (
  tableName: string,
  checkInDate: string,
) => {
  let exclusiveStartKey: Record<string, unknown> | undefined;
  const ids: string[] = [];
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
    for (const item of (result.Items as Record<string, unknown>[]) ?? []) {
      const id = asString(item.ReservationID);
      if (id) {
        ids.push(id);
      }
    }
    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);
  return ids;
};

const hydrateByKeys = async (
  tableName: string,
  keys: Record<string, unknown>[],
) => {
  const items = new Map<string, Record<string, unknown>>();
  let pending = keys.slice();
  for (let attempt = 0; attempt < 3 && pending.length > 0; attempt += 1) {
    const nextKeys: Record<string, unknown>[] = [];
    for (let offset = 0; offset < pending.length; offset += 100) {
      const chunk = pending.slice(offset, offset + 100);
      const result = await docClient.send(
        new BatchGetCommand({
          RequestItems: {
            [tableName]: { Keys: chunk },
          },
        }),
      );
      for (const item of result.Responses?.[tableName] ?? []) {
        const record = item as Record<string, unknown>;
        const id = asString(record.ReservationID) || asString(record.id);
        if (id) {
          items.set(id, record);
        }
      }
      nextKeys.push(...(result.UnprocessedKeys?.[tableName]?.Keys ?? []));
    }
    pending = nextKeys;
  }
  return items;
};

const loadPropertiesById = async (tableName: string, propertyIds: string[]) => {
  const unique = [...new Set(propertyIds.filter(Boolean))];
  if (unique.length === 0) {
    return new Map<string, Record<string, unknown>>();
  }
  const items = await hydrateByKeys(
    tableName,
    unique.map((id) => ({ id })),
  );
  return items;
};

const findNextConfirmedBookings = async (
  bookingsTable: string,
  listingIds: string[],
  fromDate: string,
) => {
  const needed = new Set(listingIds.filter(Boolean));
  const found = new Map<string, Record<string, unknown>>();
  if (needed.size === 0) {
    return found;
  }

  const endDate = addDaysToDateString(fromDate, NEXT_BOOKING_LOOKAHEAD_DAYS);
  const dates = listDatesInRange(fromDate, endDate);

  for (let offset = 0; offset < dates.length && needed.size > 0; offset += QUERY_CHUNK_SIZE) {
    const chunk = dates.slice(offset, offset + QUERY_CHUNK_SIZE);
    const idLists = await Promise.all(
      chunk.map((date) => queryReservationIdsForCheckInDate(bookingsTable, date)),
    );
    const ids = [...new Set(idLists.flat())];
    if (ids.length === 0) {
      continue;
    }
    const bookings = await hydrateByKeys(
      bookingsTable,
      ids.map((id) => ({ ReservationID: id })),
    );
    const ordered = ids
      .map((id) => bookings.get(id))
      .filter((item): item is Record<string, unknown> => Boolean(item));
    for (const item of ordered) {
      const listingId = asString(item.ListingID);
      if (!needed.has(listingId) || found.has(listingId)) {
        continue;
      }
      if (!isActivePlannerStatus(item.Status)) {
        continue;
      }
      const checkInDate = toDateOnly(item.CheckInDate);
      if (!checkInDate || checkInDate < fromDate) {
        continue;
      }
      found.set(listingId, item);
      needed.delete(listingId);
    }
  }

  return found;
};

const parseAccommodates = (value: unknown) => {
  const parsed = toGuestCount(value);
  return parsed > 0 ? parsed : null;
};

const isSofaBedYes = (item: Record<string, unknown>) =>
  canonicalizeLinenValue(item.Linen, asString(item.ListingID)) ===
  LINEN_VALUES.YES;

const isEarlyCheckInOn = (item: Record<string, unknown>) =>
  asBoolean(item.EarlyCheckInOn) || isEarlyCheckInEnabled(item.EarlyCheckIn);

const giftCardValue = (item: Record<string, unknown>) => asString(item.GiftCard);

const buildGiftCardLabel = ({
  item,
  hasBookingGap,
  accommodates,
  checkInDate,
  checkOutDate,
}: {
  item: Record<string, unknown>;
  hasBookingGap: boolean;
  accommodates: number | null;
  checkInDate: string;
  checkOutDate: string;
}) => {
  const giftCard = giftCardValue(item);
  if (!hasBookingGap) {
    return giftCard;
  }
  const capacity = accommodates ?? 0;
  const isOff = !giftCard || giftCard === GIFT_CARD_OFF;
  const dateLabel = formatDdMm(isOff ? checkInDate : checkOutDate);
  if (!dateLabel) {
    return giftCard;
  }
  return `${capacity} - ${dateLabel}`;
};

export const readGapFreeNights = (detailItems: Record<string, unknown>[]) => {
  const settingsItem = detailItems.find(isCleaningSettingsRecord);
  return normalizeGapFreeNights(settingsItem?.gapFreeNights);
};

export const buildVisitBookingContext = ({
  plannedDate,
  listingId,
  booking,
  property,
  gapFreeNights,
}: {
  plannedDate: string;
  listingId: string;
  booking?: Record<string, unknown>;
  property?: Record<string, unknown>;
  gapFreeNights: number | null;
}): CleaningVisitBookingContext | null => {
  if (!booking || !listingId) {
    return null;
  }
  const checkInDate = toDateOnly(booking.CheckInDate);
  const checkOutDate = toDateOnly(booking.CheckOutDate);
  if (!checkInDate) {
    return null;
  }
  const nightsUntilCheckIn = Math.max(
    0,
    calendarDaysBetween(plannedDate, checkInDate),
  );
  const hasBookingGap =
    gapFreeNights !== null && nightsUntilCheckIn >= gapFreeNights;
  const accommodates = parseAccommodates(property?.accommodates);
  const guestCount = hasBookingGap
    ? (accommodates ?? toGuestCount(booking.Guests))
    : toGuestCount(booking.Guests);
  const earlyCheckInApplies =
    !hasBookingGap &&
    checkInDate === plannedDate &&
    isEarlyCheckInOn(booking);
  const skipGiftCard =
    classifyCleaningPropertyKind([
      asString(property?.nickname),
      asString(booking.ListingNickname),
      listingId,
    ]) !== 'other';

  return {
    confirmationCode: asString(booking.ConfirmationCode),
    checkInDate,
    checkOutDate,
    sofaBedYes: isSofaBedYes(booking),
    giftCardLabel: skipGiftCard
      ? ''
      : buildGiftCardLabel({
          item: booking,
          hasBookingGap,
          accommodates,
          checkInDate,
          checkOutDate,
        }),
    guestCount,
    accommodates,
    earlyCheckInApplies,
    hasBookingGap,
    nightsUntilCheckIn,
  };
};

export const loadCleaningVisitBookingContexts = async ({
  plannedDate,
  propertyIds,
  detailItems,
  bookingsTable,
  propertiesTable,
}: {
  plannedDate: string;
  propertyIds: string[];
  detailItems: Record<string, unknown>[];
  bookingsTable?: string;
  propertiesTable?: string;
}) => {
  const uniquePropertyIds = [...new Set(propertyIds.filter(Boolean))];
  const gapFreeNights = readGapFreeNights(detailItems);
  const contexts = new Map<string, CleaningVisitBookingContext>();
  if (!bookingsTable || uniquePropertyIds.length === 0) {
    return { gapFreeNights, contexts };
  }

  const [nextBookings, properties] = await Promise.all([
    findNextConfirmedBookings(bookingsTable, uniquePropertyIds, plannedDate),
    propertiesTable
      ? loadPropertiesById(propertiesTable, uniquePropertyIds)
      : Promise.resolve(new Map<string, Record<string, unknown>>()),
  ]);

  for (const propertyId of uniquePropertyIds) {
    const context = buildVisitBookingContext({
      plannedDate,
      listingId: propertyId,
      booking: nextBookings.get(propertyId),
      property: properties.get(propertyId),
      gapFreeNights,
    });
    if (context) {
      contexts.set(propertyId, context);
    }
  }

  return { gapFreeNights, contexts };
};
