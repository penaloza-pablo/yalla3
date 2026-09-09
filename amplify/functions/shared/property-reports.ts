import { GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  currentMonthId as billingCurrentMonthId,
  datesInMonth,
  isMonthId,
  shiftMonthId,
} from './cleaning-billing';
import { nowIso } from './dynamo-http';
import {
  isJclStorageIdentity,
  isOtherPropertyIdentity,
  isP2BuildingId,
  isP2RoomListingId,
  isP2RoomNickname,
  p2ReportMemberIds,
  PLANTA_2_REPORT_NAME,
  P2_BUILDING_ID,
  PROPERTY_REPORTS_START_MONTH,
  resolveYallaPropertyLabelFromRecord,
  yallaAliasForListingId,
} from './property-identity';
import {
  asStringList,
  groupedMemberIdSet,
  hydrateReportGroupProperty,
  isReportGroupRecord,
  isReportGroupType,
  reportGroupById,
  reportGroupForMember,
  resolveReportGroups,
  type ResolvedReportGroup,
} from './property-groups';
import {
  occurrencePriceWithIva,
  resolveIvaRate,
} from './iva';
import { docClient } from './visit-task-utils';

export { PROPERTY_REPORTS_START_MONTH };

export type PropertyReportStatus =
  | 'CURRENT'
  | 'PENDING_TO_CLOSE'
  | 'READY_TO_CLOSE'
  | 'CLOSED';

export const COST_ALLOCATIONS = ['bear', 'ownerPlus12', 'owner'] as const;

export type CostAllocation = (typeof COST_ALLOCATIONS)[number];

export const isCostAllocation = (value: unknown): value is CostAllocation =>
  COST_ALLOCATIONS.includes(String(value) as CostAllocation);

export const parseLineAllocations = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, CostAllocation>;
  }
  const next: Record<string, CostAllocation> = {};
  for (const [key, allocation] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const id = key.trim();
    if (!id || !isCostAllocation(allocation)) {
      continue;
    }
    next[id] = allocation;
  }
  return next;
};

export const IVA_MULTIPLIER = 1.21;

export const roundMoney = (value: number) => Math.round(value * 100) / 100;

export type PropertyReportBooking = {
  bookingId: string;
  reservationId: string;
  guestName: string;
  checkInDate: string;
  checkOutDate: string;
  hostPayout: number | null;
  fareCleaning: number | null;
  hostServiceFee: number | null;
  currency: string;
};

export type PropertyReportExpenseOrigin = 'subtraction' | 'movement' | 'purchase';

