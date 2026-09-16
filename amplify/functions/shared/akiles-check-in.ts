import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import {
  applyTrackerFlagPatch,
  readTrackerFlags,
  shouldIncludeBooking,
} from './check-in-tracker';
import { nowIso } from './dynamo-http';

export const AKILES_ACTOR = 'akiles';
export const AKILES_API_BASE = 'https://api.akiles.app/v2';
export const AKILES_AUTH_URL = 'https://auth.akiles.app/oauth2/token';
export const AKILES_SECRET_ID = 'yalla/akiles';

export const CHECK_IN_TRACKER_PRESERVED_FIELDS = [
  'CheckInAccessGranted',
  'CheckInAccessGrantedAt',
  'CheckInAccessGrantedBy',
  'CheckInGuestEntered',
  'CheckInGuestEnteredAt',
  'CheckInGuestEnteredBy',
  'AkilesMemberId',
  'AkilesCheckedInAt',
  'AkilesCheckedInEventId',
] as const;

const GUESTY_OBJECT_ID = /^[a-f0-9]{24}$/i;
const EXCLUDED_PROPERTY_NAMES = ['baranda', 'almendro', 'esperanza 9', 'rodas'];
const RESERVATION_METADATA_KEYS = [
  'sourceID',
  'sourceId',
  'reservation_id',
  'reservationId',
  'reservationID',
  'guestyReservationId',
  'guesty_reservation_id',
  'guestyId',
];

const secretsClient = new SecretsManagerClient({});
const SECRET_CACHE_TTL_MS = 60 * 1000;

export type AkilesSecrets = {
  webhookSecret: string;
  accessToken: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
};

type SecretCache = { value: AkilesSecrets; expiresAt: number; raw: Record<string, unknown> };

let secretCache: SecretCache | undefined;

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const normalizeKey = (value: string) => value.toLowerCase().replace(/[\s_-]/g, '');

const readSecretField = (payload: Record<string, unknown>, aliases: string[]) => {
  const byNormalized = new Map<string, string>();
  for (const [key, value] of Object.entries(payload)) {
    if (typeof value === 'string' && value.trim()) {
      byNormalized.set(normalizeKey(key), value.trim());
    }
  }
  for (const alias of aliases) {
    const match = byNormalized.get(normalizeKey(alias));
    if (match) {
      return match;
    }
  }
  return '';
};

export const decodeHttpBody = (event: {
  body?: string;
  isBase64Encoded?: boolean;
}) => {
  if (!event.body) {
    return '';
  }
  if (event.isBase64Encoded) {
    return Buffer.from(event.body, 'base64').toString('utf8');
  }
  return event.body;
};

export const getHeader = (
  headers: Record<string, string | string[] | undefined> | undefined,
  name: string,
) => {
  if (!headers) {
    return '';
  }
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== wanted) {
      continue;
    }
    const text = Array.isArray(value) ? value[0] : value;
    if (typeof text === 'string' && text.trim()) {
      return text.trim();
    }
  }
  return '';
};

export const isAkilesSignatureValid = (
  rawBody: string,
  signatureHex: string,
  secret: string,
) => {
  if (!secret || !signatureHex) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signatureHex.replace(/^sha256=/i, ''), 'hex');
  if (!received.length || expected.length !== received.length) {
    return false;
  }
  return timingSafeEqual(expected, received);
};

export const parseAkilesEvent = (rawBody: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    const record = asRecord(parsed);
    if (record?.event && typeof record.event === 'object') {
      return asRecord(record.event) ?? null;
    }
    return record ?? null;
  } catch {
    return null;
  }
};

export const isGadgetActionUse = (event: Record<string, unknown>) => {
  const verb = asString(event.verb).toLowerCase();
  if (verb && verb !== 'use') {
    return false;
  }
  const object = asRecord(event.object);
  const objectType = asString(object?.type || event.object_type).toLowerCase();
  return objectType === 'gadget_action';
};

export const memberIdFromEvent = (event: Record<string, unknown>) => {
  const subject = asRecord(event.subject);
  const object = asRecord(event.object);
  return (
    asString(subject?.member_id) ||
    asString(object?.member_id) ||
    asString(asRecord(event.subject_member)?.id) ||
    asString(asRecord(event.member)?.id)
  );
};

export const memberFromEvent = (event: Record<string, unknown>) =>
  asRecord(event.subject_member) ||
  asRecord(event.member) ||
  asRecord(event.object_member);

