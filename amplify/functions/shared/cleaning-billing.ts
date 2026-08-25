import { GetCommand } from '@aws-sdk/lib-dynamodb';
import {
  getPlanByDate,
  normalizeCleaningTypes,
  normalizePrice,
  queryCleaningVisitsForDate,
  resolveCleaningType,
  scanAllItems,
  type CleaningTypeRecord,
} from './cleaning-plan';
import { docClient, getTodayInMadrid, putItem } from './visit-task-utils';

export const OTHER_CLEANING_TYPE_ID = '__other__';
export const VISIBLE_PAST_MONTHS = 6;

export type BillingMonthStatus = 'CURRENT' | 'PENDING_TO_CLOSE' | 'CLOSED';
export type BillingWarning = 'open' | 'type' | 'price';
export type BillingLineSource = 'visit' | 'manual';

export type BillingOverride = {
  cleaningTypeId?: string;
  cleaningTypeName?: string;
  price?: number;
  isOther?: boolean;
};

export type ManualBillingLine = {
  id: string;
  date: string;
  propertyId: string;
  property: string;
  cleaningTypeId: string;
  cleaningTypeName: string;
  price: number;
  isOther: boolean;
};

export type BillingLine = {
  id: string;
  source: BillingLineSource;
  visitId: string;
  propertyId: string;
  property: string;
  date: string;
  status: string;
  cleaningTypeId: string;
  cleaningTypeName: string;
  price: number | null;
  isOther: boolean;
  isManual: boolean;
  warnings: BillingWarning[];
  cleaningTypes: CleaningTypeRecord[];
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

export const isMonthId = (value?: string) =>
  Boolean(value && /^\d{4}-\d{2}$/.test(value.trim()));

export const currentMonthId = () => getTodayInMadrid().slice(0, 7);

export const shiftMonthId = (monthId: string, offset: number) => {
  const [year, month] = monthId.split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const listVisibleMonthIds = () => {
  const current = currentMonthId();
  const ids = [current];
  for (let offset = 1; offset <= VISIBLE_PAST_MONTHS; offset += 1) {
    ids.push(shiftMonthId(current, -offset));
  }
  return ids;
};

export const datesInMonth = (monthId: string) => {
  const [year, month] = monthId.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates: string[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    dates.push(`${monthId}-${String(day).padStart(2, '0')}`);
  }
  return dates;
};

export const deriveMonthStatus = (
  monthId: string,
  storedStatus?: string,
): BillingMonthStatus => {
  if (asString(storedStatus).toUpperCase() === 'CLOSED') {
    return 'CLOSED';
  }
  return monthId >= currentMonthId() ? 'CURRENT' : 'PENDING_TO_CLOSE';
};

export const getMonthRecord = async (tableName: string, monthId: string) => {
  const result = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { id: monthId },
    }),
  );
  return (result.Item as Record<string, unknown> | undefined) ?? undefined;
};

export const asOverrides = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {} as Record<string, BillingOverride>;
  }
  return value as Record<string, BillingOverride>;
};

export const asManualLines = (value: unknown): ManualBillingLine[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      const id = asString(item.id);
      const date = asString(item.date).slice(0, 10);
      if (!id || !date) {
        return null;
      }
      return {
        id,
        date,
        propertyId: asString(item.propertyId),
        property: asString(item.property) || asString(item.propertyId),
        cleaningTypeId: asString(item.cleaningTypeId),
        cleaningTypeName: asString(item.cleaningTypeName),
        price: normalizePrice(item.price),
        isOther: Boolean(item.isOther) || asString(item.cleaningTypeId) === OTHER_CLEANING_TYPE_ID,
      } satisfies ManualBillingLine;
    })
    .filter((entry): entry is ManualBillingLine => Boolean(entry));
};