export type PropertyReportExpense = {
  id: string;
  origin: PropertyReportExpenseOrigin;
  itemName: string;
  date: string;
  amountExclIva: number;
  amountInclIva: number;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

export const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeNickname = (value: string) => value.trim().toLowerCase();

export const isMonthIdValue = isMonthId;
export const currentReportMonthId = billingCurrentMonthId;
export const datesInReportMonth = datesInMonth;

export const listReportMonthIds = () => {
  const current = currentReportMonthId();
  if (current < PROPERTY_REPORTS_START_MONTH) {
    return [];
  }
  const ids: string[] = [];
  let cursor = PROPERTY_REPORTS_START_MONTH;
  while (cursor <= current) {
    ids.push(cursor);
    cursor = shiftMonthId(cursor, 1);
  }
  return ids.reverse();
};

export const isReportableMonth = (monthId: string) => {
  const value = monthId.trim();
  if (!isMonthId(value)) {
    return false;
  }
  return value >= PROPERTY_REPORTS_START_MONTH && value <= currentReportMonthId();
};

const identityFromProperty = (property: Record<string, unknown>) => ({
  id: asString(property.id),
  nickname: asString(property.nickname) || asString(property.Nickname),
  listingNickname:
    asString(property.ListingNickname) || asString(property.listingNickname),
  title: asString(property.title) || asString(property.name),
});

const isActiveManagedProperty = (property: Record<string, unknown>) => {
  if (property.active === false || property.Active === false) {
    return false;
  }
  if (asString(property.active).toLowerCase() === 'false') {
    return false;
  }
  return true;
};

export const isPropertyReportEligible = (
  property: Record<string, unknown>,
  groups: ResolvedReportGroup[] = [],
) => {
  const identity = identityFromProperty(property);
  if (!identity.id) {
    return false;
  }
  if (!isActiveManagedProperty(property)) {
    return false;
  }
  if (isReportGroupRecord(property) || isP2BuildingId(identity.id)) {
    return true;
  }
  if (isOtherPropertyIdentity(identity) || isJclStorageIdentity(identity)) {
    return false;
  }
  if (isP2RoomListingId(identity.id) || isP2RoomNickname(identity.nickname)) {
    return false;
  }
  if (groupedMemberIdSet(groups).has(identity.id)) {
    return false;
  }
  const type = asString(property.type || property.Type).toUpperCase();
  if (type === 'MTL') {
    return false;
  }
  return true;
};

const uniqueStrings = (values: string[]) => [
  ...new Set(values.map((value) => value.trim()).filter(Boolean)),
];

export const reportScopeForProperty = (property: Record<string, unknown>) => {
  const id = asString(property.id);
  const storedMembers = asStringList(property.memberIds);
  const storedNames = asStringList(property.memberNames);
  const isGroup =
    isP2BuildingId(id) ||
    isReportGroupType(asString(property.type)) ||
    storedMembers.length > 0;
  const memberIds = uniqueStrings(
    isP2BuildingId(id)
      ? [...storedMembers, ...p2ReportMemberIds()]
      : isGroup
        ? [id, ...storedMembers]
        : [id],
  );
  const name = isGroup
    ? asString(property.nickname) ||
      asString(property.title) ||
      asString(property.name) ||
      (isP2BuildingId(id) ? PLANTA_2_REPORT_NAME : id)
    : resolveYallaPropertyLabelFromRecord(property, id);
  const memberNames = uniqueStrings([
    ...storedNames,
    name,
    ...memberIds.map((memberId) => yallaAliasForListingId(memberId) || ''),
  ]);
  return {
    id,
    isGroup,
    memberIds,
    memberNames,
    name,
  };
};

export const syntheticPlanta2Property = (): Record<string, unknown> => ({
  id: P2_BUILDING_ID,
  nickname: PLANTA_2_REPORT_NAME,
  title: PLANTA_2_REPORT_NAME,
  type: 'MTL_PRINCIPAL',
  active: true,
});

export const deriveReportStatus = (
  monthId: string,
  storedStatus?: string,
): PropertyReportStatus => {
  const stored = asString(storedStatus).toUpperCase();
  if (stored === 'CLOSED') {
    return 'CLOSED';
  }
  if (stored === 'READY_TO_CLOSE') {
    return 'READY_TO_CLOSE';
  }
  if (monthId >= currentReportMonthId()) {
    return 'CURRENT';
  }
  return 'PENDING_TO_CLOSE';
};

export const reservationFromPayload = (raw: unknown) => {
  let payload: unknown = raw;
  if (typeof payload === 'string' && payload.trim()) {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  const root = asRecord(payload);
  if (!root) {
    return null;
  }
  const nested =
    asRecord(root.reservation) ??
    asRecord(asRecord(root.data)?.reservation) ??
    null;
  if (nested) {
    return nested;
  }
  if (asString(root._id) || asString(root.confirmationCode)) {
    return root;
  }
  return null;
};

const moneyFromReservation = (reservation: Record<string, unknown> | null) => {
  const money = asRecord(reservation?.money) ?? {};
  return {
    hostPayout: asNumber(money.hostPayout),
    fareCleaning: asNumber(money.fareCleaning),
    hostServiceFee: asNumber(money.hostServiceFee),
    currency: asString(money.currency) || 'EUR',
    payments: Array.isArray(money.payments) ? money.payments : [],
  };
};

export const bookingHasPayout = (
  reservation: Record<string, unknown> | null,
  item: Record<string, unknown>,
) => {
  const status = asString(item.Status || reservation?.status).toLowerCase();
  if (
    status === 'canceled' ||
    status === 'cancelled' ||
    status === 'inquiry'
  ) {
    return false;
  }
  const money = moneyFromReservation(reservation);
  if (money.hostPayout === null) {
    return false;
  }
  const hasSucceededPayment = money.payments.some((entry) => {
    const payment = asRecord(entry);
    if (!payment) {
      return false;
    }
    const paymentStatus = asString(payment.status).toUpperCase();
    return paymentStatus === 'SUCCEEDED' || Boolean(asString(payment.payoutId));
  });
  return hasSucceededPayment || money.hostPayout > 0;
};

export const mapReportBooking = (
  item: Record<string, unknown>,
  reservation: Record<string, unknown> | null,
): PropertyReportBooking => {
  const money = moneyFromReservation(reservation);
  const confirmationCode =
    asString(item.ConfirmationCode) ||
    asString(reservation?.confirmationCode);
  const reservationId =
    asString(item.ReservationID) || asString(reservation?._id);
  const guest = asRecord(reservation?.guest);
  const guestAirbnb = asRecord(guest?.airbnb2);
  return {
    bookingId: confirmationCode || reservationId,
    reservationId,
    guestName:
      asString(item.GuestName) ||
      asString(guest?.fullName) ||
      asString(guestAirbnb?.fullName) ||
      asString(guest?.firstName) ||
      asString(guestAirbnb?.firstName),
    checkInDate:
      asString(item.CheckInDate).slice(0, 10) ||
      asString(reservation?.checkInDateLocalized).slice(0, 10),
    checkOutDate:
      asString(item.CheckOutDate).slice(0, 10) ||
      asString(reservation?.checkOutDateLocalized).slice(0, 10),
    hostPayout: money.hostPayout,
    fareCleaning: money.fareCleaning,
    hostServiceFee: money.hostServiceFee,
    currency: money.currency || asString(item.Currency) || 'EUR',
  };
};

export const subtractionDateToIso = (value: string) => {
  const trimmed = value.trim();
  const slash = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) {
    const [, day, month, year] = slash;
    return `${year}-${month}-${day}`;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  return '';
};

export const subtractionMatchesProperty = (
  item: Record<string, unknown>,
  property: Record<string, unknown>,
) => {
  const scope = reportScopeForProperty(property);
  const subtractionPropertyIds = [
    asString(item['Property id']),
    asString(item.propertyId),
    asString(item['Property ID']),
  ].filter(Boolean);
  if (subtractionPropertyIds.some((id) => scope.memberIds.includes(id))) {
    return true;
  }
  const location = normalizeNickname(
    asString(item.Location) || asString(item.location),
  );
  if (!location) {
    return false;
  }
  const names = new Set(
    [
      asString(property.nickname),
      asString(property.listingNickname),
      asString(property.title),
      asString(property.name),
      scope.name,
      ...scope.memberNames,
      ...scope.memberIds.map((id) => yallaAliasForListingId(id) || id),
    ]
      .map(normalizeNickname)
      .filter(Boolean),
  );
  if (scope.isGroup) {
    names.add('p2');
    names.add('planta 2');
    names.add('planta2');
    names.add('arenal');
    names.add('platano 7');
    names.add('plátano 7');
  }
  return names.has(location);
};

export const loadPendingBillingExpenses = async (
  tableName: string,
  property: Record<string, unknown>,
  monthId: string,
): Promise<PropertyReportExpense[]> => {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    items.push(...((result.Items as Record<string, unknown>[]) ?? []));
    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  const expenses: PropertyReportExpense[] = [];
  for (const item of items) {
    const status = asString(item.Status || item.status);
    if (status !== 'Pending Billing') {
      continue;
    }
    if (!subtractionMatchesProperty(item, property)) {
      continue;
    }
    const dateIso = subtractionDateToIso(
      asString(item.Date) || asString(item.date),
    );
    if (!dateIso || dateIso.slice(0, 7) !== monthId) {
      continue;
    }
    const amountExclIva =
      asNumber(item['Price excl. IVA']) ??
      asNumber(item.priceExclIva) ??
      asNumber(item.Cost) ??
      asNumber(item.cost) ??
      0;
    const storedTotal =
      asNumber(item['Total Price']) ??
      asNumber(item['Total price']) ??
      asNumber(item.totalPrice);
    const amountInclIva =
      storedTotal ??
      occurrencePriceWithIva(amountExclIva, resolveIvaRate(item));
    expenses.push({
      id: asString(item.id) || `${dateIso}-${asString(item['Item name'])}`,
      origin: 'subtraction',
      itemName: asString(item['Item name']) || asString(item.itemName),
      date: dateIso,
      amountExclIva: roundMoney(-Math.abs(amountExclIva)),
      amountInclIva: roundMoney(-Math.abs(amountInclIva)),
    });
  }

  expenses.sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }
    return left.id.localeCompare(right.id);
  });
  return expenses;
};

