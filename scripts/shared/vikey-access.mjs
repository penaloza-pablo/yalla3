export const ESPERANZA_9_LISTING_ID = "6835cef04af0d8002845abdd";
export const VIKEY_OPENING_LINK_FIELD_ID = "6ab9046c5f0554002a3d33ee";
export const VIKEY_OPENING_LINK_KEYS = ["vikey_opening_link"];

function asString(value) {
  if (typeof value === "string") return value.trim();
  if (value == null) return "";
  return String(value).trim();
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function foldPlannerText(value) {
  return asString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function fieldKey(field) {
  return asString(field.key || field.fieldKey || field.name || field.label).toLowerCase();
}

export function isEsperanza9Property(listingId, listingNickname) {
  if (asString(listingId) === ESPERANZA_9_LISTING_ID) return true;
  return foldPlannerText(listingNickname) === "esperanza 9";
}

export function isVikeyOpeningLink(value) {
  const text = asString(value);
  if (!text) return false;
  if (/^https?:\/\/guest\.vikey\.it\/reservations\/[a-z0-9]+\/?$/i.test(text)) {
    return true;
  }
  if (
    /^https?:\/\/checkin\.vikey\.it\/reservation\/[a-z0-9]+\/opening\/?$/i.test(text)
  ) {
    return true;
  }
  return false;
}

export function extractVikeyOpeningLink(reservation) {
  const root = asRecord(reservation);
  const fields = Array.isArray(root?.customFields) ? root.customFields : [];
  const records = fields.filter((entry) => asRecord(entry));

  const byKey = records.find((field) =>
    VIKEY_OPENING_LINK_KEYS.includes(fieldKey(field))
  );
  const keyedValue = asString(byKey?.value);
  if (keyedValue) return keyedValue;

  const byId = records.find(
    (field) => asString(field.fieldId) === VIKEY_OPENING_LINK_FIELD_ID
  );
  const idValue = asString(byId?.value);
  if (idValue) return idValue;

  for (const field of records) {
    const value = asString(field.value);
    if (isVikeyOpeningLink(value)) return value;
  }
  return "";
}

export function resolveEsperanza9Access({
  listingId,
  listingNickname,
  access,
  reservation
}) {
  const current = asString(access);
  if (!isEsperanza9Property(listingId, listingNickname)) return current;
  return extractVikeyOpeningLink(reservation) || current;
}