export const eventOccurredAt = (event: Record<string, unknown>) =>
  asString(event.occurred_at) || asString(event.created_at) || nowIso();

export const isGuestyReservationId = (value: string) => GUESTY_OBJECT_ID.test(value);

export const isExcludedAkilesProperty = (listingNickname: unknown) => {
  const folded = asString(listingNickname).toLowerCase();
  if (!folded) {
    return false;
  }
  return EXCLUDED_PROPERTY_NAMES.some(
    (name) =>
      folded === name ||
      folded.startsWith(`${name} `) ||
      folded.startsWith(`${name}/`) ||
      folded.startsWith(`${name} ·`),
  );
};

const metadataLooksLikeStaff = (metadata: Record<string, unknown>) => {
  const source = asString(metadata.source || metadata.Source).toLowerCase();
  if (!source) {
    return false;
  }
  return source !== 'guesty' && !source.includes('guesty');
};

export const reservationIdFromMemberMetadata = (
  metadata: Record<string, unknown> | undefined,
): string => {
  if (!metadata) {
    return '';
  }
  if (metadataLooksLikeStaff(metadata)) {
    return '';
  }
  for (const key of RESERVATION_METADATA_KEYS) {
    const value = asString(metadata[key]);
    if (isGuestyReservationId(value)) {
      return value;
    }
  }
  for (const [key, raw] of Object.entries(metadata)) {
    const folded = normalizeKey(key);
    if (!folded.includes('reservation') && folded !== 'sourceid') {
      continue;
    }
    const value = asString(raw);
    if (isGuestyReservationId(value)) {
      return value;
    }
  }
  return '';
};

export type AkilesResolveResult =
  | { ok: true; reservationId: string; memberId: string }
  | { ok: false; reason: string; memberId: string };

export const resolveReservationFromAkilesEvent = (
  event: Record<string, unknown>,
  member?: Record<string, unknown>,
): AkilesResolveResult => {
  const memberId = memberIdFromEvent(event) || asString(member?.id);
  if (!memberId) {
    return { ok: false, reason: 'missing_member', memberId: '' };
  }
  const resolvedMember = member || memberFromEvent(event);
  const metadata = asRecord(resolvedMember?.metadata);
  if (!resolvedMember) {
    return { ok: false, reason: 'member_not_expanded', memberId };
  }
  if (!metadata || Object.keys(metadata).length === 0) {
    return { ok: false, reason: 'staff_or_unmapped', memberId };
  }
  if (metadataLooksLikeStaff(metadata)) {
    return { ok: false, reason: 'staff_or_unmapped', memberId };
  }
  const reservationId = reservationIdFromMemberMetadata(metadata);
  if (!reservationId) {
    return { ok: false, reason: 'missing_reservation_metadata', memberId };
  }
  return { ok: true, reservationId, memberId };
};

export const loadAkilesSecrets = async (options?: { forceRefresh?: boolean }) => {
  if (
    !options?.forceRefresh &&
    secretCache &&
    Date.now() < secretCache.expiresAt
  ) {
    return secretCache.value;
  }
  const secretId = process.env.AKILES_SECRET_ID || AKILES_SECRET_ID;
  const result = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: secretId }),
  );
  const raw = result.SecretString;
  if (!raw) {
    throw new Error('Akiles secret has no SecretString.');
  }
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const value: AkilesSecrets = {
    webhookSecret: readSecretField(parsed, ['webhookSecret', 'secret', 'AKILES_WEBHOOK_SECRET']),
    accessToken: readSecretField(parsed, ['accessToken', 'access_token', 'AKILES_ACCESS_TOKEN']),
    refreshToken: readSecretField(parsed, [
      'refreshToken',
      'refresh_token',
      'AKILES_REFRESH_TOKEN',
    ]),
    clientId: readSecretField(parsed, ['clientId', 'client_id', 'AKILES_CLIENT_ID']),
    clientSecret: readSecretField(parsed, [
      'clientSecret',
      'client_secret',
      'AKILES_CLIENT_SECRET',
    ]),
  };
  secretCache = {
    value,
    raw: parsed,
    expiresAt: Date.now() + SECRET_CACHE_TTL_MS,
  };
  return value;
};

