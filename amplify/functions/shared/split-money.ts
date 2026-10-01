export type DistributionTarget = {
  propertyId: string;
  property: string;
};

const asTrimmed = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

export const newDistributionId = () =>
  `DIST-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const distributedLineId = (distributionId: string, propertyId: string) =>
  `${distributionId}:${propertyId}`;

export const splitMoneyEvenly = (total: number, count: number): number[] => {
  if (!Number.isInteger(count) || count <= 0 || !Number.isFinite(total)) {
    return [];
  }
  const cents = Math.round(total * 100);
  const base = Math.trunc(cents / count);
  const leftover = cents - base * count;
  const sign = leftover < 0 ? -1 : 1;
  const extra = Math.abs(leftover);
  return Array.from({ length: count }, (_, index) =>
    (base + (index < extra ? sign : 0)) / 100,
  );
};

export const parseDistributionTargets = (value: unknown): DistributionTarget[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const targets: DistributionTarget[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const item = entry as Record<string, unknown>;
    const propertyId = asTrimmed(item.propertyId) || asTrimmed(item.id);
    if (!propertyId || seen.has(propertyId)) {
      continue;
    }
    seen.add(propertyId);
    targets.push({
      propertyId,
      property: asTrimmed(item.property) || asTrimmed(item.name) || propertyId,
    });
  }
  return targets;
};
