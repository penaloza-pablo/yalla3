import { isCleaningSettingsRecord, scanAllItems } from './cleaning-plan';
import {
  loadCleaningVisitBookingContexts,
  type CleaningVisitBookingContext,
} from './cleaning-plan-booking-context';

export const AMENITIES_IVA_MULTIPLIER = 1.21;

export const AMENITY_RULE_TYPES = [
  'per_reservation',
  'per_guest',
  'solo_or_fixed',
  'solo_or_per_guest',
] as const;

export type AmenityRuleType = (typeof AMENITY_RULE_TYPES)[number];

export type AmenityBookingRule = {
  type: AmenityRuleType;
  n?: number;
  soloQty?: number;
  groupQty?: number;
};

export type AmenityRule = {
  inventoryId: string;
  booking: AmenityBookingRule;
  gapQty: number;
};

export type InventoryPriceItem = {
  id: string;
  name: string;
  unitPrice: number;
};

export type AmenitiesKitItem = {
  inventoryId: string;
  name: string;
  qty: number;
  unitPrice: number;
  cost: number;
};

export type AmenitiesKit = {
  items: AmenitiesKitItem[];
  cost: number;
  costWithIva: number;
};

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
};

export const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const roundQty = (value: number) => Math.round(value * 10000) / 10000;

export const emptyAmenitiesKit = (): AmenitiesKit => ({
  items: [],
  cost: 0,
  costWithIva: 0,
});

export const kitFromUnknown = (value: unknown): AmenitiesKit => {
  const record = asRecord(value);
  if (!record) {
    return emptyAmenitiesKit();
  }
  const items = Array.isArray(record.items)
    ? record.items
        .map((entry) => {
          const item = asRecord(entry);
          if (!item) {
            return null;
          }
          const inventoryId = asString(item.inventoryId);
          const qty = asNumber(item.qty);
          const unitPrice = asNumber(item.unitPrice) ?? 0;
          const cost = asNumber(item.cost);
          if (!inventoryId || qty === null || qty <= 0) {
            return null;
          }
          return {
            inventoryId,
            name: asString(item.name) || inventoryId,
            qty,
            unitPrice,
            cost: cost === null ? roundMoney(qty * unitPrice) : roundMoney(cost),
          };
        })
        .filter((item): item is AmenitiesKitItem => Boolean(item))
    : [];
  const cost =
    asNumber(record.cost) ??
    roundMoney(items.reduce((sum, item) => sum + item.cost, 0));
  const costWithIva =
    asNumber(record.costWithIva) ?? roundMoney(cost * AMENITIES_IVA_MULTIPLIER);
  return { items, cost: roundMoney(cost), costWithIva: roundMoney(costWithIva) };
};

const isAmenityRuleType = (value: unknown): value is AmenityRuleType =>
  typeof value === 'string' &&
  AMENITY_RULE_TYPES.includes(value as AmenityRuleType);

const nonNegative = (value: number | null): number | null => {
  if (value === null || value < 0) {
    return null;
  }
  return value;
};

export const normalizeAmenityRule = (value: unknown): AmenityRule | null => {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const inventoryId = asString(record.inventoryId);
  if (!inventoryId) {
    return null;
  }
  const bookingRecord = asRecord(record.booking) ?? record;
  const type = bookingRecord.type;
  if (!isAmenityRuleType(type)) {
    return null;
  }
  const n = nonNegative(asNumber(bookingRecord.n));
  const soloQty = nonNegative(asNumber(bookingRecord.soloQty));
  const groupQty = nonNegative(asNumber(bookingRecord.groupQty));
  const gapQty = nonNegative(asNumber(record.gapQty));
  if (gapQty === null) {
    return null;
  }
  if (type === 'per_reservation' || type === 'per_guest') {
    if (n === null) {
      return null;
    }
    return { inventoryId, booking: { type, n }, gapQty };
  }
  if (type === 'solo_or_fixed') {
    if (soloQty === null || groupQty === null) {
      return null;
    }
    return { inventoryId, booking: { type, soloQty, groupQty }, gapQty };
  }
  if (n === null || soloQty === null) {
    return null;
  }
  return { inventoryId, booking: { type, n, soloQty }, gapQty };
};

export const normalizeAmenitiesRules = (value: unknown): AmenityRule[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const rules: AmenityRule[] = [];
  for (const entry of value) {
    const rule = normalizeAmenityRule(entry);
    if (!rule || seen.has(rule.inventoryId)) {
      continue;
    }
    seen.add(rule.inventoryId);
    rules.push(rule);
  }
  return rules;
};

export const amenitiesRulesByPropertyId = (
  detailItems: Record<string, unknown>[],
) => {
  const map = new Map<string, AmenityRule[]>();
  for (const item of detailItems) {
    if (isCleaningSettingsRecord(item)) {
      continue;
    }
    const propertyId = asString(item.propertyId) || asString(item.id);
    if (!propertyId) {
      continue;
    }
    map.set(propertyId, normalizeAmenitiesRules(item.amenitiesRules));
  }
  return map;
};