const warningsForLine = (line: {
  source: BillingLineSource;
  status: string;
  cleaningTypeName: string;
  price: number | null;
}): BillingWarning[] => {
  const warnings: BillingWarning[] = [];
  if (line.source === 'visit' && line.status.toUpperCase() !== 'COMPLETED') {
    warnings.push('open');
  }
  if (!line.cleaningTypeName) {
    warnings.push('type');
  }
  if (line.price === null) {
    warnings.push('price');
  }
  return warnings;
};

const summarizeLines = (lines: BillingLine[]) => {
  const billable = lines.filter(
    (line) =>
      line.warnings.length === 0 &&
      (line.source === 'manual' || line.status.toUpperCase() === 'COMPLETED'),
  );
  const total = billable.reduce((sum, line) => sum + (line.price ?? 0), 0);
  return {
    lineCount: lines.length,
    completedCount: billable.length,
    warningCount: lines.filter((line) => line.warnings.length > 0).length,
    total: Math.round(total * 100) / 100,
  };
};

const loadVisitsForMonth = async (
  visitsTable: string,
  monthId: string,
  options: { excludeScheduled?: boolean } = {},
) => {
  const perDay = await Promise.all(
    datesInMonth(monthId).map((date) =>
      queryCleaningVisitsForDate(visitsTable, date),
    ),
  );
  return perDay.flat().filter((visit) => {
    const status = asString(visit.status).toUpperCase();
    if (status === 'CANCELLED') {
      return false;
    }
    if (options.excludeScheduled && status === 'SCHEDULED') {
      return false;
    }
    return true;
  });
};

