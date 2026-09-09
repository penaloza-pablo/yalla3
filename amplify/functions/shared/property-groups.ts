import {
  isP2BuildingId,
  isP2RoomListingId,
  P2_BUILDING_ID,
  PLANTA_2_REPORT_NAME,
  p2ReportMemberIds,
  resolveYallaPropertyLabel,
  yallaAliasForListingId,
} from './property-identity';

export const REPORT_GROUP_TYPE = 'REPORT_GROUP';

export type GroupableProperty = {
  id?: string | null;
  nickname?: string | null;
  listingNickname?: string | null;
  title?: string | null;
  type?: string | null;
  memberIds?: unknown;
  memberNames?: unknown;
  system?: unknown;
  active?: unknown;
};

export type ReportGroupSeed = {
  id: string;
  name: string;
  system?: boolean;
  memberIds?: string[];
  memberNameHints?: string[];
};

export type ResolvedReportGroup = {
  id: string;
  name: string;
  memberIds: string[];
  memberNames: string[];
  system: boolean;
};

export const DEFAULT_REPORT_GROUP_SEEDS: ReportGroupSeed[] = [
  {
    id: P2_BUILDING_ID,
    name: PLANTA_2_REPORT_NAME,
    system: true,
    memberIds: p2ReportMemberIds(),
  },
  {
    id: 'arenal',
    name: 'Arenal',
    memberNameHints: ['arenal jerez', 'arenal rioja', 'arenal verdejo'],
  },
  {
    id: 'platano7',
    name: 'Plátano 7',
    memberNameHints: ['platano 7a', 'platano 7b', 'plátano 7a', 'plátano 7b'],
  },
];

export const foldGroupText = (value?: string | null) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const slugifyGroupId = (name: string) => {
  const slug = foldGroupText(name).replace(/[^a-z0-9]+/g, '');
  return slug.slice(0, 40);
};

export const asStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return [
      ...new Set(
        value
          .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
          .filter(Boolean),
      ),
    ];
  }
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return asStringList(parsed);
      }
    } catch {
      // Comma-separated fallback.
    }
    return [
      ...new Set(
        trimmed
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    ];
  }
  return [];
};

export const isReportGroupType = (type?: string | null) =>
  (type ?? '').trim().toUpperCase() === REPORT_GROUP_TYPE;

export const isReportGroupRecord = (property: GroupableProperty) => {
  const id = (property.id ?? '').trim();
  if (!id) {
    return false;
  }
  if (isP2BuildingId(id) || isReportGroupType(property.type)) {
    return true;
  }
  return DEFAULT_REPORT_GROUP_SEEDS.some((seed) => seed.id === id);
};

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

const propertyLabels = (property: GroupableProperty) =>
  unique([
    (property.nickname ?? '').trim(),
    (property.listingNickname ?? '').trim(),
    (property.title ?? '').trim(),
    yallaAliasForListingId(property.id),
    resolveYallaPropertyLabel({
      id: property.id,
      nickname: property.nickname,
      listingNickname: property.listingNickname,
      title: property.title,
    }),
  ]);

const matchesHint = (property: GroupableProperty, hints: string[]) => {
  const folded = propertyLabels(property).map(foldGroupText);
  return hints.some((hint) => folded.includes(foldGroupText(hint)));
};

export const resolveMembersForSeed = (
  seed: ReportGroupSeed,
  properties: GroupableProperty[],
) => {
  if (seed.id === P2_BUILDING_ID || seed.system) {
    const memberIds = unique([...(seed.memberIds ?? []), ...p2ReportMemberIds()]);
    const memberNames = unique([
      seed.name,
      PLANTA_2_REPORT_NAME,
      'P2',
      ...memberIds.map((id) => yallaAliasForListingId(id)),
      ...properties
        .filter((property) => memberIds.includes((property.id ?? '').trim()))
        .flatMap(propertyLabels),
    ]);
    return { memberIds, memberNames };
  }

  const hinted = properties.filter((property) => {
    const id = (property.id ?? '').trim();
    if (!id || isReportGroupRecord(property) || isP2RoomListingId(id)) {
      return false;
    }
    return matchesHint(property, seed.memberNameHints ?? []);
  });
  const memberIds = unique([
    seed.id,
    ...(seed.memberIds ?? []),
    ...hinted.map((property) => (property.id ?? '').trim()),
  ]);
  const memberNames = unique([
    seed.name,
    ...hinted.flatMap(propertyLabels),
  ]);
  return { memberIds, memberNames };
};

