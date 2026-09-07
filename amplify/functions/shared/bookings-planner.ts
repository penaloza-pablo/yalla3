import { addDaysToDateString, calendarDaysBetween } from './date-range';

export const PLANNER_SETTINGS_ID = 'GLOBAL';
export const PLANNER_WINDOW_DAYS = 7;
export const ACCESS_FIELD_ID = '6945126331a9580014e33f73';

export const RULE_IDS = [
  'linen',
  'giftCard',
  'singleGuest',
  'doubleOrTwoSingles',
] as const;
export type PlannerRuleId = (typeof RULE_IDS)[number];

export const VERDEJO_LISTING_ID = '6835c22941deed0027f93d2b';

export const LINEN_VALUES = {
  NA: 'Sofa cama: n/a',
  YES: 'Sofa cama: si',
  NO: 'Sofa cama: no',
  DOUBLE: 'Double',
  SINGLE: 'Single',
} as const;

export const LINEN_OPTIONS = [
  LINEN_VALUES.NA,
  LINEN_VALUES.YES,
  LINEN_VALUES.NO,
] as const;

export const VERDEJO_LINEN_OPTIONS = [
  LINEN_VALUES.SINGLE,
  LINEN_VALUES.DOUBLE,
] as const;

export const ALL_LINEN_VALUES = [
  ...LINEN_OPTIONS,
  ...VERDEJO_LINEN_OPTIONS,
] as const;

export const GIFT_CARD_OFF = 'Sin tarjeta';
export const EARLY_CHECK_IN_ON = 'Early check-in';

export type PlannerWarningCode =
  | 'linen_ask_guest'
  | 'gift_card_access_missing'
  | 'single_guest'
  | 'double_or_two_singles_ask';

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
  dismissedWarnings: PlannerWarningCode[];
};

export type PlannerOverrides = {
  linen?: string;
  giftCardOn?: boolean;
  earlyCheckInOn?: boolean;
  access?: string;
  dismissWarning?: PlannerWarningCode;
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
  PlannerDismissedWarnings?: unknown;
};

const SOFA_LINEN = new Set<string>(LINEN_OPTIONS);
const VERDEJO_LINEN = new Set<string>(VERDEJO_LINEN_OPTIONS);
const ALLOWED_LINEN = new Set<string>([...ALL_LINEN_VALUES, '']);

const DEFAULT_DOUBLE_OR_TWO_SINGLES_EXCLUSIONS = [
  '693c3fa8937d490014b5bceb',
  '6928222e394afb00100cf038',
  '693c58109994960014f586d7',
  '693c58109994960014f58732',
  '693c5b7bb122320015236bcc',
  '6928222e394afb00100cf048',
  '693c59b29430f10014539e64',
  '693c58109994960014f5878d',
  '693c5b7bb122320015236bee',
  '6928222e394afb00100cf040',
  '693c3ad20c4f0500133cd017',
  '693c3ad20c4f0500133ccfc3',
  '6835c21193742a002b128465',
  '6835c21a7daf0d0026d38b36',
  '6835c22d3239830026a090c0',
  '6835c2244cbe32002723b60c',
  '6835c22020c73c0027a82d6a',
  '6835c21541deed0027f93bb6',
  '6835c20bb57936001371aead',
  '6835cef04af0d8002845abdd',
  '69b6cf303c0a620014d6127d',
  '6835cc39fb5792002a5150ea',
  '6a74ae1eb2d7380014834e53',
  '6835c2073239830026a08eb1',
  '6a05df8d0154cb0014c51887',
  '6835c290ac2dc6002b452288',
  '691857889e70a50011b53b39',
  '69185b5b46bd930041396b90',
  '69403ac1ecebad0012777738',
  '6835c28c97ce8700130584aa',
  '6835c1fd27f12a0028b2026d',
  '6835c20332d7750027764973',
  '6835cc3d3b0ed3002bb29e81',
  'JCLStorage',
  'other',
];

export const isVerdejoBedListing = (listingId: string) =>
  listingId.trim() === VERDEJO_LISTING_ID;

