/** Logs written before 24 Sep 2026 00:00 Europe/Madrid stay hidden. */
export const ACTIVITY_LOG_VISIBLE_FROM = '2026-09-23T22:00:00.000Z';

const VISIT_TASK_SUMMARY_PREFIXES = [
  'marked task ',
  'updated task ',
  'created task ',
  'deleted task ',
  'created inbox copy ',
];

export const isVisitTaskActivitySummary = (summary: string) => {
  const normalized = summary.trim().toLowerCase();
  return VISIT_TASK_SUMMARY_PREFIXES.some((prefix) =>
    normalized.startsWith(prefix),
  );
};

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const propertyMatchLabels = (
  labels: Array<string | undefined | null>,
) => {
  const unique = new Set<string>();
  for (const label of labels) {
    const trimmed = label?.trim();
    if (trimmed && trimmed.length >= 4) {
      unique.add(trimmed);
    }
  }
  return [...unique];
};

export const textMentionsProperty = (haystack: string, label: string) => {
  const needle = label.trim();
  if (needle.length < 4 || !haystack.trim()) {
    return false;
  }
  if (needle.length >= 12) {
    return haystack.toLowerCase().includes(needle.toLowerCase());
  }
  const pattern = new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escapeRegExp(needle)}(?:$|[^\\p{L}\\p{N}])`,
    'iu',
  );
  return pattern.test(haystack);
};

type PropertyLogFields = {
  propertyId?: string;
  propertyName?: string;
  summary?: string;
  entityName?: string;
};

export const logMatchesProperty = (
  item: PropertyLogFields,
  propertyIds: string[],
  propertyNames: string[],
) => {
  if (propertyIds.length === 0 && propertyNames.length === 0) {
    return true;
  }
  const propertyId = item.propertyId?.trim();
  if (propertyId && propertyIds.includes(propertyId)) {
    return true;
  }
  const propertyName = item.propertyName?.trim().toLowerCase();
  if (
    propertyName &&
    propertyNames.some((label) => label.trim().toLowerCase() === propertyName)
  ) {
    return true;
  }
  const haystack = [item.summary, item.entityName, item.propertyName]
    .filter(Boolean)
    .join(' ');
  return propertyNames.some((label) => textMentionsProperty(haystack, label));
};

export const logMatchesUsers = (
  userEmail: string,
  users: string[],
) => {
  if (users.length === 0) {
    return true;
  }
  const email = userEmail.trim().toLowerCase();
  return users.some((user) => user.trim().toLowerCase() === email);
};
