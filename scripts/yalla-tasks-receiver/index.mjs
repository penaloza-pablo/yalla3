// index.mjs
// Runtime: Node.js 20/22/24
// Handler: index.handler

import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  UpdateItemCommand
} from "@aws-sdk/client-dynamodb";
import {
  extractReservationIdFromTask,
  isCleaningVisitType,
  reconcilePropertyDateLeftovers,
  reconcileReservation,
} from "../shared/reconcile-booking-cleanings.mjs";

const ddb = new DynamoDBClient({});

const VISITS_TABLE = process.env.VISITS_TABLE || "yalla-visits";
const TASKS_TABLE = process.env.TASKS_TABLE || "yalla-tasks";
const BOOKINGS_TABLE = process.env.BOOKINGS_TABLE || "yalla-bookings";
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";
const DEFAULT_PROPERTY_ID = process.env.DEFAULT_PROPERTY_ID || "other";

const CLEANING_VISIT_TYPE_ID =
  process.env.CLEANING_VISIT_TYPE_ID || "visit_type_cleaning";

const INVENTORY_VISIT_TYPE_ID =
  process.env.INVENTORY_VISIT_TYPE_ID || "visit_type_inventory";

const MAINTENANCE_VISIT_TYPE_ID =
  process.env.MAINTENANCE_VISIT_TYPE_ID || "visit_type_maintenance";

const MANAGEMENT_VISIT_TYPE_ID =
  process.env.MANAGEMENT_VISIT_TYPE_ID || "visit_type_management";

const PROPERTY_CHECK_VISIT_TYPE_ID =
  process.env.PROPERTY_CHECK_VISIT_TYPE_ID || "visit_type_property_check";

const DEEP_PROPERTY_CHECK_VISIT_TYPE_ID =
  process.env.DEEP_PROPERTY_CHECK_VISIT_TYPE_ID || "visit_type_deep_property_check";

const PLANTA2_PROPERTY_ID = process.env.PLANTA2_PROPERTY_ID || "planta2";

const MAINTENANCE_TEAM_ID =
  process.env.MAINTENANCE_TEAM_ID || "team_maintenance";

function httpJson(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function s(value) {
  return { S: String(value ?? "") };
}

function n(value) {
  const number = Number(value ?? 0);
  return { N: String(Number.isFinite(number) ? number : 0) };
}

function b(value) {
  return { BOOL: Boolean(value) };
}

function nowIso() {
  return new Date().toISOString();
}

const BUSINESS_TIMEZONE = "Europe/Madrid";

function parseGuestyInstant(value) {
  const str = String(value ?? "").trim();
  if (!str) return null;
  if (!str.includes("T") && !str.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(str)) {
    return null;
  }
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toMadridDate(value, fallback = nowIso().slice(0, 10)) {
  const instant = parseGuestyInstant(value);
  if (instant) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: BUSINESS_TIMEZONE,
    }).format(instant);
  }
  const str = String(value ?? "").trim();
  return str ? str.slice(0, 10) : fallback;
}

function toMadridTime(value, fallback = "00:00") {
  const instant = parseGuestyInstant(value);
  if (instant) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: BUSINESS_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }).formatToParts(instant);
    const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
    return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  }
  const str = String(value ?? "").trim();
  if (!str) return fallback;
  if (str.includes("T")) {
    return str.slice(11, 16) || fallback;
  }
  return str.slice(0, 5) || fallback;
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
  if (event?.task || event?.data || event?.event) return event;

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

function getTask(payload) {
  return payload?.task || payload?.data?.task || payload?.data || payload;
}

function getGuestyTaskId(task) {
  return task?._id || task?.id || task?.taskId || task?.uid || null;
}

function normalizeGuestyTaskType(task) {
  return String(
    task?.type ||
    task?.category ||
    task?.taskType ||
    task?.department ||
    task?.team?.name ||
    ""
  )
    .trim()
    .toLowerCase();
}

