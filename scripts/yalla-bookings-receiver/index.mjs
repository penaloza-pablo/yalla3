// index.mjs
// Runtime: Node.js 20/22/24
// Handler: index.handler

import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand
} from "@aws-sdk/client-dynamodb";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const ddb = new DynamoDBClient({});
const lambda = new LambdaClient({});

const TABLE_NAME = process.env.TABLE_NAME || "yalla-bookings";
const PROPERTIES_TABLE = process.env.PROPERTIES_TABLE || "yalla-properties";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const APPLY_BOOKINGS_PLANNER_FUNCTION =
  process.env.APPLY_BOOKINGS_PLANNER_FUNCTION || "";
const PLANNER_SETTINGS_TABLE =
  process.env.PLANNER_SETTINGS_TABLE || "yalla-bookings-planner-settings";
const GIFT_CARD_OFF = "Sin tarjeta";
const LINEN_NA = "Sofa cama: n/a";
const LINEN_YES = "Sofa cama: si";
const LINEN_NO = "Sofa cama: no";

function httpJson(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function getHeader(event, name) {
  const headers = event?.headers || {};
  const target = name.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }

  return null;
}

function parseBody(event) {
  if (!event?.body) return {};

  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function getReservation(payload) {
  return (
    payload?.reservation ||
    payload?.data?.reservation ||
    payload?.data ||
    payload
  );
}

function getReservationId(reservation) {
  return reservation?._id || reservation?.id || reservation?.reservationId || null;
}

function getListingId(reservation) {
  return reservation?.listingId || reservation?.listing?._id || reservation?.listing?.id || "";
}

function getListingNickname(reservation) {
  return reservation?.listing?.nickname || reservation?.listing?.title || "";
}

function getStatus(reservation) {
  return reservation?.status || reservation?.reservationStatus || reservation?.state || "";
}

function getCheckIn(reservation) {
  return (
    reservation?.checkInDateLocalized ||
    reservation?.checkInDateLocal ||
    reservation?.checkInDate ||
    reservation?.dates?.checkInDateLocalized ||
    (reservation?.checkIn ? String(reservation.checkIn).slice(0, 10) : "") ||
    (reservation?.dates?.checkIn ? String(reservation.dates.checkIn).slice(0, 10) : "")
  );
}

function getCheckOut(reservation) {
  return (
    reservation?.checkOutDateLocalized ||
    reservation?.checkOutDateLocal ||
    reservation?.checkOutDate ||
    reservation?.dates?.checkOutDateLocalized ||
    (reservation?.checkOut ? String(reservation.checkOut).slice(0, 10) : "") ||
    (reservation?.dates?.checkOut ? String(reservation.dates.checkOut).slice(0, 10) : "")
  );
}

const ACCESS_FIELD_ID = "6945126331a9580014e33f73";

function getGuests(reservation) {
  return (
    reservation?.guestsCount ??
    reservation?.guestCount ??
    reservation?.guests?.count ??
    reservation?.numberOfGuests?.numberOfGuests ??
    reservation?.numberOfGuests?.total ??
    0
  );
}

function getOptionalText(value) {
  if (value === undefined) return undefined;
  if (value === null) return "";
  return String(value);
}

function getNestedOptionalText(parent, key) {
  if (parent === undefined || parent === null) return undefined;
  return getOptionalText(parent[key]);
}

function pickStoredString(incoming, existingItem, fieldName) {
  if (incoming !== undefined) return incoming;
  return getExistingString(existingItem, fieldName);
}

function getAccessValue(reservation) {
  const fields = reservation?.customFields;
  if (!Array.isArray(fields)) return undefined;
  const match = fields.find(
    (field) => String(field?.fieldId ?? "") === ACCESS_FIELD_ID
  );
  if (!match) return undefined;
  return getOptionalText(match.value);
}

function getNights(reservation) {
  if (reservation?.nights != null) return reservation.nights;
  if (reservation?.nightsCount != null) return reservation.nightsCount;

  const checkIn =
    reservation?.checkIn ||
    reservation?.dates?.checkIn ||
    reservation?.checkInDateLocalized ||
    reservation?.dates?.checkInDateLocalized ||
    reservation?.checkInDateLocal;

  const checkOut =
    reservation?.checkOut ||
    reservation?.dates?.checkOut ||
    reservation?.checkOutDateLocalized ||
    reservation?.dates?.checkOutDateLocalized ||
    reservation?.checkOutDateLocal;

  if (checkIn && checkOut) {
    const ci = new Date(checkIn).getTime();
    const co = new Date(checkOut).getTime();

    if (Number.isFinite(ci) && Number.isFinite(co) && co > ci) {
      return Math.round((co - ci) / (24 * 60 * 60 * 1000));
    }
  }

  return 0;
}

function getGuestName(reservation) {
  return (
    reservation?.guest?.fullName ||
    reservation?.guest?.name ||
    [reservation?.guest?.firstName, reservation?.guest?.lastName].filter(Boolean).join(" ") ||
    ""
  );
}

function getGuestEmail(reservation) {
  return reservation?.guest?.email || reservation?.guest?.emails?.[0] || "";
}

function getConversationId(reservation) {
  return (
    reservation?.conversationId ||
    reservation?.conversation?._id ||
    reservation?.conversation?.id ||
    ""
  );
}

function getCurrency(reservation) {
  return reservation?.money?.currency || reservation?.listing?.prices?.currency || "EUR";
}

function getMoneyNumber(reservation, fieldName) {
  const value = Number(reservation?.money?.[fieldName] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getHostChannelFeeAbs(reservation) {
  const invoiceItems = reservation?.money?.invoiceItems;
  if (!Array.isArray(invoiceItems)) return 0;

  return invoiceItems.reduce((sum, item) => {
    const title = String(item?.title || "").toLowerCase();
    const type = String(item?.type || "").toLowerCase();

    const isHostChannelFee =
      title === "host channel fee" ||
      title.includes("host channel fee") ||
      type.includes("host_channel_fee");

    if (!isHostChannelFee) return sum;

    const amount = Number(item?.amount ?? 0);
    return sum + Math.abs(Number.isFinite(amount) ? amount : 0);
  }, 0);
}

function round2(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

// Total contractual paid by guest.
// Example: subTotalPrice 457.14 + abs(host channel fee -83.86) = 541.00
function getGuestPaidTotal(reservation) {
  const subTotalPrice = getMoneyNumber(reservation, "subTotalPrice");
  const hostChannelFeeAbs = getHostChannelFeeAbs(reservation);

  if (subTotalPrice > 0 || hostChannelFeeAbs > 0) {
    return round2(subTotalPrice + hostChannelFeeAbs);
  }

  // fallback if subTotalPrice is missing
  const fareAccommodation = getMoneyNumber(reservation, "fareAccommodation");
  const fareCleaning = getMoneyNumber(reservation, "fareCleaning");

  const markup = Array.isArray(reservation?.money?.invoiceItems)
    ? reservation.money.invoiceItems.reduce((sum, item) => {
        const title = String(item?.title || "").toLowerCase();
        if (!title.includes("markup")) return sum;
        const amount = Number(item?.amount ?? 0);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0)
    : 0;

  return round2(fareAccommodation + fareCleaning + markup);
}

function getGuestPaidTotalWithoutCleaning(reservation) {
  const guestPaidTotal = getGuestPaidTotal(reservation);
  const fareCleaning = getMoneyNumber(reservation, "fareCleaning");

  return round2(Math.max(0, guestPaidTotal - fareCleaning));
}

// Total Nightly value 
// Example: 541 / 4 = 135.25
function getGuestPaidDay(reservation) {
  const nights = Number(getNights(reservation));
  if (!Number.isFinite(nights) || nights <= 0) return 0;

  return round2(getGuestPaidTotal(reservation) / nights);
}

function s(value) {
  return { S: String(value ?? "") };
}

function n(value) {
  const number = Number(value ?? 0);
  return { N: String(Number.isFinite(number) ? number : 0) };
}

async function getExistingBooking(reservationId) {
  if (!reservationId) return null;

  const res = await ddb.send(new GetItemCommand({
    TableName: TABLE_NAME,
    Key: { ReservationID: s(reservationId) }
  }));

  return res?.Item || null;
}

function getExistingNumber(item, fieldName) {
  const raw = item?.[fieldName]?.N;
  if (raw == null) return 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function getExistingString(item, fieldName) {
  return item?.[fieldName]?.S || "";
}

function copyExistingAttribute(target, existing, fieldName) {
  if (existing?.[fieldName]) {
    target[fieldName] = existing[fieldName];
  }
}

async function enqueuePlannerApply(reservationId) {
  if (!APPLY_BOOKINGS_PLANNER_FUNCTION || !reservationId) return;
  await lambda.send(new InvokeCommand({
    FunctionName: APPLY_BOOKINGS_PLANNER_FUNCTION,
    InvocationType: "Event",
    Payload: Buffer.from(JSON.stringify({
      reservationId,
      syncGuesty: true
    }))
  }));
}

function todayInMadrid() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

function toDateOnly(value) {
  const text = String(value || "");
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || "";
}

function addDays(dateValue, days) {
  const match = toDateOnly(dateValue).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateValue;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isAutoGiftCard(value) {
  const text = String(value || "").trim();
  return text === GIFT_CARD_OFF || /^\d+ - \d{2}\/\d{2}$/.test(text);
}

function formatGiftCard(guestCount, checkOutDate) {
  const date = toDateOnly(checkOutDate);
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dayMonth = match ? `${match[3]}/${match[2]}` : "";
  return `${Number(guestCount) || 0} - ${dayMonth}`.trim();
}

function fromAttr(item, fieldName) {
  if (!item?.[fieldName]) return "";
  if (item[fieldName].S != null) return item[fieldName].S;
  if (item[fieldName].N != null) return item[fieldName].N;
  if (item[fieldName].BOOL != null) return item[fieldName].BOOL;
  return "";
}

async function applyPlannerInline(item) {
  const settingsRes = await ddb.send(new GetItemCommand({
    TableName: PLANNER_SETTINGS_TABLE,
    Key: { id: { S: "GLOBAL" } }
  }));
  const settingsItem = settingsRes?.Item;
  const plannerEnabled = settingsItem?.plannerEnabled?.BOOL === true;
  if (!plannerEnabled) return;

  const status = String(item.Status?.S || "").toLowerCase();
  if (status === "canceled" || status === "cancelled") return;

  const today = todayInMadrid();
  const checkIn = toDateOnly(item.CheckInDate?.S);
  const windowEnd = addDays(today, 6);
  if (!checkIn || checkIn < today || checkIn > windowEnd) return;

  const rules = Array.isArray(settingsItem?.rules?.L) ? settingsItem.rules.L : [];
  const ruleById = {};
  for (const entry of rules) {
    const map = entry?.M || {};
    const id = map.id?.S;
    if (!id) continue;
    ruleById[id] = {
      enabled: map.enabled?.BOOL !== false,
      excluded: (map.excludedPropertyIds?.L || []).map((value) => value?.S).filter(Boolean)
    };
  }

  const listingId = String(item.ListingID?.S || "");
  const guests = Number(item.Guests?.N || 0);
  const nights = Number(item.Nights?.N || 0);
  const linenRule = ruleById.linen || { enabled: true, excluded: [] };
  const giftRule = ruleById.giftCard || { enabled: true, excluded: [] };
  const guestRule = ruleById.singleGuest || { enabled: true, excluded: [] };

  let linen = String(item.Linen?.S || "");
  let giftCard = String(item.GiftCard?.S || "");
  let giftCardOn = item.GiftCardOn?.BOOL;
  if (giftCardOn == null) giftCardOn = giftCard ? giftCard !== GIFT_CARD_OFF : true;
  const access = String(item.Access?.S || "");
  const warnings = [];

  if (linenRule.enabled) {
    if (linenRule.excluded.includes(listingId)) {
      linen = LINEN_NA;
    } else if (!linen) {
      if (guests === 1) linen = LINEN_NO;
      else if (guests >= 3) linen = LINEN_YES;
      else warnings.push("linen_ask_guest");
    }
  }

  if (giftRule.enabled && !giftRule.excluded.includes(listingId)) {
    if (giftCardOn === false) {
      giftCard = GIFT_CARD_OFF;
    } else if (!giftCard || isAutoGiftCard(giftCard)) {
      giftCard = nights <= 2 ? GIFT_CARD_OFF : formatGiftCard(guests, item.CheckOutDate?.S);
      giftCardOn = true;
    }
    if (!access) warnings.push("gift_card_access_missing");
  }

  if (guestRule.enabled && !guestRule.excluded.includes(listingId) && guests === 1) {
    warnings.push("single_guest");
  }

  await ddb.send(new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: { ReservationID: item.ReservationID },
    UpdateExpression: "SET GiftCard = :giftCard, Linen = :linen, GiftCardOn = :giftCardOn, PlannerWarnings = :warnings, PlannerWarningCount = :count, UpdatedAt = :updatedAt",
    ExpressionAttributeValues: {
      ":giftCard": s(giftCard),
      ":linen": s(linen),
      ":giftCardOn": { BOOL: giftCardOn === true },
      ":warnings": { L: warnings.map((code) => ({ S: code })) },
      ":count": n(warnings.length),
      ":updatedAt": s(new Date().toISOString())
    }
  }));
}

async function updatePropertyGuestPaidStats({
  listingId,
  listingNickname,
  oldGuestPaidDay,
  newGuestPaidDay,
  oldStatus,
  newStatus
}) {
  if (!listingId) return;

  const oldShouldCount =
    oldGuestPaidDay > 0 &&
    oldStatus !== "canceled" &&
    oldStatus !== "cancelled";

  const newShouldCount =
    newGuestPaidDay > 0 &&
    newStatus !== "canceled" &&
    newStatus !== "cancelled";

  const deltaCount = (newShouldCount ? 1 : 0) - (oldShouldCount ? 1 : 0);
  const deltaSum = (newShouldCount ? newGuestPaidDay : 0) - (oldShouldCount ? oldGuestPaidDay : 0);

  if (deltaCount === 0 && deltaSum === 0) return;

  await ddb.send(new UpdateItemCommand({
    TableName: PROPERTIES_TABLE,
    Key: { id: s(listingId) },
    UpdateExpression: `
      SET
        ListingID = if_not_exists(ListingID, :listingId),
        ListingNickname = :listingNickname,
        GuestPaidDaySum = if_not_exists(GuestPaidDaySum, :zero) + :deltaSum,
        GuestPaidDayCount = if_not_exists(GuestPaidDayCount, :zero) + :deltaCount,
        UpdatedAt = :updatedAt
    `,
    ExpressionAttributeValues: {
      ":listingId": s(listingId),
      ":listingNickname": s(listingNickname),
      ":zero": n(0),
      ":deltaSum": n(deltaSum),
      ":deltaCount": n(deltaCount),
      ":updatedAt": s(new Date().toISOString())
    }
  }));

  const after = await ddb.send(new GetItemCommand({
    TableName: PROPERTIES_TABLE,
    Key: { id: s(listingId) }
  }));

  const sum = getExistingNumber(after?.Item, "GuestPaidDaySum");
  const count = getExistingNumber(after?.Item, "GuestPaidDayCount");
  const average = count > 0 ? round2(sum / count) : 0;

  await ddb.send(new UpdateItemCommand({
    TableName: PROPERTIES_TABLE,
    Key: { id: s(listingId) },
    UpdateExpression: `
      SET
        GuestPaidDayAverage = :average,
        UpdatedAt = :updatedAt
    `,
    ExpressionAttributeValues: {
      ":average": n(average),
      ":updatedAt": s(new Date().toISOString())
    }
  }));
}

export const handler = async (event) => {
  try {
    const method =
      event?.requestContext?.http?.method ||
      event?.httpMethod ||
      "POST";

    if (method === "OPTIONS") {
      return { statusCode: 200, body: "" };
    }

    if (method !== "POST") {
      return httpJson(405, { error: "Method not allowed. Use POST." });
    }

    if (WEBHOOK_SECRET) {
      const receivedSecret =
        getHeader(event, "x-webhook-secret") ||
        getHeader(event, "x-guesty-secret");

      if (receivedSecret !== WEBHOOK_SECRET) {
        return httpJson(401, { error: "Unauthorized" });
      }
    }

    const payload = parseBody(event);
    const reservation = getReservation(payload);
    const reservationId = getReservationId(reservation);

    if (!reservationId) {
      console.warn("Missing ReservationID. Payload:", JSON.stringify(payload));
      return httpJson(400, { error: "Missing ReservationID" });
    }

    const existing = await getExistingBooking(reservationId);

    const now = new Date().toISOString();
    const eventType = payload?.event || payload?.type || payload?.eventType || "unknown";

    const listingId = getListingId(reservation);
    const listingNickname = getListingNickname(reservation);
    const status = getStatus(reservation);
    const nights = getNights(reservation);
    const currency = getCurrency(reservation);

    const guestPaidTotal = getGuestPaidTotal(reservation);
    const guestPaidTotalWithoutCleaning = getGuestPaidTotalWithoutCleaning(reservation);
    const guestPaidDay = getGuestPaidDay(reservation);

    const previousListingId = getExistingString(existing, "ListingID");
    const oldGuestPaidDay = getExistingNumber(existing, "GuestPaidDay");
    const oldStatus = getExistingString(existing, "Status");

    const item = {
      ReservationID: s(reservationId),
      EventType: s(eventType),
      Status: s(status),
      ListingID: s(listingId),
      ListingNickname: s(listingNickname),
      CheckInDate: s(getCheckIn(reservation)),
      CheckOutDate: s(getCheckOut(reservation)),
      Guests: n(getGuests(reservation)),
      Nights: n(nights),
      GuestName: s(getGuestName(reservation)),
      GuestEmail: s(getGuestEmail(reservation)),
      ConversationID: s(getConversationId(reservation)),
      Source: s(reservation?.source || ""),
      ConfirmationCode: s(
        pickStoredString(
          getOptionalText(reservation?.confirmationCode),
          existing,
          "ConfirmationCode"
        )
      ),
      GiftCard: s(
        pickStoredString(
          getOptionalText(reservation?.specialRequests),
          existing,
          "GiftCard"
        )
      ),
      Linen: s(
        pickStoredString(
          getNestedOptionalText(reservation?.notes, "cleaning"),
          existing,
          "Linen"
        )
      ),
      EarlyCheckIn: s(
        pickStoredString(
          getNestedOptionalText(reservation?.notes, "other"),
          existing,
          "EarlyCheckIn"
        )
      ),
      Access: s(
        pickStoredString(getAccessValue(reservation), existing, "Access")
      ),
      Currency: s(currency),

      GuestPaidTotal: n(guestPaidTotal),
      GuestPaidTotalWithoutCleaning: n(guestPaidTotalWithoutCleaning),
      GuestPaidDay: n(guestPaidDay),

      CreatedAt: s(reservation?.createdAt || reservation?.dates?.createdAt || now),
      UpdatedAt: s(now),
      RawPayload: s(JSON.stringify(payload))
    };

    const incomingGift = getOptionalText(reservation?.specialRequests);
    if (incomingGift !== undefined) {
      const text = String(incomingGift).trim();
      item.GiftCardOn = { BOOL: text !== "" && text !== "Sin tarjeta" };
    } else {
      copyExistingAttribute(item, existing, "GiftCardOn");
    }

    const incomingEarly = getNestedOptionalText(reservation?.notes, "other");
    if (incomingEarly !== undefined) {
      item.EarlyCheckInOn = { BOOL: /early check-in/i.test(String(incomingEarly)) };
    } else {
      copyExistingAttribute(item, existing, "EarlyCheckInOn");
    }

    copyExistingAttribute(item, existing, "PlannerWarnings");
    copyExistingAttribute(item, existing, "PlannerWarningCount");

    await ddb.send(new PutItemCommand({
      TableName: TABLE_NAME,
      Item: item
    }));

    try {
      await applyPlannerInline(item);
    } catch (plannerError) {
      console.error("Failed to apply bookings planner inline", plannerError);
    }
    try {
      await enqueuePlannerApply(reservationId);
    } catch (plannerError) {
      console.error("Failed to enqueue bookings planner", plannerError);
    }

    if (previousListingId && previousListingId !== listingId) {
      await updatePropertyGuestPaidStats({
        listingId: previousListingId,
        listingNickname: getExistingString(existing, "ListingNickname"),
        oldGuestPaidDay,
        newGuestPaidDay: 0,
        oldStatus,
        newStatus: "canceled"
      });

      await updatePropertyGuestPaidStats({
        listingId,
        listingNickname,
        oldGuestPaidDay: 0,
        newGuestPaidDay: guestPaidDay,
        oldStatus: "canceled",
        newStatus: status
      });
    } else {
      await updatePropertyGuestPaidStats({
        listingId,
        listingNickname,
        oldGuestPaidDay,
        newGuestPaidDay: guestPaidDay,
        oldStatus,
        newStatus: status
      });
    }

    return httpJson(200, {
      ok: true,
      message: "Booking saved",
      table: TABLE_NAME,
      reservationId,
      eventType,
      guestPaidTotal,
      guestPaidTotalWithoutCleaning,
      guestPaidDay,
      propertyStatsUpdated: Boolean(listingId)
    });

  } catch (err) {
    console.error("Receiver failed:", err);

    return httpJson(500, {
      error: err?.message || "Internal error"
    });
  }
};