export const mapInventoryPriceItem = (
  item: Record<string, unknown>,
): InventoryPriceItem | null => {
  const id = asString(item.id) || asString(item.ID);
  if (!id) {
    return null;
  }
  const name =
    asString(item['Item name']) ||
    asString(item.name) ||
    asString(item.itemName) ||
    asString(item.Name) ||
    id;
  const unitPrice =
    asNumber(item.unitPrice) ??
    asNumber(item.UnitPrice) ??
    asNumber(item['Unit Price']) ??
    0;
  return { id, name, unitPrice: unitPrice < 0 ? 0 : unitPrice };
};

export const loadInventoryPriceMap = async (tableName: string) => {
  const items = await scanAllItems(tableName);
  const map = new Map<string, InventoryPriceItem>();
  for (const item of items) {
    const mapped = mapInventoryPriceItem(item);
    if (mapped) {
      map.set(mapped.id, mapped);
    }
  }
  return map;
};

export const computeBookingQty = (
  rule: AmenityRule,
  guestCount: number,
): number => {
  const guests = Number.isFinite(guestCount) ? Math.max(0, guestCount) : 0;
  const n = rule.booking.n ?? 0;
  switch (rule.booking.type) {
    case 'per_reservation':
      return n;
    case 'per_guest':
      return n * guests;
    case 'solo_or_fixed':
      return guests === 1
        ? (rule.booking.soloQty ?? 0)
        : (rule.booking.groupQty ?? 0);
    case 'solo_or_per_guest':
      return guests === 1 ? (rule.booking.soloQty ?? 0) : n * guests;
    default:
      return 0;
  }
};

export const computeAmenitiesKit = ({
  rules,
  bookingContext,
  inventoryById,
}: {
  rules: AmenityRule[];
  bookingContext?: CleaningVisitBookingContext | null;
  inventoryById: Map<string, InventoryPriceItem>;
}): AmenitiesKit => {
  const useGap = !bookingContext || bookingContext.hasBookingGap;
  const guestCount = bookingContext?.guestCount ?? 0;
  const items: AmenitiesKitItem[] = [];

  for (const rule of rules) {
    const inventory = inventoryById.get(rule.inventoryId);
    if (!inventory) {
      continue;
    }
    const rawQty = useGap
      ? rule.gapQty
      : computeBookingQty(rule, guestCount);
    const qty = roundQty(rawQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      continue;
    }
    const cost = roundMoney(qty * inventory.unitPrice);
    items.push({
      inventoryId: inventory.id,
      name: inventory.name,
      qty,
      unitPrice: inventory.unitPrice,
      cost,
    });
  }

  const cost = roundMoney(items.reduce((sum, item) => sum + item.cost, 0));
  return {
    items,
    cost,
    costWithIva: roundMoney(cost * AMENITIES_IVA_MULTIPLIER),
  };
};

export const attachAmenitiesKitsToLines = async <
  T extends {
    propertyId: string;
    date: string;
    isManual?: boolean;
  },
>(
  lines: T[],
  detailItems: Record<string, unknown>[],
): Promise<Array<T & { kit: AmenitiesKit }>> => {
  if (lines.length === 0) {
    return [];
  }

  const inventoryTable = process.env.INVENTORY_TABLE;
  const bookingsTable = process.env.BOOKINGS_TABLE;
  const propertiesTable = process.env.PROPERTIES_TABLE;
  const rulesByProperty = amenitiesRulesByPropertyId(detailItems);
  let inventoryById = new Map<string, InventoryPriceItem>();
  if (inventoryTable) {
    try {
      inventoryById = await loadInventoryPriceMap(inventoryTable);
    } catch (error) {
      console.error('Failed to load inventory prices for amenities kit', error);
    }
  }

  const dates = [
    ...new Set(lines.map((line) => asString(line.date)).filter(Boolean)),
  ];
  const contextsByDate = new Map<
    string,
    Map<string, CleaningVisitBookingContext>
  >();
  if (bookingsTable) {
    await Promise.all(
      dates.map(async (date) => {
        const propertyIds = lines
          .filter((line) => line.date === date && !line.isManual)
          .map((line) => line.propertyId);
        if (propertyIds.length === 0) {
          contextsByDate.set(date, new Map());
          return;
        }
        try {
          const loaded = await loadCleaningVisitBookingContexts({
            plannedDate: date,
            propertyIds,
            detailItems,
            bookingsTable,
            propertiesTable,
          });
          contextsByDate.set(date, loaded.contexts);
        } catch (error) {
          console.error('Failed to load booking context for amenities kit', {
            date,
            error,
          });
          contextsByDate.set(date, new Map());
        }
      }),
    );
  }

  return lines.map((line) => {
    const persisted = Boolean(
      (line as { kitPersisted?: boolean }).kitPersisted,
    );
    if (persisted) {
      return {
        ...line,
        kit: kitFromUnknown((line as { kit?: unknown }).kit),
      };
    }
    const bookingContext = line.isManual
      ? null
      : (contextsByDate.get(line.date)?.get(line.propertyId) ?? null);
    return {
      ...line,
      kit: computeAmenitiesKit({
        rules: rulesByProperty.get(line.propertyId) ?? [],
        bookingContext,
        inventoryById,
      }),
    };
  });
};