function getYallaTeamIdForGuestyType(task) {
  const type = normalizeGuestyTaskType(task);

  const map = {
    administration: "team_management",
    inventory: "team_cleaning",
    cleaning: "team_cleaning",
    maintenance: MAINTENANCE_TEAM_ID,
    runner: "team_other",
    "check-in": "team_maintenance",
    checkin: "team_maintenance",
    issue: "team_management",
    inspection: "team_management"
  };

  return map[type] || "team_other";
}

function hasAssignedProperty(task) {
  return Boolean(
    task?.listingId ||
    task?.listing?._id ||
    task?.listing?.id ||
    task?.propertyId
  );
}

function hasAssignedDate(task) {
  return Boolean(
    task?.scheduledDate ||
    task?.dueDate ||
    task?.dateForSort ||
    task?.startTime ||
    task?.date ||
    task?.startDate ||
    task?.startsAt
  );
}

function shouldIgnoreGuestyTask(task) {
  const type = normalizeGuestyTaskType(task);

  return type === "inspection";
}

function shouldCreateVisitFromGuestyTask(task) {
  const type = normalizeGuestyTaskType(task);

  if (type === "cleaning") return true;
  if (type === "inventory") return true;
  if (type === "administration") return true;

  if (type === "maintenance") {
    if (hasAssignedDate(task) && hasAssignedProperty(task)) return true;
    if (shouldAssignToPlanta2(task)) return true;
    const titleRule = getTitleVisitRule(task);
    if (titleRule?.propertyId === PLANTA2_PROPERTY_ID && hasAssignedDate(task)) {
      return true;
    }
  }

  return false;
}

function getVisitTypeIdForGuestyType(task) {
  const type = normalizeGuestyTaskType(task);

  // Guesty Administration must never land as maintenance (or PC/Deep title rules).
  if (type === "administration") return MANAGEMENT_VISIT_TYPE_ID;

  const titleRule = getTitleVisitRule(task);
  if (titleRule?.visitTypeId) return titleRule.visitTypeId;

  if (type === "inventory") return INVENTORY_VISIT_TYPE_ID;
  if (type === "maintenance") return MAINTENANCE_VISIT_TYPE_ID;

  return CLEANING_VISIT_TYPE_ID;
}

function getGuestyTaskStatus(task) {
  return task?.status || task?.state || task?.taskStatus || "";
}

function stripNonGuestyTitlePrefixes(title) {
  let next = String(title || "").trim();

  while (/^(planta2|other)\s*\+\s*/i.test(next)) {
    next = next.replace(/^(planta2|other)\s*\+\s*/i, "").trim();
  }

  return next;
}

function getTaskTitle(task) {
  return stripNonGuestyTitlePrefixes(
    task?.title || task?.name || task?.summary || "Guesty task"
  );
}

function titleStartsWithP2(task) {
  return getTaskTitle(task)
    .trim()
    .toLowerCase()
    .startsWith("p2");
}

