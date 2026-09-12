// Shared by yalla-tasks-receiver, yalla-bookings-receiver, and the backfill CLI.
// Reconciles Guesty cleaning visits that are tied to a reservation.
// Visits without reservationId (P2 common areas, management, etc.) are never touched.

import {
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";

export const BUSINESS_TIMEZONE = "Europe/Madrid";
export const CLEANING_VISIT_TYPE_ID = "visit_type_cleaning";
const OPEN_VISIT_STATUSES = new Set(["SCHEDULED", "OVERDUE"]);
const CHECKED_IN_STAY_STATUSES = new Set([
  "checked_in",
  "checkedin",
  "in_house",
  "inhouse",
  "staying",
]);
const MAX_STAY_SCAN_DAYS = 14;

export function s(value) {
  return { S: String(value ?? "") };
}

export function n(value) {
  const number = Number(value ?? 0);
  return { N: String(Number.isFinite(number) ? number : 0) };
}

export function b(value) {
  return { BOOL: Boolean(value) };
}

export function attrS(item, key) {
  return String(item?.[key]?.S ?? "").trim();
}

export function attrBool(item, key) {
  if (typeof item?.[key]?.BOOL === "boolean") return item[key].BOOL;
  const raw = attrS(item, key).toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

export function nowIso() {
  return new Date().toISOString();
}

export function toDateOnly(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
}

export function toMadridDate(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (
    text.includes("T") ||
    text.endsWith("Z") ||
    /[+-]\d{2}:\d{2}$/.test(text)
  ) {
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return toDateOnly(text);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: BUSINESS_TIMEZONE,
    }).format(date);
  }
  return toDateOnly(text);
}

export function addDays(dateValue, days) {
  const match = toDateOnly(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function listDatesInRange(from, to) {
  const start = toDateOnly(from);
  const end = toDateOnly(to);
  if (!start || !end) return [];
  const dates = [];
  let cursor = start <= end ? start : end;
  const last = start <= end ? end : start;
  while (cursor <= last) {
    dates.push(cursor);
    const next = addDays(cursor, 1);
    if (!next || next === cursor) break;
    cursor = next;
  }
  return dates;
}

export function isCleaningVisitType(visitTypeId) {
  const id = String(visitTypeId || "").trim().toLowerCase();
  return Boolean(id) && (id === CLEANING_VISIT_TYPE_ID || id.includes("cleaning"));
}

export function isOpenVisitStatus(status) {
  return OPEN_VISIT_STATUSES.has(String(status || "").trim().toUpperCase());
}

export function isTerminalVisitStatus(status) {
  const normalized = String(status || "").trim().toUpperCase();
  return normalized === "COMPLETED" || normalized === "CANCELLED";
}

export function extractReservationIdFromTask(task) {
  if (!task || typeof task !== "object") return "";
  return String(
    task.reservationId ||
      task.reservation?._id ||
      task.reservation?.id ||
      ""
  ).trim();
}

export function extractReservationIdFromVisit(visit) {
  const stored = attrS(visit, "reservationId");
  if (stored) return stored;
  const raw = attrS(visit, "rawGuestyPayload");
  if (!raw) return "";
  try {
    return extractReservationIdFromTask(JSON.parse(raw));
  } catch {
    return "";
  }
}

function parseBookingPayload(booking) {
  const raw = attrS(booking, "RawPayload");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed?.reservation || parsed?.data?.reservation || parsed?.data || parsed || {};
  } catch {
    return {};
  }
}

export function bookingFieldsFromItem(booking) {
  const payload = parseBookingPayload(booking);
  const canceledAt =
    attrS(booking, "CanceledAt") ||
    payload.canceledAt ||
    payload.cancelledAt ||
    "";
  const isMidStayAttr = attrBool(booking, "IsMidStay");
  const isMidStay =
    isMidStayAttr === undefined ? Boolean(payload.isMidStay) : isMidStayAttr;
  const guestStayStatus =
    attrS(booking, "GuestStayStatus") ||
    payload.guestStay?.status ||
    "";
  return {
    reservationId: attrS(booking, "ReservationID"),
    status: attrS(booking, "Status") || payload.status || "",
    checkInDate: toDateOnly(attrS(booking, "CheckInDate") || payload.checkInDateLocalized),
    checkOutDate: toDateOnly(attrS(booking, "CheckOutDate") || payload.checkOutDateLocalized),
    listingId: attrS(booking, "ListingID") || payload.listingId || payload.listing?._id || "",
    listingNickname:
      attrS(booking, "ListingNickname") ||
      payload.listing?.nickname ||
      payload.listing?.title ||
      "",
    guestName: attrS(booking, "GuestName") || payload.guest?.fullName || "",
    canceledAt,
    isMidStay,
    guestStayStatus,
  };
}

export function classifyBookingCancellation({
  status,
  checkInDate,
  canceledAt,
  isMidStay,
  guestStayStatus,
}) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  if (normalizedStatus === "closed") return "closed";
  if (normalizedStatus !== "canceled" && normalizedStatus !== "cancelled") {
    return "active";
  }

  const stay = String(guestStayStatus || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]/g, "_");
  if (isMidStay === true || String(isMidStay).toLowerCase() === "true") {
    return "early-checkout";
  }
  if (CHECKED_IN_STAY_STATUSES.has(stay)) return "early-checkout";

  const checkIn = toDateOnly(checkInDate);
  const canceledDate = toMadridDate(canceledAt);
  if (canceledDate && checkIn && canceledDate >= checkIn) {
    return "early-checkout";
  }
  return "never-started";
}

