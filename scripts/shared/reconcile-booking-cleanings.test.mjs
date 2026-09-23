import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  classifyBookingCancellation,
  datesToScan,
  extractReservationIdFromTask,
  isCleaningVisitType,
  shouldCreateEarlyCheckoutVisit,
  toMadridDate,
} from "./reconcile-booking-cleanings.mjs";

test("never-started: canceled before check-in", () => {
  assert.equal(
    classifyBookingCancellation({
      status: "canceled",
      checkInDate: "2026-09-12",
      canceledAt: "2026-08-30T22:16:02.350Z",
      isMidStay: false,
      guestStayStatus: "not_set",
    }),
    "never-started"
  );
});

test("early-checkout: canceled on a later calendar day", () => {
  assert.equal(
    classifyBookingCancellation({
      status: "canceled",
      checkInDate: "2026-09-12",
      canceledAt: "2026-09-13T10:00:00.000Z",
      isMidStay: false,
      guestStayStatus: "not_set",
    }),
    "early-checkout"
  );
});

test("never-started: canceled overnight into the check-in calendar day", () => {
  assert.equal(
    classifyBookingCancellation({
      status: "canceled",
      checkInDate: "2026-09-23",
      canceledAt: "2026-09-22T23:02:30.600Z",
      isMidStay: false,
      guestStayStatus: "not_set",
    }),
    "never-started"
  );
});

test("never-started: canceled on check-in day without a started stay", () => {
  assert.equal(
    classifyBookingCancellation({
      status: "canceled",
      checkInDate: "2026-09-23",
      canceledAt: "2026-09-23T08:00:00.000Z",
      isMidStay: false,
      guestStayStatus: "not_set",
    }),
    "never-started"
  );
});

test("early-checkout: same-day cancel after check-in status", () => {
  assert.equal(
    classifyBookingCancellation({
      status: "canceled",
      checkInDate: "2026-09-23",
      canceledAt: "2026-09-23T18:00:00.000Z",
      isMidStay: false,
      guestStayStatus: "checked_in",
    }),
    "early-checkout"
  );
});

test("does not invent a reconcile visit when Guesty already covered the day", () => {
  assert.equal(
    shouldCreateEarlyCheckoutVisit({
      openVisitCount: 0,
      hasTerminalVisit: true,
      hasOpenCleaningOnTargetDate: false,
    }),
    false
  );
  assert.equal(
    shouldCreateEarlyCheckoutVisit({
      openVisitCount: 0,
      hasTerminalVisit: false,
      hasOpenCleaningOnTargetDate: true,
    }),
    false
  );
  assert.equal(
    shouldCreateEarlyCheckoutVisit({
      openVisitCount: 0,
      hasTerminalVisit: false,
      hasOpenCleaningOnTargetDate: false,
    }),
    true
  );
});

test("early-checkout: mid-stay flag wins", () => {
  assert.equal(
    classifyBookingCancellation({
      status: "cancelled",
      checkInDate: "2026-09-12",
      canceledAt: "2026-08-01T00:00:00.000Z",
      isMidStay: true,
      guestStayStatus: "not_set",
    }),
    "early-checkout"
  );
});

test("closed stays closed", () => {
  assert.equal(
    classifyBookingCancellation({
      status: "closed",
      checkInDate: "2026-09-11",
      canceledAt: "",
      isMidStay: false,
    }),
    "closed"
  );
});

test("confirmed is active", () => {
  assert.equal(
    classifyBookingCancellation({
      status: "confirmed",
      checkInDate: "2026-09-15",
    }),
    "active"
  );
});

test("P2 common-area tasks have no reservation id", () => {
  assert.equal(extractReservationIdFromTask({ title: "P2 - Light refresh" }), "");
  assert.equal(
    extractReservationIdFromTask({ reservationId: "abc123" }),
    "abc123"
  );
});

test("only cleaning visit types reconcile", () => {
  assert.equal(isCleaningVisitType("visit_type_cleaning"), true);
  assert.equal(isCleaningVisitType("visit_type_maintenance"), false);
  assert.equal(isCleaningVisitType("visit_type_property_check"), false);
});

test("Madrid date from UTC evening stays on the business calendar", () => {
  assert.equal(toMadridDate("2026-09-14T09:00:00.000Z"), "2026-09-14");
  assert.equal(addDays("2026-09-15", 1), "2026-09-16");
});

test("scan window includes checkout plus one", () => {
  const dates = datesToScan("2026-09-11", "2026-09-15", "");
  assert.ok(dates.includes("2026-09-11"));
  assert.ok(dates.includes("2026-09-15"));
  assert.ok(dates.includes("2026-09-16"));
});