export const loadFinanceMovements = async (
  tableName: string,
  property: Record<string, unknown>,
  monthId: string,
): Promise<PropertyReportExpense[]> => {
  const memberIds = reportScopeForProperty(property).memberIds;
  if (memberIds.length === 0) {
    return [];
  }

  const items: Record<string, unknown>[] = [];
  for (const propertyId of memberIds) {
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const result = await docClient.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: 'propertyId-date-index',
          KeyConditionExpression:
            'propertyId = :propertyId AND begins_with(#date, :monthId)',
          ExpressionAttributeNames: { '#date': 'date' },
          ExpressionAttributeValues: {
            ':propertyId': propertyId,
            ':monthId': monthId,
          },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      items.push(...((result.Items as Record<string, unknown>[]) ?? []));
      exclusiveStartKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (exclusiveStartKey);
  }

  const expenses: PropertyReportExpense[] = [];
  for (const item of items) {
    const date = asString(item.date).slice(0, 10);
    if (!date || date.slice(0, 7) !== monthId) {
      continue;
    }
    const status = asString(item.status) || 'Pending Billing';
    if (status === 'Not Billable') {
      continue;
    }
    const amount = Math.abs(asNumber(item.amount) ?? 0);
    const ivaRate = resolveIvaRate(item);
    const storedTotal = asNumber(item.totalAmount);
    const totalAmount =
      storedTotal ?? occurrencePriceWithIva(amount, ivaRate);
    const sign = asString(item.kind).toLowerCase() === 'income' ? 1 : -1;
    expenses.push({
      id: asString(item.id) || `${date}-${asString(item.description)}`,
      origin: 'movement',
      itemName: asString(item.description),
      date,
      amountExclIva: roundMoney(sign * amount),
      amountInclIva: roundMoney(sign * totalAmount),
    });
  }

  expenses.sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }
    return left.id.localeCompare(right.id);
  });
  return expenses;
};

