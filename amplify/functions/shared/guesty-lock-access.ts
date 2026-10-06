import {
  isGuestyNoContent,
  isGuestyNotFound,
  loadGuestyClient,
} from './guesty-client';

export const RODAS_LISTING_ID = '69403ac1ecebad0012777738';

const asString = (value: unknown) =>
  typeof value === 'string'
    ? value.trim()
    : value == null
      ? ''
      : String(value).trim();

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

export const isRodasProperty = (
  listingId?: string | null,
  listingNickname?: string | null,
) => {
  if (asString(listingId) === RODAS_LISTING_ID) {
    return true;
  }
  return foldPlannerText(listingNickname) === 'rodas';
};

const codesFromPayload = (payload: unknown) => {
  const root = asRecord(payload);
  if (!root) {
    return [];
  }
  if (Array.isArray(root.codes)) {
    return root.codes;
  }
  const nested = asRecord(root.data);
  return Array.isArray(nested?.codes) ? nested.codes : [];
};

export const extractGuestyGuestAccessCode = (payload: unknown) => {
  const codes = codesFromPayload(payload)
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const guest = codes.find(
    (entry) => asString(entry.purpose).toUpperCase() === 'GUEST',
  );
  return asString(guest?.code);
};

export const fetchGuestyGuestAccessCode = async (reservationId: string) => {
  const id = asString(reservationId);
  if (!id) {
    return '';
  }
  const client = await loadGuestyClient();
  if (!client) {
    return '';
  }
  try {
    const payload = await client.guestyGet('/v1/guest-code', {
      reservationId: id,
    });
    return extractGuestyGuestAccessCode(payload);
  } catch (error) {
    if (isGuestyNotFound(error) || isGuestyNoContent(error)) {
      return '';
    }
    console.warn(`Failed to fetch Guesty guest code for ${id}`, error);
    return '';
  }
};

export const applyGuestyLockCodeToBooking = async (
  item: Record<string, unknown>,
  fetchCode: (
    reservationId: string,
  ) => Promise<string> = fetchGuestyGuestAccessCode,
) => {
  if (!isRodasProperty(asString(item.ListingID), asString(item.ListingNickname))) {
    return item;
  }
  const reservationId = asString(item.ReservationID);
  if (!reservationId) {
    return item;
  }
  const code = asString(await fetchCode(reservationId));
  if (!code || code === asString(item.Access)) {
    return item;
  }
  return { ...item, Access: code };
};