export function datesToScan(checkInDate, checkOutDate, canceledAt) {
  const dates = new Set();
  const checkIn = toDateOnly(checkInDate);
  const checkOut = toDateOnly(checkOutDate);
  const canceledDate = toMadridDate(canceledAt);
  for (const date of [checkIn, checkOut, canceledDate]) {
    if (date) dates.add(date);
  }
  if (checkOut) {
    const plus = addDays(checkOut, 1);
    const minus = addDays(checkOut, -1);
    if (plus) dates.add(plus);
    if (minus) dates.add(minus);
  }
  if (checkIn && checkOut) {
    const span = listDatesInRange(checkIn, checkOut);
    if (span.length > 0 && span.length <= MAX_STAY_SCAN_DAYS + 1) {
      for (const date of span) dates.add(date);
    }
  }
  return [...dates].sort();
}

async function queryAll(ddb, params) {
  const items = [];
  let exclusiveStartKey;
  do {
    const result = await ddb.send(
      new QueryCommand({
        ...params,
        ExclusiveStartKey: exclusiveStartKey,
      })
    );
    items.push(...(result.Items || []));
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey);
  return items;
}

async function queryPropertyDate(ctx, propertyId, scheduledDate) {
  if (!propertyId || !scheduledDate) return [];
  return queryAll(ctx.ddb, {
    TableName: ctx.visitsTable,
    IndexName: "propertyId-scheduledDate-index",
    KeyConditionExpression: "propertyId = :propertyId AND scheduledDate = :scheduledDate",
    ExpressionAttributeValues: {
      ":propertyId": s(propertyId),
      ":scheduledDate": s(scheduledDate),
    },
  });
}

async function queryStatusDateRange(ctx, status, fromDate, toDate) {
  return queryAll(ctx.ddb, {
    TableName: ctx.visitsTable,
    IndexName: "status-scheduledDate-index",
    KeyConditionExpression: "#status = :status AND scheduledDate BETWEEN :from AND :to",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":status": s(status),
      ":from": s(fromDate),
      ":to": s(toDate),
    },
  });
}

async function getBookingItem(ctx, reservationId) {
  if (!reservationId) return null;
  const result = await ctx.ddb.send(
    new GetItemCommand({
      TableName: ctx.bookingsTable,
      Key: { ReservationID: s(reservationId) },
    })
  );
  return result.Item || null;
}