export const resolveReportGroups = (
  properties: GroupableProperty[],
): ResolvedReportGroup[] => {
  const storedById = new Map<string, GroupableProperty>();
  for (const property of properties) {
    const id = (property.id ?? '').trim();
    if (id && isReportGroupRecord(property)) {
      storedById.set(id, property);
    }
  }

  const groups: ResolvedReportGroup[] = [];
  const seen = new Set<string>();

  const pushGroup = (group: ResolvedReportGroup) => {
    if (!group.id || seen.has(group.id)) {
      return;
    }
    seen.add(group.id);
    groups.push(group);
  };

  for (const seed of DEFAULT_REPORT_GROUP_SEEDS) {
    const stored = storedById.get(seed.id);
    const resolved = resolveMembersForSeed(seed, properties);
    const storedMembers = asStringList(stored?.memberIds);
    const memberIds =
      storedMembers.length > 0
        ? unique([
            seed.id,
            ...storedMembers,
            ...(seed.id === P2_BUILDING_ID ? p2ReportMemberIds() : []),
          ])
        : resolved.memberIds;
    const storedNames = asStringList(stored?.memberNames);
    pushGroup({
      id: seed.id,
      name:
        seed.id === P2_BUILDING_ID
          ? seed.name
          : (stored?.nickname ?? '').trim() ||
            (stored?.title ?? '').trim() ||
            seed.name,
      memberIds,
      memberNames: unique([
        ...resolved.memberNames,
        ...storedNames,
        ...properties
          .filter((property) => memberIds.includes((property.id ?? '').trim()))
          .flatMap(propertyLabels),
      ]),
      system: Boolean(seed.system || stored?.system),
    });
  }

  for (const property of properties) {
    const id = (property.id ?? '').trim();
    if (!id || seen.has(id) || !isReportGroupType(property.type)) {
      continue;
    }
    const memberIds = unique([id, ...asStringList(property.memberIds)]);
    pushGroup({
      id,
      name:
        (property.nickname ?? '').trim() ||
        (property.title ?? '').trim() ||
        id,
      memberIds,
      memberNames: unique([
        ...asStringList(property.memberNames),
        ...properties
          .filter((entry) => memberIds.includes((entry.id ?? '').trim()))
          .flatMap(propertyLabels),
      ]),
      system: Boolean(property.system),
    });
  }

  return groups;
};

export const reportGroupById = (
  groups: ResolvedReportGroup[],
  propertyId?: string | null,
) => {
  const id = (propertyId ?? '').trim();
  if (!id) {
    return undefined;
  }
  return groups.find((group) => group.id === id);
};

export const reportGroupForMember = (
  groups: ResolvedReportGroup[],
  propertyId?: string | null,
) => {
  const id = (propertyId ?? '').trim();
  if (!id) {
    return undefined;
  }
  return groups.find(
    (group) => group.id !== id && group.memberIds.includes(id),
  );
};

export const groupedMemberIdSet = (groups: ResolvedReportGroup[]) => {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const memberId of group.memberIds) {
      if (memberId && memberId !== group.id) {
        ids.add(memberId);
      }
    }
  }
  return ids;
};

export const hydrateReportGroupProperty = (
  group: ResolvedReportGroup,
): Record<string, unknown> => ({
  id: group.id,
  nickname: group.name,
  listingNickname: group.name,
  title: group.name,
  type: group.id === P2_BUILDING_ID ? 'MTL_PRINCIPAL' : REPORT_GROUP_TYPE,
  memberIds: group.memberIds,
  memberNames: group.memberNames,
  system: group.system,
  active: true,
});