const isDirectPurchase = (item: Record<string, unknown>) =>
  item.Direct === true || item.direct === true;

const isBillablePurchase = (item: Record<string, unknown>) => {
  if (item.Billable === false || item.billable === false) {
    return false;
  }
  return true;
};

const isExcludedPurchase = (item: Record<string, unknown>) => {
  const status = asString(item.Status || item.status);
  return (
    item.Excluded === true ||
    item.excluded === true ||
    status === 'Excluded'
  );
};

export const loadDirectPurchases = async (
  tableName: string,
  property: Record<string, unknown>,
  monthId: string,
): Promise<PropertyReportExpense[]> => {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    items.push(...((result.Items as Record<string, unknown>[]) ?? []));
    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  const expenses: PropertyReportExpense[] = [];
  for (const item of items) {
    if (!isDirectPurchase(item) || isExcludedPurchase(item) || !isBillablePurchase(item)) {
      continue;
    }
    if (!subtractionMatchesProperty(item, property)) {
      continue;
    }
    const dateIso = subtractionDateToIso(
      asString(item['Delivery date']) ||
        asString(item.deliveryDate) ||
        asString(item['Purchase date']) ||
        asString(item.purchaseDate),
    );
    if (!dateIso || dateIso.slice(0, 7) !== monthId) {
      continue;
    }
    const storedExclIva =
      asNumber(item['Price excl. IVA']) ?? asNumber(item.priceExclIva);
    const storedInclIva =
      asNumber(item['Total price']) ?? asNumber(item.totalPrice);
    const amountInclIva =
      storedInclIva ??
      (storedExclIva !== null
        ? roundMoney(storedExclIva * IVA_MULTIPLIER)
        : 0);
    const amountExclIva =
      storedExclIva ??
      (storedInclIva !== null
        ? roundMoney(storedInclIva / IVA_MULTIPLIER)
        : 0);
    const itemName =
      asString(item['Item name']) || asString(item.itemName);
    expenses.push({
      id: `purchase:${asString(item.id) || `${dateIso}-${itemName}`}`,
      origin: 'purchase',
      itemName,
      date: dateIso,
      amountExclIva: roundMoney(-Math.abs(amountExclIva)),
      amountInclIva: roundMoney(-Math.abs(amountInclIva)),
    });
  }

  expenses.sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }
    return left.id.localeCompare(right.id);
  });
  return expenses;
};

export type PropertyReportServiceLine = {
  id: string;
  title: string;
  recurrence: string;
  date: string;
  price: number;
  priceWithIva: number;
};

