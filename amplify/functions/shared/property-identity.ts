const asText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

/** Canonical Yalla nicknames for P2 rooms, keyed by Guesty listing id. */
export const P2_ROOM_DISPLAY_BY_ID: Record<string, string> = {
  '693c3fa8937d490014b5bceb': '201',
  '6928222e394afb00100cf038': '202',
  '693c58109994960014f586d7': '203',
  '693c58109994960014f58732': '204',
  '693c5b7bb122320015236bcc': '205',
  '6928222e394afb00100cf048': '206',
  '693c59b29430f10014539e64': '207',
  '693c58109994960014f5878d': '208',
  '693c5b7bb122320015236bee': '209',
  '6928222e394afb00100cf040': '210',
  '693c3ad20c4f0500133cd017': '211',
  '693c3ad20c4f0500133ccfc3': '212',
};

export const P2_BUILDING_ID = 'planta2';
export const PLANTA_2_REPORT_NAME = 'Planta 2';
export const PROPERTY_REPORTS_START_MONTH = '2026-08';

export const P2_REPORT_MEMBER_IDS = [
  P2_BUILDING_ID,
  ...Object.keys(P2_ROOM_DISPLAY_BY_ID),
];

export const P2_ROOM_NICKNAMES = new Set(Object.values(P2_ROOM_DISPLAY_BY_ID));

export const yallaAliasForListingId = (id?: string | null) =>
  P2_ROOM_DISPLAY_BY_ID[(id ?? '').trim()] ?? '';

export const isP2RoomListingId = (id?: string | null) =>
  Boolean(yallaAliasForListingId(id));

export const isP2RoomNickname = (value?: string | null) =>
  P2_ROOM_NICKNAMES.has((value ?? '').trim());

export const isP2BuildingId = (id?: string | null) =>
  (id ?? '').trim().toLowerCase() === P2_BUILDING_ID;

export type PropertyIdentityInput = {
  id?: string | null;
  nickname?: string | null;
  listingNickname?: string | null;
  title?: string | null;
};

export const resolveYallaPropertyLabel = (input: PropertyIdentityInput) => {
  const id = (input.id ?? '').trim();
  const alias = yallaAliasForListingId(id);
  if (alias) {
    return alias;
  }
  const nickname = (input.nickname ?? '').trim();
  if (nickname) {
    return nickname;
  }
  const listingNickname = (input.listingNickname ?? '').trim();
  if (listingNickname) {
    return listingNickname;
  }
  const title = (input.title ?? '').trim();
  return title || id;
};

export const resolveYallaPropertyLabelFromRecord = (
  item: Record<string, unknown> | undefined | null,
  fallbackId = '',
) => {
  if (!item) {
    return yallaAliasForListingId(fallbackId) || fallbackId;
  }
  const id =
    asText(item.id) ||
    asText(item.ListingID) ||
    asText(item.listingId) ||
    fallbackId;
  return resolveYallaPropertyLabel({
    id,
    nickname: asText(item.nickname) || asText(item.Nickname),
    listingNickname:
      asText(item.ListingNickname) || asText(item.listingNickname),
    title: asText(item.title) || asText(item.Title) || asText(item.name),
  });
};

export const guestyNicknameMismatchAlias = (
  input: PropertyIdentityInput,
): string | null => {
  const alias = yallaAliasForListingId(input.id);
  if (!alias) {
    return null;
  }
  const yallaName = (input.nickname ?? '').trim();
  // Canonical alias already applied in Yalla; Guesty may keep a different listing nickname.
  if (!yallaName || yallaName === alias) {
    return null;
  }
  return alias;
};

export const collectGuestyNicknameMismatches = (
  rows: PropertyIdentityInput[],
) => {
  const aliases: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const alias = guestyNicknameMismatchAlias(row);
    if (alias && !seen.has(alias)) {
      seen.add(alias);
      aliases.push(alias);
    }
  }
  return aliases;
};

const foldedIdentityText = (input: PropertyIdentityInput) =>
  [input.id, input.nickname, input.listingNickname, input.title]
    .map((value) => (value ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');

export const isOtherPropertyIdentity = (input: PropertyIdentityInput) =>
  (input.id ?? '').trim().toLowerCase() === 'other';

export const isJclStorageIdentity = (input: PropertyIdentityInput) => {
  const id = (input.id ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (id === 'jclstorage') {
    return true;
  }
  const folded = foldedIdentityText(input);
  return /jcl\s*storage/.test(folded) || folded.replace(/[\s_-]+/g, '').includes('jclstorage');
};

export const isP2ReportGroupId = (id?: string | null) => isP2BuildingId(id);

export const isP2ReportMemberId = (id?: string | null) =>
  isP2BuildingId(id) || isP2RoomListingId(id);

export const p2ReportMemberIds = () => [...P2_REPORT_MEMBER_IDS];
