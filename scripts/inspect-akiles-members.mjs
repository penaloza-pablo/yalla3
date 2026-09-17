#!/usr/bin/env node
// Inspects Akiles members created by the Guesty integration and prints only
// metadata *keys* plus whether sourceID looks like a Guesty reservation id.
//
// Usage:
//   AKILES_ACCESS_TOKEN=acctok_... node scripts/inspect-akiles-members.mjs

import { loadAkilesSecret, readAkilesField } from './akiles-secret.mjs';

const API_BASE = "https://api.akiles.app/v2";
const GUESTY_OBJECT_ID = /^[a-f0-9]{24}$/i;

const asString = (value) => (typeof value === "string" ? value.trim() : "");
const asRecord = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};

const main = async () => {
  const secret = await loadAkilesSecret().catch(() => ({}));
  const token =
    asString(process.env.AKILES_ACCESS_TOKEN) ||
    readAkilesField(secret, ["accessToken", "access_token"]);
  if (!token) {
    process.stdout.write(
      [
        "No AKILES_ACCESS_TOKEN. Join strategy from Yalla + Akiles docs:",
        "- yalla-bookings.Access stores https://link.akiles.app/ml_... (magic link URL).",
        "- Events expose member_id (mem_) / member_magic_link_id (mml_), not that URL.",
        "- GET /members filters metadata.source and metadata.sourceID; PMS guide stores reservation id in metadata.",
        "- Resolver primary key: metadata.sourceID === yalla-bookings.ReservationID.",
        ""
      ].join("\n")
    );
    return;
  }

  const listMembers = async (params) => {
    const url = new URL(`${API_BASE}/members`);
    url.searchParams.set("limit", "20");
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` }
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`List members failed (${response.status}).`);
    }
    return Array.isArray(payload.data) ? payload.data : [];
  };

  let rows = [];
  try {
    rows = await listMembers({ "metadata.source": "guesty" });
  } catch {
    rows = [];
  }
  if (rows.length === 0) {
    rows = await listMembers({});
  }
  for (const member of rows) {
    const metadata = asRecord(member.metadata);
    const sourceID = asString(metadata.sourceID || metadata.sourceId);
    process.stdout.write(
      JSON.stringify({
        id: asString(member.id),
        metadataKeys: Object.keys(metadata),
        source: asString(metadata.source),
        sourceIDLooksLikeReservation: GUESTY_OBJECT_ID.test(sourceID)
      }) + "\n"
    );
  }
  if (rows.length === 0) {
    process.stdout.write("No members returned.\n");
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