export const defaultPlannerRules = (): PlannerRule[] =>
  RULE_IDS.map((id) => ({
    id,
    enabled: true,
    excludedPropertyIds:
      id === 'doubleOrTwoSingles'
        ? [...DEFAULT_DOUBLE_OR_TWO_SINGLES_EXCLUSIONS]
        : [],
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
  if (
    value === 'linen' ||
    value === 'giftCard' ||
    value === 'singleGuest' ||
    value === 'doubleOrTwoSingles'
  ) {
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

export const isSofaLinenValue = (value: string) =>
  SOFA_LINEN.has(value.trim());

export const isVerdejoLinenValue = (value: string) =>
  VERDEJO_LINEN.has(value.trim());

export const isCanonicalLinenValue = (value: string, listingId?: string) => {
  const text = value.trim();
  if (listingId && isVerdejoBedListing(listingId)) {
    return isVerdejoLinenValue(text);
  }
  if (listingId) {
    return isSofaLinenValue(text);
  }
  return isSofaLinenValue(text) || isVerdejoLinenValue(text);
};

export const isAllowedPlannerLinenValue = (value: string) =>
  ALLOWED_LINEN.has(value.trim());

const foldPlannerText = (value: unknown) =>
  asString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const compactPlannerText = (value: unknown) =>
  foldPlannerText(value).replace(/ /g, '');

const mapSofaLinenFromGuesty = (original: string) => {
  const trimmed = original.trim();
  if (isSofaLinenValue(trimmed)) {
    return trimmed;
  }
  const compact = compactPlannerText(trimmed);
  if (!compact.startsWith('sofacama')) {
    return trimmed;
  }
  const rest = compact.slice('sofacama'.length);
  if (rest === 'na' || rest.startsWith('na')) {
    return LINEN_VALUES.NA;
  }
  if (rest === 'no' || rest.startsWith('no')) {
    return LINEN_VALUES.NO;
  }
  if (
    rest === 'si' ||
    rest.startsWith('si') ||
    rest === 'yes' ||
    rest.startsWith('yes')
  ) {
    return LINEN_VALUES.YES;
  }
  return trimmed;
};

const mapVerdejoLinenFromGuesty = (original: string) => {
  const trimmed = original.trim();
  if (isVerdejoLinenValue(trimmed)) {
    return trimmed;
  }
  const compact = compactPlannerText(trimmed);
  if (
    compact.includes('camasseparadas') ||
    compact.includes('dosindividuales') ||
    compact.includes('doscamasindividuales') ||
    compact.includes('twosingles') ||
    compact.includes('2individuales') ||
    compact.includes('individual') ||
    compact.includes('single')
  ) {
    return LINEN_VALUES.SINGLE;
  }
  if (
    compact.includes('camadoble') ||
    compact.includes('camasdobles') ||
    compact.includes('double') ||
    compact.includes('doble')
  ) {
    return LINEN_VALUES.DOUBLE;
  }
  return trimmed;
};

export const canonicalizeLinenValue = (value: unknown, listingId = '') => {
  const original = asString(value);
  if (!original) {
    return '';
  }
  return isVerdejoBedListing(listingId)
    ? mapVerdejoLinenFromGuesty(original)
    : mapSofaLinenFromGuesty(original);
};

export const linenMenuValuesForListing = (listingId: string) =>
  isVerdejoBedListing(listingId)
    ? [...VERDEJO_LINEN_OPTIONS, '']
    : [...LINEN_OPTIONS];

export const DISMISSABLE_PLANNER_WARNINGS: PlannerWarningCode[] = [
  'single_guest',
];

export const isDismissablePlannerWarning = (
  value: unknown,
): value is PlannerWarningCode =>
  value === 'single_guest';

export const asDismissedPlannerWarnings = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as PlannerWarningCode[];
  }
  return [...new Set(value.filter(isDismissablePlannerWarning))];
};

const normalizeEarlyCheckInText = (value: unknown) =>
  asString(value)
    .normalize('NFKC')
    .replace(/[\u00A0\u202F\u2007\u2009\u200A]/g, ' ')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export const isEarlyCheckInEnabled = (value: unknown) =>
  /^early[\s-]*check[\s-]*in\b/.test(normalizeEarlyCheckInText(value));

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
  const listingId = asString(item.ListingID);
  let linen =
    overrides?.linen !== undefined
      ? asString(overrides.linen)
      : canonicalizeLinenValue(item.Linen, listingId);
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

  if (overrides?.earlyCheckInOn === undefined && isEarlyCheckInEnabled(earlyCheckIn)) {
    earlyCheckInOn = true;
  }

  if (overrides?.earlyCheckInOn !== undefined) {
    earlyCheckIn = overrides.earlyCheckInOn ? EARLY_CHECK_IN_ON : '';
  }

  const dismissedWarnings = asDismissedPlannerWarnings([
    ...asDismissedPlannerWarnings(item.PlannerDismissedWarnings),
    ...(overrides?.dismissWarning ? [overrides.dismissWarning] : []),
  ]);
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
      dismissedWarnings,
    };
  }

  const warnings: PlannerWarningCode[] = [];
  const linenRule = getPlannerRule(settings, 'linen');
  const giftRule = getPlannerRule(settings, 'giftCard');
  const guestRule = getPlannerRule(settings, 'singleGuest');
  const doubleRule = getPlannerRule(settings, 'doubleOrTwoSingles');
  const appliesDoubleOrTwoSingles =
    doubleRule.enabled &&
    isVerdejoBedListing(listingId) &&
    !isPropertyExcluded(doubleRule, listingId);

  if (appliesDoubleOrTwoSingles) {
    if (
      overrides?.linen === undefined &&
      !isVerdejoLinenValue(linen) &&
      !linen
    ) {
      if (guests === 1) {
        linen = LINEN_VALUES.DOUBLE;
      }
    }
    if (!isVerdejoLinenValue(linen)) {
      warnings.push('double_or_two_singles_ask');
    }
  } else if (linenRule.enabled) {
    if (isPropertyExcluded(linenRule, listingId) && !isSofaLinenValue(linen)) {
      linen = LINEN_VALUES.NA;
    } else if (overrides?.linen === undefined && !linen) {
      if (guests === 1) {
        linen = LINEN_VALUES.NO;
      } else if (guests >= 3) {
        linen = LINEN_VALUES.YES;
      }
    }
    if (!isSofaLinenValue(linen)) {
      warnings.push('linen_ask_guest');
    }
  }

  if (giftRule.enabled) {
    if (isPropertyExcluded(giftRule, listingId)) {
      giftCard = GIFT_CARD_OFF;
      giftCardOn = false;
    } else {
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
  }

  if (
    guestRule.enabled &&
    !isPropertyExcluded(guestRule, listingId) &&
    guests === 1 &&
    !dismissedWarnings.includes('single_guest')
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
    dismissedWarnings,
  };
};

export const plannerFieldsChanged = (
  current: BookingPlannerItem,
  next: PlannerFieldPatch,
) =>
  asString(current.Linen) !== next.linen ||
  asString(current.GiftCard) !== next.giftCard ||
  asString(current.EarlyCheckIn) !== next.earlyCheckIn ||
  asString(current.Access) !== next.access ||
  asBoolean(current.GiftCardOn) !== next.giftCardOn;