function normalizeTaskTitle(task) {
  return getTaskTitle(task)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getTitleVisitRule(task) {
  if (normalizeGuestyTaskType(task) !== "maintenance") {
    return null;
  }

  const title = normalizeTaskTitle(task);
  const compact = title.replace(/\s*-\s*/g, "-");

  if (title.startsWith("p2 - deep") || compact.startsWith("p2-deep")) {
    return {
      visitTypeId: DEEP_PROPERTY_CHECK_VISIT_TYPE_ID,
      propertyId: PLANTA2_PROPERTY_ID,
    };
  }

  if (title.startsWith("p2 - pc") || compact.startsWith("p2-pc")) {
    return {
      visitTypeId: PROPERTY_CHECK_VISIT_TYPE_ID,
      propertyId: PLANTA2_PROPERTY_ID,
    };
  }

  if (title.startsWith("deep")) {
    return { visitTypeId: DEEP_PROPERTY_CHECK_VISIT_TYPE_ID };
  }

  if (title.startsWith("pc")) {
    return { visitTypeId: PROPERTY_CHECK_VISIT_TYPE_ID };
  }

  return null;
}

function shouldAssignToPlanta2(task) {
  const type = normalizeGuestyTaskType(task);

  return (
    (type === "maintenance" || type === "cleaning" || type === "administration") &&
    hasAssignedDate(task) &&
    !hasAssignedProperty(task) &&
    titleStartsWithP2(task)
  );
}

function getTaskDescription(task) {
  return task?.description || task?.notes || task?.note || "";
}

function getTaskCategory(task) {
  return normalizeGuestyTaskType(task) || "other";
}

function getListingPropertyId(task) {
  return (
    task?.listingId ||
    task?.listing?._id ||
    task?.listing?.id ||
    task?.propertyId ||
    ""
  );
}

function getPropertyId(task) {
  const titleRule = getTitleVisitRule(task);
  if (titleRule?.propertyId) {
    return titleRule.propertyId;
  }

  if (shouldAssignToPlanta2(task)) {
    return PLANTA2_PROPERTY_ID;
  }

  return getListingPropertyId(task) || DEFAULT_PROPERTY_ID;
}

function getDueDate(task) {
  const value =
    task?.dueDate ||
    task?.dateForSort ||
    task?.startTime ||
    task?.scheduledDate ||
    task?.date ||
    "";

  if (!value) return nowIso().slice(0, 10);

  return toMadridDate(value);
}

function getScheduledDate(task) {
  const value =
    task?.scheduledDate ||
    task?.dueDate ||
    task?.dateForSort ||
    task?.date ||
    task?.startDate ||
    task?.startsAt ||
    task?.startTime ||
    "";

  if (!value) return nowIso().slice(0, 10);

  return toMadridDate(value);
}

function getScheduledStartTime(task) {
  const value =
    task?.scheduledStartTime ||
    task?.startTime ||
    task?.startsAt ||
    task?.dateForSort ||
    "";

  return toMadridTime(value, "00:00");
}

function getScheduledEndTime(task) {
  const value =
    task?.scheduledEndTime ||
    task?.endTime ||
    task?.endsAt ||
    "";

  return toMadridTime(value, "00:00");
}

function timeToMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function durationMinutesFromSchedule(startTime, endTime, storedMinutes) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start != null && end != null && end > start) {
    return end - start;
  }
  const stored = Number(storedMinutes);
  if (!Number.isFinite(stored) || stored <= 0) {
    return 0;
  }
  if (!Number.isInteger(stored) && stored < 24) {
    return Math.max(1, Math.round(stored * 60));
  }
  return Math.round(stored);
}

function getEstimatedDurationMinutes(task) {
  const start = getScheduledStartTime(task);
  const end = getScheduledEndTime(task);
  const fromSchedule = durationMinutesFromSchedule(start, end, 0);
  if (fromSchedule > 0) {
    return fromSchedule;
  }

  const explicitMinutes = Number(
    task?.estimatedDurationMinutes || task?.durationMinutes || 0
  );
  if (Number.isFinite(explicitMinutes) && explicitMinutes >= 10) {
    return Math.round(explicitMinutes);
  }

  const plannedHours = Number(task?.plannedDuration || task?.duration || 0);
  if (Number.isFinite(plannedHours) && plannedHours > 0) {
    if (plannedHours > 24) {
      return Math.round(plannedHours);
    }
    return Math.max(1, Math.round(plannedHours * 60));
  }

  if (Number.isFinite(explicitMinutes) && explicitMinutes > 0) {
    if (!Number.isInteger(explicitMinutes) && explicitMinutes < 24) {
      return Math.max(1, Math.round(explicitMinutes * 60));
    }
    return Math.round(explicitMinutes);
  }
  return 0;
}

function isDeletedEvent(eventType) {
  const v = String(eventType || "").toLowerCase();
  return v.includes("deleted") || v.includes("delete");
}

function isCompletedStatus(status) {
  const v = String(status || "").toLowerCase();
  return ["completed", "complete", "done", "closed"].includes(v);
}

function isCancelledStatus(status) {
  const v = String(status || "").toLowerCase();
  return ["cancelled", "canceled", "deleted"].includes(v);
}

