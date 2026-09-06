import { addDaysToDateString, calendarDaysBetween } from './date-range';

export const PLANNER_SETTINGS_ID = 'GLOBAL';
export const PLANNER_WINDOW_DAYS = 7;
export const ACCESS_FIELD_ID = '6945126331a9580014e33f73';

export const RULE_IDS = ['linen', 'giftCard', 'singleGuest'] as const;
export type PlannerRuleId = (typeof RULE_IDS)[number];

export const LINEN_VALUES = {
  NA: 'Sofa cama: n/a',
  YES: 'Sofa cama: si',
  NO: 'Sofa cama: no',
} as const;

export const LINEN_OPTIONS = [
  LINEN_VALUES.NA,
  LINEN_VALUES.YES,
  LINEN_VALUES.NO,
] as const;

export const GIFT_CARD_OFF = 'Sin tarjeta';
export const EARLY_CHECK_IN_ON = 'Early check-in';

export type PlannerWarningCode =
  | 'linen_ask_guest'
  | 'gift_card_access_missing'
  | 'single_guest';

export type PlannerRule = {
  id: PlannerRuleId;
  enabled: boolean;
  excludedPropertyIds: string[];
};

export type PlannerSettings = {
  id: string;
  plannerEnabled: boolean;
  rules: PlannerRule[];
};

export type PlannerFieldPatch = {
  linen: string;
  giftCard: string;
  earlyCheckIn: string;
  access: string;
  giftCardOn: boolean;
  earlyCheckInOn: boolean;
  warnings: PlannerWarningCode[];
  warningCount: number;
};

export type PlannerOverrides = {
  linen?: string;
  giftCardOn?: boolean;
  earlyCheckInOn?: boolean;
  access?: string;
};

export type BookingPlannerItem = {
  ReservationID?: string;
  ListingID?: string;
  ListingNickname?: string;
  CheckInDate?: string;
  CheckOutDate?: string;
  Status?: string;
  Guests?: unknown;
  Nights?: unknown;
  GiftCard?: unknown;
  Linen?: unknown;
  EarlyCheckIn?: unknown;
  Access?: unknown;
  GiftCardOn?: unknown;
  EarlyCheckInOn?: unknown;
};

const CANONICAL_LINEN = new Set<string>(LINEN_OPTIONS);

export const defaultPlannerRules = (): PlannerRule[] =>
  RULE_IDS.map((id) => ({
    id,
    enabled: true,
    excludedPropertyIds: [],
  }));

export const defaultPlannerSettings = (): PlannerSettings => ({
  id: PLANNER_SETTINGS_ID,
  plannerEnabled: false,
  rules: defaultPlannerRules(),
});

const asString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const asBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }
  return undefined;
};

export const toDateOnly = (value: unknown) => {
  const text = asString(value);
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? '';
};

export const toGuestCount = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }
  return 0;
};

export const toNightsCount = (item: BookingPlannerItem) => {
  const stored = toGuestCount(item.Nights);
  if (stored > 0) {
    return stored;
  }
  const checkIn = toDateOnly(item.CheckInDate);
  const checkOut = toDateOnly(item.CheckOutDate);
  if (!checkIn || !checkOut) {
    return 0;
  }
  return Math.max(0, calendarDaysBetween(checkIn, checkOut));
};

export const plannerWindowEnd = (today: string) =>
  addDaysToDateString(today, PLANNER_WINDOW_DAYS - 1);

export const isInPlannerWindow = (checkInDate: string, today: string) => {
  const checkIn = toDateOnly(checkInDate);
  if (!checkIn || !today) {
    return false;
  }
  return checkIn >= today && checkIn <= plannerWindowEnd(today);
};

export const isCanceledBooking = (status: unknown) => {
  const normalized = asString(status).toLowerCase();
  return normalized === 'canceled' || normalized === 'cancelled';
};

export const isActivePlannerStatus = (status: unknown) =>
  asString(status).toLowerCase() === 'confirmed';

const normalizeRuleId = (value: unknown): PlannerRuleId | null => {
  if (value === 'linen' || value === 'giftCard' || value === 'singleGuest') {
    return value;
  }
  return null;
};

export const normalizePlannerSettings = (
  item?: Record<string, unknown> | null,
): PlannerSettings => {
  const defaults = defaultPlannerSettings();
  if (!item) {
    return defaults;
  }

  const byId = new Map<PlannerRuleId, PlannerRule>();
  for (const rule of defaults.rules) {
    byId.set(rule.id, rule);
  }

  const incoming = Array.isArray(item.rules) ? item.rules : [];
  for (const entry of incoming) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const raw = entry as Record<string, unknown>;
    const id = normalizeRuleId(raw.id);
    if (!id) {
      continue;
    }
    const excluded = Array.isArray(raw.excludedPropertyIds)
      ? raw.excludedPropertyIds
          .map((value) => asString(value))
          .filter(Boolean)
      : [];
    byId.set(id, {
      id,
      enabled: raw.enabled !== false,
      excludedPropertyIds: [...new Set(excluded)],
    });
  }

  return {
    id: PLANNER_SETTINGS_ID,
    plannerEnabled: item.plannerEnabled === true,
    rules: RULE_IDS.map((id) => byId.get(id) ?? { id, enabled: true, excludedPropertyIds: [] }),
  };
};

