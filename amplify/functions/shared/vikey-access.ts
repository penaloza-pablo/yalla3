export const ESPERANZA_9_LISTING_ID = '6835cef04af0d8002845abdd';
export const VIKEY_OPENING_LINK_FIELD_ID = '6ab9046c5f0554002a3d33ee';
export const VIKEY_OPENING_LINK_KEYS = ['vikey_opening_link'];

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const foldPlannerText = (value: unknown) =>
  asString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const fieldKey = (field: Record<string, unknown>) =>
  asString(field.key || field.fieldKey || field.name || field.label).toLowerCase();

export const isEsperanza9Property = (
  listingId?: string | null,
  listingNickname?: string | null,
) => {
  if (asString(listingId) === ESPERANZA_9_LISTING_ID) {
    return true;
  }
  return foldPlannerText(listingNickname) === 'esperanza 9';
};

export const isVikeyOpeningLink = (value: unknown) => {
  const text = asString(value);
  if (!text) {
    return false;
  }
  if (/^https?:\/\/guest\.vikey\.it\/reservations\/[a-z0-9]+\/?$/i.test(text)) {
    return true;
  }
  if (
    /^https?:\/\/checkin\.vikey\.it\/reservation\/[a-z0-9]+\/opening\/?$/i.test(
      text,
    )
  ) {
    return true;
  }
  return false;
};

const customFieldsFrom = (reservation: unknown) => {
  const root = asRecord(reservation);
  if (!root) {
    return [];
  }
  return Array.isArray(root.customFields) ? root.customFields : [];
};

export const extractVikeyOpeningLink = (reservation: unknown) => {
  const fields = customFieldsFrom(reservation)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));

  const byKey = fields.find((field) =>
    VIKEY_OPENING_LINK_KEYS.includes(fieldKey(field)),
  );
  const keyedValue = asString(byKey?.value);
  if (keyedValue) {
    return keyedValue;
  }

  const byId = fields.find(
    (field) => asString(field.fieldId) === VIKEY_OPENING_LINK_FIELD_ID,
  );
  const idValue = asString(byId?.value);
  if (idValue) {
    return idValue;
  }

  for (const field of fields) {
    const value = asString(field.value);
    if (isVikeyOpeningLink(value)) {
      return value;
    }
  }
  return '';
};

export const reservationFromRawPayload = (raw: unknown) => {
  let parsed: unknown = raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const root = asRecord(parsed);
  if (!root) {
    return null;
  }
  const nestedData = asRecord(root.data);
  const reservation =
    asRecord(root.reservation) ||
    asRecord(nestedData?.reservation) ||
    nestedData ||
    root;
  return reservation;
};

export const resolveEsperanza9Access = ({
  listingId,
  listingNickname,
  access,
  reservation,
}: {
  listingId?: string | null;
  listingNickname?: string | null;
  access?: string | null;
  reservation?: unknown;
}) => {
  const current = asString(access);
  if (!isEsperanza9Property(listingId, listingNickname)) {
    return current;
  }
  return extractVikeyOpeningLink(reservation) || current;
};

export const applyVikeyOpeningLinkToBooking = (
  item: Record<string, unknown>,
) => {
  const reservation = reservationFromRawPayload(item.RawPayload);
  const access = resolveEsperanza9Access({
    listingId: asString(item.ListingID),
    listingNickname: asString(item.ListingNickname),
    access: asString(item.Access),
    reservation,
  });
  if (access === asString(item.Access)) {
    return item;
  }
  return { ...item, Access: access };
};
