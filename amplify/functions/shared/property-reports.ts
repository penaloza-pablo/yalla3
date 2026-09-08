import { GetCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  currentMonthId as billingCurrentMonthId,
  datesInMonth,
  isMonthId,
} from './cleaning-billing';
import { nowIso } from './dynamo-http';
import { docClient } from './visit-task-utils';

export const PHASE1_PROPERTY_NICKNAMES = ['esperanza 9'];
export const PHASE1_MONTH_IDS = ['2026-08'];

export type PropertyReportStatus =
  | 'CURRENT'
  | 'PENDING_TO_CLOSE'
  | 'READY_TO_CLOSE'
  | 'CLOSED';

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

export type PropertyReportExpenseOrigin = 'subtraction' | 'movement';

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

export const isMonthIdValue = isMonthId;
export const currentReportMonthId = billingCurrentMonthId;
export const datesInReportMonth = datesInMonth;

const normalizeNickname = (value: string) => value.trim().toLowerCase();

export const isPhase1PropertyName = (value: string) =>
  PHASE1_PROPERTY_NICKNAMES.includes(normalizeNickname(value));

export const isPhase1Property = (property: Record<string, unknown>) => {
  const names = [
    asString(property.nickname),
    asString(property.listingNickname),
    asString(property.ListingNickname),
    asString(property.title),
    asString(property.name),
  ];
  return names.some((name) => isPhase1PropertyName(name));
};

export const isPhase1Month = (monthId: string) =>
  PHASE1_MONTH_IDS.includes(monthId.trim());

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
  const propertyId = asString(property.id);
  const subtractionPropertyIds = [
    asString(item['Property id']),
    asString(item.propertyId),
    asString(item['Property ID']),
  ].filter(Boolean);
  if (propertyId && subtractionPropertyIds.includes(propertyId)) {
    return true;
  }
  const location = normalizeNickname(
    asString(item.Location) || asString(item.location),
  );
  const names = [
    asString(property.nickname),
    asString(property.listingNickname),
    asString(property.title),
    asString(property.name),
  ]
    .map(normalizeNickname)
    .filter(Boolean);
  return Boolean(location) && names.includes(location);
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
      roundMoney(
        (asNumber(item.Cost) ?? asNumber(item.cost) ?? 0) / IVA_MULTIPLIER,
      );
    expenses.push({
      id: asString(item.id) || `${dateIso}-${asString(item['Item name'])}`,
      origin: 'subtraction',
      itemName: asString(item['Item name']) || asString(item.itemName),
      date: dateIso,
      amountExclIva: roundMoney(-Math.abs(amountExclIva)),
      amountInclIva: roundMoney(-Math.abs(amountExclIva * IVA_MULTIPLIER)),
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
  const propertyId = asString(property.id);
  if (!propertyId) {
    return [];
  }

  const items: Record<string, unknown>[] = [];
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
    const appliesIva = Boolean(item.appliesIva);
    const storedTotal = asNumber(item.totalAmount);
    const totalAmount =
      storedTotal ?? roundMoney(appliesIva ? amount * IVA_MULTIPLIER : amount);
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
  const propertyId = asString(property.id);
  if (!propertyId) {
    return [];
  }

  const services: Record<string, unknown>[] = [];
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

  const lines: PropertyReportServiceLine[] = [];
  for (const service of services) {
    const title = asString(service.title);
    const recurrence = asString(service.recurrence);
    const occurrences = Array.isArray(service.items) ? service.items : [];
    for (const entry of occurrences) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        continue;
      }
      const item = entry as Record<string, unknown>;
      const date = asString(item.billingDate).slice(0, 10);
      if (!date || date.slice(0, 7) !== monthId) {
        continue;
      }
      const price = Math.max(0, asNumber(item.price) ?? 0);
      const appliesIva = Boolean(item.appliesIva);
      const storedWithIva = asNumber(item.priceWithIva);
      lines.push({
        id:
          asString(item.id) ||
          `${asString(service.id)}-${date}`,
        title,
        recurrence,
        date,
        price,
        priceWithIva:
          storedWithIva ??
          roundMoney(appliesIva ? price * IVA_MULTIPLIER : price),
      });
    }
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
  const propertyId = asString(property.id);
  const listingIds = [
    asString(item.ListingID),
    asString(reservation?.listingId),
    asString(listing?._id),
    asString(listing?.id),
  ].filter(Boolean);
  if (propertyId && listingIds.includes(propertyId)) {
    return true;
  }
  const listingNicknames = [
    asString(item.ListingNickname),
    asString(listing?.nickname),
    asString(listing?.title),
  ]
    .map(normalizeNickname)
    .filter(Boolean);
  const names = [
    asString(property.nickname),
    asString(property.listingNickname),
    asString(property.title),
  ]
    .map(normalizeNickname)
    .filter(Boolean);
  return listingNicknames.some((nickname) => names.includes(nickname));
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
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};