export const loadFinanceServices = async (
  tableName: string,
  property: Record<string, unknown>,
  monthId: string,
): Promise<PropertyReportServiceLine[]> => {
  const memberIds = reportScopeForProperty(property).memberIds;
  if (memberIds.length === 0) {
    return [];
  }

  const services: Record<string, unknown>[] = [];
  for (const propertyId of memberIds) {
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const result = await docClient.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: 'propertyId-index',
          KeyConditionExpression: 'propertyId = :propertyId',
          ExpressionAttributeValues: { ':propertyId': propertyId },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      services.push(...((result.Items as Record<string, unknown>[]) ?? []));
      exclusiveStartKey = result.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (exclusiveStartKey);
  }

  const lines: PropertyReportServiceLine[] = [];
  for (const service of services) {
    const isItem =
      asString(service.recordType) === 'item' ||
      asString(service.id).includes('#');
    if (!isItem) {
      continue;
    }
    const date = asString(service.billingDate).slice(0, 10);
    if (!date || date.slice(0, 7) !== monthId) {
      continue;
    }
    const price = Math.max(0, asNumber(service.price) ?? 0);
    const ivaRate = resolveIvaRate(service);
    const storedWithIva = asNumber(service.priceWithIva);
    lines.push({
      id: asString(service.id) || `${asString(service.scheduleId)}-${date}`,
      title: asString(service.title),
      recurrence: asString(service.recurrence),
      date,
      price,
      priceWithIva:
        storedWithIva ?? occurrencePriceWithIva(price, ivaRate),
    });
  }

  lines.sort((left, right) => {
    if (left.date !== right.date) {
      return left.date.localeCompare(right.date);
    }
    return left.title.localeCompare(right.title);
  });
  return lines;
};

export const listingMatchesProperty = (
  item: Record<string, unknown>,
  property: Record<string, unknown>,
) => {
  const reservation = reservationFromPayload(item.RawPayload);
  const listing = asRecord(reservation?.listing);
  const scope = reportScopeForProperty(property);
  const listingIds = [
    asString(item.ListingID),
    asString(reservation?.listingId),
    asString(listing?._id),
    asString(listing?.id),
  ].filter(Boolean);
  if (listingIds.some((id) => scope.memberIds.includes(id))) {
    return true;
  }
  const listingNicknames = [
    asString(item.ListingNickname),
    asString(listing?.nickname),
    asString(listing?.title),
  ]
    .map(normalizeNickname)
    .filter(Boolean);
  const names = new Set(
    [
      asString(property.nickname),
      asString(property.listingNickname),
      asString(property.title),
      scope.name,
      ...scope.memberNames,
      ...scope.memberIds.map((id) => yallaAliasForListingId(id) || id),
    ]
      .map(normalizeNickname)
      .filter(Boolean),
  );
  if (scope.isGroup) {
    names.add('p2');
    names.add('planta 2');
    names.add('planta2');
    names.add('arenal');
    names.add('platano 7');
    names.add('plátano 7');
  }
  return listingNicknames.some((nickname) => names.has(nickname));
};

export const queryBookingsByCheckInDate = async (
  tableName: string,
  checkInDate: string,
) => {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: 'CheckInDate-index',
        KeyConditionExpression: 'CheckInDate = :checkInDate',
        ExpressionAttributeValues: { ':checkInDate': checkInDate },
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

export const getBookingById = async (tableName: string, reservationId: string) => {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { ReservationID: reservationId },
    }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? undefined;
};

export const getPropertyById = async (tableName: string, propertyId: string) => {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { id: propertyId },
    }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? undefined;
};

export const listProperties = async (tableName: string) => {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
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

export const resolveReportProperty = (
  properties: Record<string, unknown>[],
  propertyId: string,
) => {
  const groups = resolveReportGroups(properties);
  const group = reportGroupById(groups, propertyId);
  if (group) {
    return {
      property: hydrateReportGroupProperty(group),
      groups,
      group,
    };
  }
  const memberGroup = reportGroupForMember(groups, propertyId);
  const stored = properties.find(
    (item) => asString(item.id) === propertyId,
  );
  return {
    property: stored,
    groups,
    memberGroup,
  };
};

export const getReportRecord = async (
  tableName: string,
  propertyId: string,
  monthId: string,
) => {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { propertyId, monthId },
    }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? undefined;
};

export const reportMonthSummary = (
  monthId: string,
  stored?: Record<string, unknown>,
) => {
  const status = deriveReportStatus(monthId, asString(stored?.status));
  return {
    id: monthId,
    status,
    canMarkReady: status === 'PENDING_TO_CLOSE',
    canClose: status === 'READY_TO_CLOSE',
    canReopen: status === 'CLOSED' || status === 'READY_TO_CLOSE',
    closedAt: asString(stored?.closedAt) || undefined,
    updatedAt: asString(stored?.updatedAt) || undefined,
  };
};

export const emptyReportRecord = (
  propertyId: string,
  monthId: string,
  status: PropertyReportStatus,
) => {
  const timestamp = nowIso();
  return {
    propertyId,
    monthId,
    status,
    lineAllocations: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};
