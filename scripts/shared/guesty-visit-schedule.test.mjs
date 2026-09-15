import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveGuestyVisitSchedule,
  visitChangeAffectsReadyCleaningPlan,
} from "./guesty-visit-schedule.mjs";

const planned = {
  existingDate: "2026-09-16",
  existingStart: "09:00",
  existingEnd: "11:00",
  existingDuration: 120,
  existingSource: "Yalla",
  existingIsTerminal: false,
};

test("keeps planned hours when Guesty updates the same day", () => {
  const resolved = resolveGuestyVisitSchedule({
    ...planned,
    guestyDate: "2026-09-16",
    guestyStart: "11:00",
    guestyEnd: "13:00",
    guestyDuration: 120,
  });
  assert.equal(resolved.preserveTime, true);
  assert.equal(resolved.nextDate, "2026-09-16");
  assert.equal(resolved.nextStart, "09:00");
  assert.equal(resolved.nextEnd, "11:00");
  assert.equal(resolved.keepYallaSource, true);
  assert.equal(resolved.dateChanged, false);
});

test("applies Guesty date when a ready plan had frozen the visit", () => {
  const resolved = resolveGuestyVisitSchedule({
    ...planned,
    guestyDate: "2026-09-18",
    guestyStart: "11:00",
    guestyEnd: "13:00",
    guestyDuration: 120,
  });
  assert.equal(resolved.preserveTime, false);
  assert.equal(resolved.preserveDate, false);
  assert.equal(resolved.nextDate, "2026-09-18");
  assert.equal(resolved.nextStart, "11:00");
  assert.equal(resolved.nextEnd, "13:00");
  assert.equal(resolved.keepYallaSource, false);
  assert.equal(resolved.dateChanged, true);
});

test("does not move a completed visit", () => {
  const resolved = resolveGuestyVisitSchedule({
    ...planned,
    existingIsTerminal: true,
    guestyDate: "2026-09-18",
    guestyStart: "11:00",
    guestyEnd: "13:00",
    guestyDuration: 120,
  });
  assert.equal(resolved.preserveDate, true);
  assert.equal(resolved.nextDate, "2026-09-16");
  assert.equal(resolved.dateChanged, false);
});

test("same-day checkout time change does not reopen the plan", () => {
  const resolved = resolveGuestyVisitSchedule({
    ...planned,
    existingStart: "11:00",
    existingEnd: "13:00",
    guestyDate: "2026-09-16",
    guestyStart: "13:00",
    guestyEnd: "15:00",
    guestyDuration: 120,
  });
  assert.equal(resolved.dateChanged, false);
  assert.equal(resolved.nextDate, "2026-09-16");
  assert.equal(resolved.nextStart, "11:00");
  assert.equal(
    visitChangeAffectsReadyCleaningPlan({
      isCleaningVisit: true,
      previousDate: "2026-09-16",
      nextDate: "2026-09-16",
      previousStatus: "SCHEDULED",
      nextStatus: "SCHEDULED",
    }),
    false
  );
});

test("flags checkout moves and cancellations for plan reopen", () => {
  assert.equal(
    visitChangeAffectsReadyCleaningPlan({
      isCleaningVisit: true,
      previousDate: "2026-09-16",
      nextDate: "2026-09-18",
      previousStatus: "SCHEDULED",
      nextStatus: "SCHEDULED",
    }),
    true
  );
  assert.equal(
    visitChangeAffectsReadyCleaningPlan({
      isCleaningVisit: true,
      previousDate: "2026-09-16",
      nextDate: "2026-09-16",
      previousStatus: "SCHEDULED",
      nextStatus: "CANCELLED",
    }),
    true
  );
  assert.equal(
    visitChangeAffectsReadyCleaningPlan({
      isCleaningVisit: true,
      previousDate: "2026-09-16",
      nextDate: "2026-09-16",
      previousStatus: "SCHEDULED",
      nextStatus: "SCHEDULED",
    }),
    false
  );
  assert.equal(
    visitChangeAffectsReadyCleaningPlan({
      isCleaningVisit: false,
      previousDate: "2026-09-16",
      nextDate: "2026-09-18",
    }),
    false
  );
});