export const buildMonthDetail = async (params: {
  monthId: string;
  billingTable: string;
  visitsTable: string;
  plansTable: string;
  detailsTable: string;
  persistSummary?: boolean;
}) => {
  const {
    monthId,
    billingTable,
    visitsTable,
    plansTable,
    detailsTable,
    persistSummary = false,
  } = params;
  const stored = await getMonthRecord(billingTable, monthId);
  const status = deriveMonthStatus(monthId, asString(stored?.status));
  const today = getTodayInMadrid();

  if (status === 'CLOSED' && Array.isArray(stored?.snapshotLines)) {
    const lines = stored.snapshotLines as BillingLine[];
    const summary = summarizeLines(lines);
    return {
      month: {
        id: monthId,
        status,
        closedAt: asString(stored?.closedAt) || undefined,
        canClose: false,
        canReopen: true,
        canEdit: false,
        ...summary,
      },
      lines,
      stored,
    };
  }

  const [visits, detailItems] = await Promise.all([
    loadVisitsForMonth(visitsTable, monthId, {
      excludeScheduled: status === 'CURRENT',
    }),
    detailsTable ? scanAllItems(detailsTable) : Promise.resolve([]),
  ]);
  const detailsByPropertyId = new Map(
    detailItems.map((item) => {
      const propertyId = asString(item.propertyId) || asString(item.id);
      return [
        propertyId,
        {
          nickname: asString(item.nickname) || propertyId,
          types: normalizeCleaningTypes(item.cleaningTypes),
        },
      ];
    }),
  );
  const dates = [...new Set(visits.map((visit) => asString(visit.scheduledDate).slice(0, 10)).filter(Boolean))];
  const plans = await Promise.all(
    dates.map(async (date) => [date, await getPlanByDate(plansTable, date)] as const),
  );
  const planByDate = new Map(plans);
  const overrides = asOverrides(stored?.overrides);
  const visitLines: BillingLine[] = visits.map((visit) => {
    const visitId = asString(visit.id);
    const propertyId = asString(visit.propertyId);
    const date = asString(visit.scheduledDate).slice(0, 10);
    const details = detailsByPropertyId.get(propertyId);
    const types = details?.types ?? [];
    const plan = planByDate.get(date);
    const planItems = Array.isArray(plan?.items) ? plan.items : [];
    const planItem = planItems.find((entry) => {
      const item = (entry ?? {}) as Record<string, unknown>;
      return asString(item.visitId) === visitId;
    }) as Record<string, unknown> | undefined;
    const override = overrides[visitId] ?? {};
    const isOther =
      Boolean(override.isOther) ||
      asString(override.cleaningTypeId) === OTHER_CLEANING_TYPE_ID;
    const preferredTypeId =
      asString(override.cleaningTypeId) || asString(planItem?.cleaningTypeId);
    const selectedType = isOther
      ? undefined
      : preferredTypeId
        ? resolveCleaningType(types, preferredTypeId)
        : date < today
          ? resolveCleaningType(types)
          : undefined;
    const cleaningTypeId = isOther
      ? OTHER_CLEANING_TYPE_ID
      : asString(override.cleaningTypeId) || selectedType?.id || '';
    const cleaningTypeName = isOther
      ? asString(override.cleaningTypeName)
      : asString(override.cleaningTypeName) ||
        selectedType?.name ||
        asString(planItem?.cleaningTypeName);
    const overridePrice = asNumber(override.price);
    const planPrice = asNumber(planItem?.price);
    const catalogPrice = selectedType ? selectedType.price : null;
    const price = overridePrice ?? planPrice ?? catalogPrice;
    const property =
      details?.nickname ||
      asString(visit.Property) ||
      asString(visit.property) ||
      propertyId;
    const statusValue = asString(visit.status).toUpperCase();
    const base = {
      source: 'visit' as const,
      status: statusValue,
      cleaningTypeName,
      price,
    };
    return {
      id: visitId,
      source: 'visit' as const,
      visitId,
      propertyId,
      property,
      date,
      status: statusValue,
      cleaningTypeId,
      cleaningTypeName,
      price,
      isOther,
      isManual: false,
      warnings: warningsForLine(base),
      cleaningTypes: types,
    };
  });

  const manualLines: BillingLine[] = asManualLines(stored?.manualLines).map(
    (item) => {
      const types = detailsByPropertyId.get(item.propertyId)?.types ?? [];
      const base = {
        source: 'manual' as const,
        status: 'COMPLETED',
        cleaningTypeName: item.cleaningTypeName,
        price: Number.isFinite(item.price) ? item.price : null,
      };
      return {
        id: item.id,
        source: 'manual' as const,
        visitId: '',
        propertyId: item.propertyId,
        property: item.property || item.propertyId,
        date: item.date,
        status: 'COMPLETED',
        cleaningTypeId: item.isOther ? OTHER_CLEANING_TYPE_ID : item.cleaningTypeId,
        cleaningTypeName: item.cleaningTypeName,
        price: base.price,
        isOther: item.isOther,
        isManual: true,
        warnings: warningsForLine(base),
        cleaningTypes: types,
      };
    },
  );

  const lines = [...visitLines, ...manualLines].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.property.localeCompare(b.property, undefined, { sensitivity: 'base' });
  });
  const summary = summarizeLines(lines);
  const canClose = status === 'PENDING_TO_CLOSE' && summary.warningCount === 0;
  const month = {
    id: monthId,
    status,
    closedAt: undefined as string | undefined,
    canClose,
    canReopen: false,
    canEdit: status !== 'CLOSED',
    ...summary,
  };

  if (persistSummary && billingTable) {
    const timestamp = new Date().toISOString();
    const next: Record<string, unknown> = {
      ...(stored ?? {}),
      id: monthId,
      overrides: asOverrides(stored?.overrides),
      manualLines: asManualLines(stored?.manualLines),
      summary,
      createdAt: asString(stored?.createdAt) || timestamp,
      updatedAt: timestamp,
    };
    if (asString(stored?.status).toUpperCase() === 'CLOSED') {
      next.status = 'CLOSED';
    }
    Object.keys(next).forEach((key) => {
      if (next[key] === undefined) {
        delete next[key];
      }
    });
    await putItem(billingTable, next);
  }

  return { month, lines, stored };
};