function isPastDate(yyyyMmDd) {
  if (!yyyyMmDd) return false;
  return yyyyMmDd < new Date().toISOString().slice(0, 10);
}

function mapGuestyToYallaVisitStatus({ guestyStatus, scheduledDate, eventType }) {
  if (isDeletedEvent(eventType)) return "CANCELLED";
  if (isCompletedStatus(guestyStatus)) return "COMPLETED";
  if (isCancelledStatus(guestyStatus)) return "CANCELLED";
  if (isPastDate(scheduledDate)) return "OVERDUE";
  return "SCHEDULED";
}

function mapGuestyToYallaTaskStatus({ guestyStatus, eventType }) {
  if (isDeletedEvent(eventType)) return "CANCELLED";
  if (isCompletedStatus(guestyStatus)) return "COMPLETED";
  if (isCancelledStatus(guestyStatus)) return "CANCELLED";
  return "UNASSIGNED";
}

async function findVisitByGuestyTaskId(guestyTaskId) {
  const res = await ddb.send(new QueryCommand({
    TableName: VISITS_TABLE,
    IndexName: "guestyTaskId-index",
    KeyConditionExpression: "guestyTaskId = :id",
    ExpressionAttributeValues: {
      ":id": s(guestyTaskId)
    },
    Limit: 1
  }));

  return res?.Items?.[0] || null;
}

async function findTaskByGuestyTaskId(guestyTaskId) {
  const res = await ddb.send(new QueryCommand({
    TableName: TASKS_TABLE,
    IndexName: "guestyTaskId-index",
    KeyConditionExpression: "guestyTaskId = :id",
    ExpressionAttributeValues: {
      ":id": s(guestyTaskId)
    },
    Limit: 1
  }));

  return res?.Items?.[0] || null;
}

function getExistingId(item) {
  return item?.id?.S || "";
}

function getReservationId(task) {
  return extractReservationIdFromTask(task);
}

function reconcileContext() {
  return {
    ddb,
    visitsTable: VISITS_TABLE,
    bookingsTable: BOOKINGS_TABLE,
    cleaningTeamId: process.env.CLEANING_TEAM_ID || "team_cleaning",
    cleaningVisitTypeId: CLEANING_VISIT_TYPE_ID,
  };
}

async function reconcileCleaningVisit({ task, visitId, yallaStatus }) {
  if (!isCleaningVisitType(getVisitTypeIdForGuestyType(task))) {
    return null;
  }
  const reservationId = getReservationId(task);
  if (!reservationId) {
    return { skipped: true, reason: "no-reservation-id" };
  }
  if (String(yallaStatus || "").toUpperCase() === "CANCELLED") {
    return { skipped: true, reason: "visit-already-cancelled" };
  }
  const reservation = await reconcileReservation(reconcileContext(), {
    reservationId,
  });
  const leftovers = await reconcilePropertyDateLeftovers(reconcileContext(), {
    propertyId: getPropertyId(task),
    scheduledDate: getScheduledDate(task),
    keepReservationId: reservationId,
  });
  return { reservation, leftovers };
}

async function createVisitFromGuesty({ visitId, task, guestyTaskId, eventType, yallaStatus }) {
  const now = nowIso();
  const reservationId = getReservationId(task);
  const item = {
      id: s(visitId),

      origin: s("Guesty"),
      guestyTaskId: s(guestyTaskId),
      guestyTaskStatus: s(getGuestyTaskStatus(task)),
      lastGuestyEventType: s(eventType),
      lastSyncedAt: s(now),
      lastUpdateSource: s("Guesty"),
      syncStatus: s("Synced"),
      rawGuestyPayload: s(JSON.stringify(task)),

      status: s(yallaStatus),
      title: s(getTaskTitle(task)),
      description: s(getTaskDescription(task)),
      propertyId: s(getPropertyId(task)),
      scheduledDate: s(getScheduledDate(task)),
      scheduledStartTime: s(getScheduledStartTime(task)),
      scheduledEndTime: s(getScheduledEndTime(task)),

      estimatedDurationMinutes: n(getEstimatedDurationMinutes(task)),
      actualDurationHours: n(0),

      appliesToHourBank: b(true),
      specialHours: b(false),

      priority: s("MEDIUM"),
      assignedUserId: s(""),
      teamId: s(getYallaTeamIdForGuestyType(task)),
      visitTypeId: s(getVisitTypeIdForGuestyType(task)),

      createdAt: s(now),
      updatedAt: s(now)
    };
  if (reservationId) {
    item.reservationId = s(reservationId);
  }

  await ddb.send(new PutItemCommand({
    TableName: VISITS_TABLE,
    Item: item
  }));
}