export const getPlannerRule = (
  settings: PlannerSettings,
  id: PlannerRuleId,
): PlannerRule =>
  settings.rules.find((rule) => rule.id === id) ?? {
    id,
    enabled: true,
    excludedPropertyIds: [],
  };

export const isPropertyExcluded = (rule: PlannerRule, listingId: string) => {
  const id = listingId.trim();
  if (!id) {
    return false;
  }
  return rule.excludedPropertyIds.includes(id);
};

export const formatGiftCardValue = (guestCount: number, checkOutDate: string) => {
  const date = toDateOnly(checkOutDate);
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dayMonth = match ? `${match[3]}/${match[2]}` : '';
  const guests = Number.isFinite(guestCount) ? Math.max(0, Math.trunc(guestCount)) : 0;
  return `${guests} - ${dayMonth}`.trim();
};

export const isAutoGiftCardValue = (value: string) => {
  const text = value.trim();
  return text === GIFT_CARD_OFF || /^\d+ - \d{2}\/\d{2}$/.test(text);
};

export const isCanonicalLinenValue = (value: string) =>
  CANONICAL_LINEN.has(value.trim());

export const isEarlyCheckInEnabled = (value: unknown) =>
  /early check-in/i.test(asString(value));

export const computePlannerFields = ({
  item,
  settings,
  today,
  overrides,
}: {
  item: BookingPlannerItem;
  settings: PlannerSettings;
  today: string;
  overrides?: PlannerOverrides;
}): PlannerFieldPatch => {
  let linen =
    overrides?.linen !== undefined
      ? asString(overrides.linen)
      : asString(item.Linen);
  let giftCard = asString(item.GiftCard);
  let earlyCheckIn = asString(item.EarlyCheckIn);
  let access =
    overrides?.access !== undefined
      ? asString(overrides.access)
      : asString(item.Access);

  const storedGiftCardOn = asBoolean(item.GiftCardOn);
  const storedEarlyOn = asBoolean(item.EarlyCheckInOn);

  let giftCardOn =
    overrides?.giftCardOn ??
    storedGiftCardOn ??
    (giftCard ? giftCard !== GIFT_CARD_OFF : true);
  let earlyCheckInOn =
    overrides?.earlyCheckInOn ??
    storedEarlyOn ??
    isEarlyCheckInEnabled(earlyCheckIn);

  if (overrides?.earlyCheckInOn !== undefined) {
    earlyCheckIn = overrides.earlyCheckInOn ? EARLY_CHECK_IN_ON : '';
  }

  const listingId = asString(item.ListingID);
  const guests = toGuestCount(item.Guests);
  const nights = toNightsCount(item);
  const inWindow = isInPlannerWindow(asString(item.CheckInDate), today);
  const active = isActivePlannerStatus(item.Status);

  if (!settings.plannerEnabled || !inWindow || !active) {
    return {
      linen,
      giftCard,
      earlyCheckIn,
      access,
      giftCardOn,
      earlyCheckInOn,
      warnings: [],
      warningCount: 0,
    };
  }

  const warnings: PlannerWarningCode[] = [];
  const linenRule = getPlannerRule(settings, 'linen');
  const giftRule = getPlannerRule(settings, 'giftCard');
  const guestRule = getPlannerRule(settings, 'singleGuest');

  if (linenRule.enabled) {
    if (isPropertyExcluded(linenRule, listingId)) {
      linen = LINEN_VALUES.NA;
    } else if (overrides?.linen === undefined && !linen) {
      if (guests === 1) {
        linen = LINEN_VALUES.NO;
      } else if (guests >= 3) {
        linen = LINEN_VALUES.YES;
      }
    }
    if (!isCanonicalLinenValue(linen)) {
      warnings.push('linen_ask_guest');
    }
  }

  if (giftRule.enabled && !isPropertyExcluded(giftRule, listingId)) {
    if (giftCardOn === false) {
      giftCard = GIFT_CARD_OFF;
    } else if (
      overrides?.giftCardOn === true ||
      !giftCard ||
      isAutoGiftCardValue(giftCard)
    ) {
      giftCard =
        nights <= 2
          ? GIFT_CARD_OFF
          : formatGiftCardValue(guests, asString(item.CheckOutDate));
      giftCardOn = true;
    }
    if (!access) {
      warnings.push('gift_card_access_missing');
    }
  }

  if (
    guestRule.enabled &&
    !isPropertyExcluded(guestRule, listingId) &&
    guests === 1
  ) {
    warnings.push('single_guest');
  }

  return {
    linen,
    giftCard,
    earlyCheckIn,
    access,
    giftCardOn,
    earlyCheckInOn,
    warnings,
    warningCount: warnings.length,
  };
};

export const plannerFieldsChanged = (
  current: BookingPlannerItem,
  next: PlannerFieldPatch,
) =>
  asString(current.Linen) !== next.linen ||
  asString(current.GiftCard) !== next.giftCard ||
  asString(current.EarlyCheckIn) !== next.earlyCheckIn ||
  asString(current.Access) !== next.access;
