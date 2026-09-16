import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const PRESERVED_FIELDS = [
  "CheckInAccessGranted",
  "CheckInAccessGrantedAt",
  "CheckInAccessGrantedBy",
  "CheckInGuestEntered",
  "CheckInGuestEnteredAt",
  "CheckInGuestEnteredBy",
  "AkilesMemberId",
  "AkilesCheckedInAt",
  "AkilesCheckedInEventId"
];

test("bookings receiver copies check-in tracker flags across Guesty PutItem", () => {
  const source = fs.readFileSync(new URL("./index.mjs", import.meta.url), "utf8");
  for (const field of PRESERVED_FIELDS) {
    assert.match(
      source,
      new RegExp(`copyExistingAttribute\\(item, existing, "${field}"\\)`)
    );
  }
});