async function updateVisitFromGuesty({ visitId, task, guestyTaskId, eventType, yallaStatus, existingVisit }) {
  const now = nowIso();
  const existingStatus = String(existingVisit?.status?.S || "").toUpperCase();
  const existingClosedAt = existingVisit?.closedAt?.S || "";
  const existingStart = existingVisit?.scheduledStartTime?.S || "";
  const existingEnd = existingVisit?.scheduledEndTime?.S || "";
  const existingDuration = Number(existingVisit?.estimatedDurationMinutes?.N || 0);
  const existingSource = existingVisit?.lastUpdateSource?.S || "";
  const existingIsTerminal =
    existingStatus === "COMPLETED" ||
    existingStatus === "CANCELLED" ||
    Boolean(existingClosedAt);
  const incomingIsTerminal =
    yallaStatus === "COMPLETED" || yallaStatus === "CANCELLED";
  const nextStatus =
    existingStatus === "CANCELLED" && !incomingIsTerminal
      ? "CANCELLED"
      : existingIsTerminal && !incomingIsTerminal
        ? "COMPLETED"
        : yallaStatus;

  const guestyStart = getScheduledStartTime(task);
  const guestyEnd = getScheduledEndTime(task);
  const existingStartM = timeToMinutes(existingStart);
  const existingEndM = timeToMinutes(existingEnd);
  const hasPlannedWindow =
    existingStartM != null &&
    existingEndM != null &&
    existingEndM - existingStartM >= 5;
  const preserveSchedule =
    hasPlannedWindow &&
    (existingSource === "Yalla" || existingIsTerminal);
  const existingDate = existingVisit?.scheduledDate?.S || "";
  const nextDate = preserveSchedule && existingDate ? existingDate : getScheduledDate(task);
  const nextStart = preserveSchedule ? existingStart : guestyStart;
  const nextEnd = preserveSchedule ? existingEnd : guestyEnd;
  const nextDuration = preserveSchedule
    ? durationMinutesFromSchedule(existingStart, existingEnd, existingDuration)
    : getEstimatedDurationMinutes(task);
  const keepAutoAssignedTemplate = Boolean(
    existingVisit?.autoAssignedTemplateId?.S
  );

  const reservationId = getReservationId(task);
  const expressionValues = {
      ":guestyTaskId": s(guestyTaskId),
      ":guestyTaskStatus": s(getGuestyTaskStatus(task)),
      ":lastGuestyEventType": s(eventType),
      ":lastSyncedAt": s(now),
      ":lastUpdateSource": s(preserveSchedule || existingIsTerminal ? (existingSource || "Yalla") : "Guesty"),
      ":syncStatus": s("Synced"),
      ":rawGuestyPayload": s(JSON.stringify(task)),
      ":status": s(nextStatus),
      ":title": s(getTaskTitle(task)),
      ":description": s(getTaskDescription(task)),
      ":propertyId": s(getPropertyId(task)),
      ":scheduledDate": s(nextDate),
      ":scheduledStartTime": s(nextStart),
      ":scheduledEndTime": s(nextEnd),
      ":estimatedDurationMinutes": n(nextDuration),
      ":updatedAt": s(now)
  };
  let updateExpression = `
      SET
        guestyTaskId = :guestyTaskId,
        guestyTaskStatus = :guestyTaskStatus,
        lastGuestyEventType = :lastGuestyEventType,
        lastSyncedAt = :lastSyncedAt,
        lastUpdateSource = :lastUpdateSource,
        syncStatus = :syncStatus,
        rawGuestyPayload = :rawGuestyPayload,
        #status = :status,
        title = :title,
        description = :description,
        propertyId = :propertyId,
        scheduledDate = :scheduledDate,
        scheduledStartTime = :scheduledStartTime,
        scheduledEndTime = :scheduledEndTime,
        estimatedDurationMinutes = :estimatedDurationMinutes,
        updatedAt = :updatedAt
  `;
  if (!keepAutoAssignedTemplate) {
    updateExpression += `,
        teamId = :teamId,
        visitTypeId = :visitTypeId`;
    expressionValues[":teamId"] = s(getYallaTeamIdForGuestyType(task));
    expressionValues[":visitTypeId"] = s(getVisitTypeIdForGuestyType(task));
  }
  if (reservationId) {
    updateExpression += `,
        reservationId = :reservationId`;
    expressionValues[":reservationId"] = s(reservationId);
  }

  await ddb.send(new UpdateItemCommand({
    TableName: VISITS_TABLE,
    Key: {
      id: s(visitId)
    },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: {
      "#status": "status"
    },
    ExpressionAttributeValues: expressionValues
  }));
}

