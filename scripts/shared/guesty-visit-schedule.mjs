// Resolves how a Guesty task update should land on a Yalla visit.
// Ready cleaning plans stamp lastUpdateSource=Yalla and a planned window.
// That freeze must keep the planned hours on the same day, but never block
// Guesty from moving or cancelling the visit onto another date.

export function timeToMinutes(value) {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function durationMinutesFromSchedule(startTime, endTime, storedMinutes) {
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

export function hasPlannedTimeWindow(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  return start != null && end != null && end - start >= 5;
}

export function resolveGuestyVisitSchedule({
  existingDate = "",
  existingStart = "",
  existingEnd = "",
  existingDuration = 0,
  existingSource = "",
  existingIsTerminal = false,
  guestyDate = "",
  guestyStart = "",
  guestyEnd = "",
  guestyDuration = 0,
} = {}) {
  const dateChanged = Boolean(
    existingDate && guestyDate && existingDate !== guestyDate
  );
  const preserveDate = Boolean(existingIsTerminal && existingDate);
  const preserveTime =
    hasPlannedTimeWindow(existingStart, existingEnd) &&
    (existingSource === "Yalla" || existingIsTerminal) &&
    !dateChanged;

  const nextDate = preserveDate
    ? existingDate
    : guestyDate || existingDate;
  const nextStart = preserveTime ? existingStart : guestyStart;
  const nextEnd = preserveTime ? existingEnd : guestyEnd;
  const nextDuration = preserveTime
    ? durationMinutesFromSchedule(existingStart, existingEnd, existingDuration)
    : guestyDuration;

  return {
    dateChanged: Boolean(existingDate && nextDate && existingDate !== nextDate),
    preserveDate,
    preserveTime,
    keepYallaSource: preserveTime || existingIsTerminal,
    nextDate,
    nextStart,
    nextEnd,
    nextDuration,
  };
}

export function visitChangeAffectsReadyCleaningPlan({
  isCleaningVisit = false,
  previousDate = "",
  nextDate = "",
  previousStatus = "",
  nextStatus = "",
  isCreate = false,
} = {}) {
  if (!isCleaningVisit) return false;
  const prevStatus = String(previousStatus || "").trim().toUpperCase();
  const next = String(nextStatus || "").trim().toUpperCase();
  const dateChanged = Boolean(
    previousDate && nextDate && previousDate !== nextDate
  );
  const cancelled = next === "CANCELLED" && prevStatus !== "CANCELLED";
  // Same-day time-only edits (e.g. checkout 11:00 → 13:00) must not reopen the plan.
  return Boolean(dateChanged || cancelled || (isCreate && nextDate));
}