async function getVisitItem(ctx, visitId) {
  if (!visitId) return null;
  const result = await ctx.ddb.send(
    new GetItemCommand({
      TableName: ctx.visitsTable,
      Key: { id: s(visitId) },
    })
  );
  return result.Item || null;
}

function visitView(item) {
  return {
    id: attrS(item, "id"),
    propertyId: attrS(item, "propertyId"),
    visitTypeId: attrS(item, "visitTypeId"),
    status: attrS(item, "status"),
    title: attrS(item, "title"),
    scheduledDate: attrS(item, "scheduledDate"),
    scheduledStartTime: attrS(item, "scheduledStartTime") || "11:00",
    scheduledEndTime: attrS(item, "scheduledEndTime") || "13:00",
    reservationId: extractReservationIdFromVisit(item),
    createdAt: attrS(item, "createdAt"),
    item,
  };
}

function dedupeVisits(items) {
  const byId = new Map();
  for (const item of items) {
    const id = attrS(item, "id");
    if (id) byId.set(id, item);
  }
  return [...byId.values()];
}

async function persistReservationId(ctx, visit, reservationId) {
  if (!reservationId || attrS(visit, "reservationId") === reservationId) return;
  if (ctx.dryRun) return;
  await ctx.ddb.send(
    new UpdateItemCommand({
      TableName: ctx.visitsTable,
      Key: { id: s(attrS(visit, "id")) },
      UpdateExpression: "SET reservationId = :reservationId",
      ExpressionAttributeValues: { ":reservationId": s(reservationId) },
    })
  );
  visit.reservationId = s(reservationId);
}

async function cancelVisit(ctx, visit, reason) {
  const current = visitView(visit);
  if (!current.id || isTerminalVisitStatus(current.status)) {
    return { id: current.id, action: "skipped", reason: current.status || "missing" };
  }
  const action = {
    id: current.id,
    action: "cancel",
    reason,
    title: current.title,
    scheduledDate: current.scheduledDate,
  };
  if (ctx.dryRun) return action;
  const now = nowIso();
  await ctx.ddb.send(
    new UpdateItemCommand({
      TableName: ctx.visitsTable,
      Key: { id: s(current.id) },
      UpdateExpression: `
        SET #status = :status,
            lastUpdateSource = :source,
            bookingReconcileReason = :reason,
            bookingReconcileAt = :now,
            updatedAt = :now
      `,
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": s("CANCELLED"),
        ":source": s("Yalla"),
        ":reason": s(reason),
        ":now": s(now),
      },
    })
  );
  return action;
}

async function moveVisit(ctx, visit, scheduledDate, reason) {
  const current = visitView(visit);
  if (!current.id || isTerminalVisitStatus(current.status)) {
    return { id: current.id, action: "skipped", reason: current.status || "missing" };
  }
  if (current.scheduledDate === scheduledDate) {
    return { id: current.id, action: "keep", reason, scheduledDate };
  }
  const action = {
    id: current.id,
    action: "move",
    reason,
    title: current.title,
    from: current.scheduledDate,
    to: scheduledDate,
  };
  if (ctx.dryRun) return action;
  const now = nowIso();
  await ctx.ddb.send(
    new UpdateItemCommand({
      TableName: ctx.visitsTable,
      Key: { id: s(current.id) },
      UpdateExpression: `
        SET scheduledDate = :scheduledDate,
            lastUpdateSource = :source,
            bookingReconcileReason = :reason,
            bookingReconcileAt = :now,
            updatedAt = :now
      `,
      ExpressionAttributeValues: {
        ":scheduledDate": s(scheduledDate),
        ":source": s("Yalla"),
        ":reason": s(reason),
        ":now": s(now),
      },
    })
  );
  return action;
}