const persistAkilesTokens = async (accessToken: string, refreshToken: string) => {
  if (!secretCache) {
    return;
  }
  const nextRaw = {
    ...secretCache.raw,
    accessToken,
    refreshToken,
  };
  await secretsClient.send(
    new PutSecretValueCommand({
      SecretId: process.env.AKILES_SECRET_ID || AKILES_SECRET_ID,
      SecretString: JSON.stringify(nextRaw),
    }),
  );
  secretCache = {
    value: {
      ...secretCache.value,
      accessToken,
      refreshToken,
    },
    raw: nextRaw,
    expiresAt: Date.now() + SECRET_CACHE_TTL_MS,
  };
};

export const refreshAkilesAccessToken = async (secrets: AkilesSecrets) => {
  if (!secrets.refreshToken || !secrets.clientId || !secrets.clientSecret) {
    throw new Error('Akiles refresh token is not configured.');
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: secrets.clientId,
    client_secret: secrets.clientSecret,
    refresh_token: secrets.refreshToken,
  });
  const response = await fetch(AKILES_AUTH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw new Error(`Akiles token refresh failed (${response.status}).`);
  }
  const payload = (await response.json()) as Record<string, unknown>;
  const accessToken = asString(payload.access_token);
  const refreshToken = asString(payload.refresh_token) || secrets.refreshToken;
  if (!accessToken) {
    throw new Error('Akiles token refresh returned no access_token.');
  }
  try {
    await persistAkilesTokens(accessToken, refreshToken);
  } catch (error) {
    console.warn('Failed to persist rotated Akiles tokens', error);
  }
  return { ...secrets, accessToken, refreshToken };
};

export const fetchAkilesMember = async (
  memberId: string,
  secrets: AkilesSecrets,
): Promise<Record<string, unknown>> => {
  const request = async (accessToken: string) =>
    fetch(`${AKILES_API_BASE}/members/${encodeURIComponent(memberId)}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });

  let accessToken = secrets.accessToken;
  if (!accessToken) {
    throw new Error('Akiles access token is not configured.');
  }
  let response = await request(accessToken);
  if (response.status === 401) {
    const refreshed = await refreshAkilesAccessToken(secrets);
    accessToken = refreshed.accessToken;
    response = await request(accessToken);
  }
  if (!response.ok) {
    throw new Error(`Akiles get member failed (${response.status}).`);
  }
  const payload = (await response.json()) as unknown;
  const member = asRecord(payload);
  if (!member) {
    throw new Error('Akiles get member returned an empty body.');
  }
  return member;
};

export const canMarkAkilesCheckIn = (item: Record<string, unknown>) => {
  if (!shouldIncludeBooking(item)) {
    return { ok: false as const, reason: 'not_confirmed' };
  }
  if (isExcludedAkilesProperty(item.ListingNickname ?? item.ListingName)) {
    return { ok: false as const, reason: 'excluded_property' };
  }
  return { ok: true as const };
};

export const buildAkilesGuestEnteredUpdate = ({
  item,
  memberId,
  eventId,
  occurredAt,
}: {
  item: Record<string, unknown>;
  memberId: string;
  eventId: string;
  occurredAt: string;
}) => {
  const previous = readTrackerFlags(item);
  if (previous.guestEntered) {
    return { alreadyEntered: true as const, values: null };
  }
  const patched = applyTrackerFlagPatch(previous, {
    accessGranted: true,
    guestEntered: true,
  });
  if (!patched.ok) {
    return { alreadyEntered: false as const, values: null, error: patched.error };
  }
  const updatedAt = nowIso();
  const accessGrantedAt = previous.accessGranted
    ? typeof item.CheckInAccessGrantedAt === 'string' && item.CheckInAccessGrantedAt
      ? item.CheckInAccessGrantedAt
      : occurredAt
    : occurredAt;
  const accessGrantedBy = previous.accessGranted
    ? typeof item.CheckInAccessGrantedBy === 'string' && item.CheckInAccessGrantedBy
      ? item.CheckInAccessGrantedBy
      : AKILES_ACTOR
    : AKILES_ACTOR;
  return {
    alreadyEntered: false as const,
    values: {
      accessGranted: patched.flags.accessGranted,
      accessGrantedAt,
      accessGrantedBy,
      guestEntered: patched.flags.guestEntered,
      guestEnteredAt: occurredAt,
      guestEnteredBy: AKILES_ACTOR,
      updatedAt,
      akilesMemberId: memberId,
      akilesCheckedInAt: occurredAt,
      akilesCheckedInEventId: eventId,
    },
  };
};
