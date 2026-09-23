const GUESTY_CLIENT_PATH =
  '/opt/nodejs/node_modules/@nockai/guesty-client/index.mjs';

export type GuestyClient = {
  guestyGet: (
    path: string,
    params?: Record<string, unknown>,
  ) => Promise<unknown>;
  guestyPut: (path: string, body: unknown) => Promise<unknown>;
  guestyPost: (path: string, body: unknown) => Promise<unknown>;
};

export const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asFunction = (value: unknown) =>
  typeof value === 'function' ? value : null;

const firstReservation = (payload: unknown): Record<string, unknown> | null => {
  if (Array.isArray(payload)) {
    return asRecord(payload[0]);
  }
  const record = asRecord(payload);
  if (!record) {
    return null;
  }
  for (const key of ['data', 'results', 'reservations', 'items']) {
    const nested = record[key];
    if (Array.isArray(nested)) {
      return asRecord(nested[0]);
    }
  }
  return record.notes || record._id || record.id || record.specialRequests
    ? record
    : null;
};

export const isGuestyNotFound = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    const text = String(error ?? '');
    return /\b404\b/.test(text) || /not found/i.test(text);
  }
  const record = error as Record<string, unknown>;
  if (record.status === 404 || record.statusCode === 404) {
    return true;
  }
  const nested = asRecord(record.response) ?? asRecord(record.error);
  if (nested?.status === 404 || nested?.statusCode === 404) {
    return true;
  }
  const message = String(record.message ?? error);
  return /\b404\b/.test(message) || /not found/i.test(message);
};

export const loadGuestyClient = async (): Promise<GuestyClient | null> => {
  try {
    const loaded = (await import(GUESTY_CLIENT_PATH)) as Record<string, unknown>;
    const guestyGet = asFunction(loaded.guestyGet);
    const guestyPut = asFunction(loaded.guestyPut);
    if (!guestyGet || !guestyPut) {
      return null;
    }
    const nativePost = asFunction(loaded.guestyPost);
    const request = asFunction(loaded.guestyRequest);
    const guestyPost: GuestyClient['guestyPost'] = nativePost
      ? (path, body) =>
          nativePost(path, body) as Promise<unknown>
      : request
        ? (path, body) =>
            request('POST', path, body) as Promise<unknown>
        : async () => {
            throw new Error('Guesty client does not expose POST.');
          };
    return {
      guestyGet: guestyGet as GuestyClient['guestyGet'],
      guestyPut: guestyPut as GuestyClient['guestyPut'],
      guestyPost,
    };
  } catch (error) {
    console.warn('Guesty client layer is not available', error);
    return null;
  }
};

export const fetchGuestyReservation = async (
  client: GuestyClient,
  reservationId: string,
) => {
  const encoded = encodeURIComponent(reservationId);
  try {
    const byIds = await client.guestyGet(
      `/v1/reservations-v3?reservationIds[]=${encoded}`,
    );
    const reservation = firstReservation(byIds);
    if (reservation) {
      return reservation;
    }
  } catch (error) {
    console.warn('Guesty GET reservations-v3 by ids failed', error);
  }

  try {
    return firstReservation(
      await client.guestyGet(`/v1/reservations/${encoded}`),
    );
  } catch (error) {
    console.warn('Guesty GET reservations by id failed', error);
    return null;
  }
};