async function createReconcileVisit(ctx, booking, scheduledDate, templateVisit) {
  const visitId = `VISIT-RECONCILE-${booking.reservationId}`;
  const existing = await getVisitItem(ctx, visitId);
  if (existing && !isTerminalVisitStatus(attrS(existing, "status"))) {
    const moved = await moveVisit(ctx, existing, scheduledDate, "early-checkout");
    return { ...moved, created: false };
  }
  const template = templateVisit ? visitView(templateVisit) : null;
  const title =
    template?.title ||
    (booking.listingNickname ? `Clean ${booking.listingNickname}` : "Cleaning");
  const start = template?.scheduledStartTime || "11:00";
  const end = template?.scheduledEndTime || "13:00";
  const action = {
    id: visitId,
    action: "create",
    reason: "early-checkout",
    title,
    scheduledDate,
  };
  if (ctx.dryRun) return action;
  const now = nowIso();
  await ctx.ddb.send(
    new PutItemCommand({
      TableName: ctx.visitsTable,
      Item: {
        id: s(visitId),
        origin: s("BookingReconcile"),
        reservationId: s(booking.reservationId),
        lastUpdateSource: s("Yalla"),
        bookingReconcileReason: s("early-checkout"),
        bookingReconcileAt: s(now),
        status: s("SCHEDULED"),
        title: s(title),
        description: s(""),
        propertyId: s(booking.listingId || template?.propertyId || ""),
        scheduledDate: s(scheduledDate),
        scheduledStartTime: s(start),
        scheduledEndTime: s(end),
        estimatedDurationMinutes: n(120),
        actualDurationHours: n(0),
        appliesToHourBank: b(true),
        specialHours: b(false),
        priority: s("MEDIUM"),
        assignedUserId: s(""),
        teamId: s(ctx.cleaningTeamId || "team_cleaning"),
        visitTypeId: s(ctx.cleaningVisitTypeId || CLEANING_VISIT_TYPE_ID),
        createdAt: s(now),
        updatedAt: s(now),
      },
    })
  );
  return action;
}

async function findVisitsForReservation(ctx, booking, extraVisits = []) {
  const dates = datesToScan(booking.checkInDate, booking.checkOutDate, booking.canceledAt);
  const found = [];
  if (booking.listingId) {
    for (const date of dates) {
      found.push(...(await queryPropertyDate(ctx, booking.listingId, date)));
    }
  }
  const visits = dedupeVisits([...found, ...extraVisits]).filter((item) => {
    if (!isCleaningVisitType(attrS(item, "visitTypeId"))) return false;
    return extractReservationIdFromVisit(item) === booking.reservationId;
  });
  for (const visit of visits) {
    await persistReservationId(ctx, visit, booking.reservationId);
  }
  return visits;
}

async function hasReplacementCleaning(ctx, booking) {
  if (!booking.listingId || !booking.checkOutDate) return false;
  const lookDates = [booking.checkOutDate, addDays(booking.checkOutDate, 1)].filter(Boolean);
  for (const date of lookDates) {
    const others = await queryPropertyDate(ctx, booking.listingId, date);
    for (const other of others) {
      if (!isCleaningVisitType(attrS(other, "visitTypeId"))) continue;
      if (!isOpenVisitStatus(attrS(other, "status"))) continue;
      const otherReservationId = extractReservationIdFromVisit(other);
      if (!otherReservationId || otherReservationId === booking.reservationId) continue;
      const otherItem = await getBookingItem(ctx, otherReservationId);
      if (!otherItem) continue;
      const otherBooking = bookingFieldsFromItem(otherItem);
      if (classifyBookingCancellation(otherBooking) === "active") {
        return true;
      }
    }
  }
  return false;
}