async function createTaskFromGuesty({ taskId, task, guestyTaskId, eventType, yallaStatus }) {
  const now = nowIso();

  await ddb.send(new PutItemCommand({
    TableName: TASKS_TABLE,
    Item: {
      id: s(taskId),

      origin: s("Guesty"),
      guestyTaskId: s(guestyTaskId),
      guestyTaskStatus: s(getGuestyTaskStatus(task)),
      lastGuestyEventType: s(eventType),
      lastSyncedAt: s(now),
      lastUpdateSource: s("Guesty"),
      syncStatus: s("Synced"),
      rawGuestyPayload: s(JSON.stringify(task)),

      status: s(yallaStatus),
      title: s(getTaskTitle(task)),
      description: s(getTaskDescription(task)),
      propertyId: s(getPropertyId(task)),
      dueDate: s(getDueDate(task)),
      teamId: s(getYallaTeamIdForGuestyType(task)),

      priority: s("MEDIUM"),
      category: s(getTaskCategory(task) || "other"),

      createdAt: s(now),
      updatedAt: s(now)
    }
  }));
}

async function updateTaskFromGuesty({ taskId, task, guestyTaskId, eventType, yallaStatus }) {
  const now = nowIso();

  await ddb.send(new UpdateItemCommand({
    TableName: TASKS_TABLE,
    Key: {
      id: s(taskId)
    },
    UpdateExpression: `
      SET
        guestyTaskId = :guestyTaskId,
        guestyTaskStatus = :guestyTaskStatus,
        lastGuestyEventType = :lastGuestyEventType,
        lastSyncedAt = :lastSyncedAt,
        lastUpdateSource = :lastUpdateSource,
        syncStatus = :syncStatus,
        rawGuestyPayload = :rawGuestyPayload,
        #status = :status,
        title = :title,
        description = :description,
        propertyId = :propertyId,
        dueDate = :dueDate,
        teamId = :teamId,
        category = :category,
        updatedAt = :updatedAt
      REMOVE visitId
    `,
    ExpressionAttributeNames: {
      "#status": "status"
    },
    ExpressionAttributeValues: {
      ":guestyTaskId": s(guestyTaskId),
      ":guestyTaskStatus": s(getGuestyTaskStatus(task)),
      ":lastGuestyEventType": s(eventType),
      ":lastSyncedAt": s(now),
      ":lastUpdateSource": s("Guesty"),
      ":syncStatus": s("Synced"),
      ":rawGuestyPayload": s(JSON.stringify(task)),
      ":status": s(yallaStatus),
      ":title": s(getTaskTitle(task)),
      ":description": s(getTaskDescription(task)),
      ":propertyId": s(getPropertyId(task)),
      ":dueDate": s(getDueDate(task)),
      ":teamId": s(getYallaTeamIdForGuestyType(task)),
      ":category": s(getTaskCategory(task) || "other"),
      ":updatedAt": s(now)
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
      return {
        statusCode: 200,
        body: ""
      };
    }

    if (method !== "POST") {
      return httpJson(405, {
        error: "Method not allowed. Use POST."
      });
    }

    if (WEBHOOK_SECRET) {
      const receivedSecret =
        getHeader(event, "x-webhook-secret") ||
        getHeader(event, "x-guesty-secret");

      if (receivedSecret !== WEBHOOK_SECRET) {
        return httpJson(401, {
          error: "Unauthorized"
        });
      }
    }

    const payload = parseBody(event);
    const task = getTask(payload);
    const eventType =
      payload?.event ||
      payload?.type ||
      payload?.eventType ||
      "unknown";

    console.log("Guesty task payload:", JSON.stringify(payload, null, 2));

    const guestyTaskId = getGuestyTaskId(task);

    if (!guestyTaskId) {
      console.warn("Missing GuestyTaskID. Payload:", JSON.stringify(payload));
      return httpJson(400, {
        error: "Missing GuestyTaskID"
      });
    }

    if (shouldIgnoreGuestyTask(task)) {
      return httpJson(200, {
        ok: true,
        ignored: true,
        reason: "Task type ignored",
        guestyTaskId,
        guestyType: normalizeGuestyTaskType(task)
      });
    }

    const shouldCreateVisit = shouldCreateVisitFromGuestyTask(task);
    const guestyStatus = getGuestyTaskStatus(task);

    if (shouldCreateVisit) {
      const scheduledDate = getScheduledDate(task);

      const yallaStatus = mapGuestyToYallaVisitStatus({
        guestyStatus,
        scheduledDate,
        eventType
      });

      const existingVisit = await findVisitByGuestyTaskId(guestyTaskId);
      const visitId = existingVisit
        ? getExistingId(existingVisit)
        : `GST-${guestyTaskId}`;

      if (existingVisit) {
        await updateVisitFromGuesty({
          visitId,
          task,
          guestyTaskId,
          eventType,
          yallaStatus,
          existingVisit
        });
      } else {
        await createVisitFromGuesty({
          visitId,
          task,
          guestyTaskId,
          eventType,
          yallaStatus
        });
      }

      let bookingReconcile = null;
      try {
        bookingReconcile = await reconcileCleaningVisit({
          task,
          visitId,
          yallaStatus
        });
      } catch (reconcileError) {
        console.error("Failed to reconcile cleaning visit", visitId, reconcileError);
      }

      return httpJson(200, {
        ok: true,
        destination: "yalla-visits",
        guestyTaskId,
        id: visitId,
        guestyType: normalizeGuestyTaskType(task),
        teamId: getYallaTeamIdForGuestyType(task),
        visitTypeId: getVisitTypeIdForGuestyType(task),
        status: yallaStatus,
        reservationId: getReservationId(task) || undefined,
        bookingReconcile
      });
    }

    const yallaStatus = mapGuestyToYallaTaskStatus({
      guestyStatus,
      eventType
    });

    const existingTask = await findTaskByGuestyTaskId(guestyTaskId);
    const taskId = existingTask
      ? getExistingId(existingTask)
      : `TASK-GST-${guestyTaskId}`;

    if (existingTask) {
      await updateTaskFromGuesty({
        taskId,
        task,
        guestyTaskId,
        eventType,
        yallaStatus
      });
    } else {
      await createTaskFromGuesty({
        taskId,
        task,
        guestyTaskId,
        eventType,
        yallaStatus
      });
    }

    return httpJson(200, {
      ok: true,
      destination: "yalla-tasks",
      guestyTaskId,
      id: taskId,
      guestyType: normalizeGuestyTaskType(task),
      teamId: getYallaTeamIdForGuestyType(task),
      status: yallaStatus
    });

  } catch (err) {
    console.error("Task receiver failed:", err);

    return httpJson(500, {
      error: err?.message || "Internal error"
    });
  }
};