export async function reconcileReservation(ctx, { reservationId, extraVisits = [] }) {
  const item = await getBookingItem(ctx, reservationId);
  if (!item) {
    return { reservationId, skipped: true, reason: "booking-missing", actions: [] };
  }
  const booking = bookingFieldsFromItem(item);
  const kind = classifyBookingCancellation(booking);
  const visits = await findVisitsForReservation(ctx, booking, extraVisits);
  const openVisits = visits.filter((visit) => isOpenVisitStatus(attrS(visit, "status")));
  const actions = [];

  if (kind === "never-started") {
    for (const visit of openVisits) {
      actions.push(await cancelVisit(ctx, visit, "booking-never-started"));
    }
    return { reservationId, kind, actions };
  }

  if (kind === "early-checkout") {
    const targetDate =
      toMadridDate(booking.canceledAt) || booking.checkOutDate || "";
    if (!targetDate) {
      return { reservationId, kind, skipped: true, reason: "missing-departure-date", actions };
    }
    if (openVisits.length === 0) {
      const template = visits[0] || extraVisits[0] || null;
      if (!booking.listingId && !template) {
        return { reservationId, kind, skipped: true, reason: "missing-property", actions };
      }
      actions.push(await createReconcileVisit(ctx, booking, targetDate, template));
      return { reservationId, kind, actions };
    }
    const keeper =
      openVisits.find((visit) => attrS(visit, "scheduledDate") === targetDate) ||
      [...openVisits].sort((left, right) =>
        attrS(left, "createdAt").localeCompare(attrS(right, "createdAt"))
      )[0];
    actions.push(await moveVisit(ctx, keeper, targetDate, "early-checkout"));
    for (const visit of openVisits) {
      if (attrS(visit, "id") === attrS(keeper, "id")) continue;
      actions.push(await cancelVisit(ctx, visit, "early-checkout-duplicate"));
    }
    return { reservationId, kind, actions };
  }

  if (kind === "closed") {
    if (openVisits.length > 0 && (await hasReplacementCleaning(ctx, booking))) {
      for (const visit of openVisits) {
        actions.push(await cancelVisit(ctx, visit, "closed-replaced"));
      }
    }
    return { reservationId, kind, actions };
  }

  if (openVisits.length > 1 && booking.checkOutDate) {
    const keeper =
      openVisits.find((visit) => attrS(visit, "scheduledDate") === booking.checkOutDate) ||
      [...openVisits].sort((left, right) =>
        attrS(right, "createdAt").localeCompare(attrS(left, "createdAt"))
      )[0];
    for (const visit of openVisits) {
      if (attrS(visit, "id") === attrS(keeper, "id")) continue;
      actions.push(await cancelVisit(ctx, visit, "active-duplicate"));
    }
  }

  return { reservationId, kind, actions };
}

export async function reconcilePropertyDateLeftovers(
  ctx,
  { propertyId, scheduledDate, keepReservationId }
) {
  if (!propertyId || !scheduledDate) {
    return { propertyId, scheduledDate, actions: [] };
  }
  const visits = await queryPropertyDate(ctx, propertyId, scheduledDate);
  const actions = [];
  for (const visit of visits) {
    if (!isCleaningVisitType(attrS(visit, "visitTypeId"))) continue;
    if (!isOpenVisitStatus(attrS(visit, "status"))) continue;
    const reservationId = extractReservationIdFromVisit(visit);
    if (!reservationId) continue;
    if (keepReservationId && reservationId === keepReservationId) continue;
    const result = await reconcileReservation(ctx, {
      reservationId,
      extraVisits: [visit],
    });
    actions.push(...(result.actions || []));
  }
  return { propertyId, scheduledDate, actions };
}

export async function backfillUpcoming(ctx, { fromDate, toDate } = {}) {
  const from = toDateOnly(fromDate) || toMadridDate(nowIso());
  const to = toDateOnly(toDate) || addDays(from, 21);
  const scheduled = await queryStatusDateRange(ctx, "SCHEDULED", from, to);
  const overdue = await queryStatusDateRange(ctx, "OVERDUE", from, to);
  const visits = dedupeVisits([...scheduled, ...overdue]).filter((item) =>
    isCleaningVisitType(attrS(item, "visitTypeId"))
  );
  const reservationIds = new Set();
  for (const visit of visits) {
    const reservationId = extractReservationIdFromVisit(visit);
    if (!reservationId) continue;
    await persistReservationId(ctx, visit, reservationId);
    reservationIds.add(reservationId);
  }

  const results = [];
  for (const reservationId of reservationIds) {
    results.push(await reconcileReservation(ctx, { reservationId }));
  }
  return { from, to, visitCount: visits.length, reservationCount: reservationIds.size, results };
}
